import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AgentRun, AgentType } from '../entities/agent-run.entity';
import { MODEL_PRICING } from '../config/content-studio.config';
import { OpenAIAdapter } from './openai.adapter';
import { AnthropicAdapter } from './anthropic.adapter';
import { GeminiAdapter } from './gemini.adapter';
import {
  LlmResult, ProviderAdapter, ProviderName, providerForModel,
} from './provider.types';

type Task =
  | 'strategy' | 'script' | 'ppt' | 'quiz' | 'seo' | 'thumbnail' | 'promo'
  | 'quiz_validator' | 'grader';

export interface RouterRequest {
  task: Task;
  agentType: AgentType;
  system: string;
  user: string;
  jsonOutput?: boolean;
  maxTokens?: number;
  temperature?: number;
  planId?: string | null;
  lessonId?: string | null;
  /**
   * Skip any model belonging to this provider. Used by the quiz validator
   * to guarantee it never runs on the same provider that wrote the question.
   */
  excludeProvider?: ProviderName;
  /**
   * Per-call model override — wins over env / tier defaults. Used by every
   * agent to apply `brand.modelOverrides[task]` (Phase C / Slice C1).
   */
  modelOverride?: string;
}

export interface RouterResult {
  text: string;
  model: string;
  provider: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

const FALLBACK_MODEL: Record<string, string> = {
  anthropic: 'gpt-4o-mini',
  openai:    'claude-sonnet-4-6',
  gemini:    'claude-sonnet-4-6',
};

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);
  private readonly adapters: ProviderAdapter[];

  constructor(
    @InjectRepository(AgentRun) private readonly runRepo: Repository<AgentRun>,
    private readonly config: ConfigService,
    openai: OpenAIAdapter,
    anthropic: AnthropicAdapter,
    gemini: GeminiAdapter,
  ) {
    this.adapters = [openai, anthropic, gemini];
  }

  private adapterFor(model: string): ProviderAdapter | undefined {
    return this.adapters.find((a) => a.supports(model) && a.isConfigured());
  }

  private cost(model: string, inTok: number, outTok: number): number {
    const p = MODEL_PRICING[model];
    if (!p) {
      this.logger.warn(`No pricing for model "${model}" — cost recorded as 0`);
      return 0;
    }
    return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
  }

  /** Throw if the plan or this month has already burned its budget. */
  async assertWithinBudget(planId?: string | null): Promise<void> {
    const perMonth = this.config.get<number>('contentStudio.budgets.perMonthUsd') ?? 100;
    const monthRow = await this.runRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r."costUsd"), 0)', 'sum')
      .where(`r."createdAt" >= date_trunc('month', NOW())`)
      .getRawOne<{ sum: string }>();
    if (Number(monthRow?.sum ?? 0) >= perMonth) {
      throw new BadRequestException(
        `Content Studio monthly budget ($${perMonth}) reached — paused.`,
      );
    }
    if (planId) {
      const perPlan = this.config.get<number>('contentStudio.budgets.perPlanUsd') ?? 10;
      const planRow = await this.runRepo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r."costUsd"), 0)', 'sum')
        .where('r."planId" = :planId', { planId })
        .getRawOne<{ sum: string }>();
      if (Number(planRow?.sum ?? 0) >= perPlan) {
        throw new BadRequestException(
          `This plan's budget ($${perPlan}) reached — paused.`,
        );
      }
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, rej) =>
        setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms),
      ),
    ]);
  }

  /**
   * Route one call: primary model from config, retry once, then fall back to
   * the other provider. Every attempt's cost/outcome is recorded in
   * cs_agent_runs. Budget is checked before any spend.
   */
  async run(req: RouterRequest): Promise<RouterResult> {
    await this.assertWithinBudget(req.planId);

    let primaryModel =
      req.modelOverride?.trim() ||
      this.config.get<string>(`contentStudio.models.${req.task}`) ||
      'claude-sonnet-4-6';
    // Cross-provider enforcement: if the configured primary is on the
    // excluded provider, swap to that provider's fallback model.
    if (req.excludeProvider && providerForModel(primaryModel) === req.excludeProvider) {
      primaryModel = FALLBACK_MODEL[req.excludeProvider];
    }
    const fbModel = FALLBACK_MODEL[providerForModel(primaryModel)];
    const timeoutMs =
      this.config.get<number>(`contentStudio.timeouts.${req.task}`) ??
      this.config.get<number>('contentStudio.timeouts.default') ??
      90_000;

    const plan: Array<{ model: string; attempt: string }> = [
      { model: primaryModel, attempt: 'primary' },
      { model: primaryModel, attempt: 'retry' },
      { model: fbModel, attempt: 'fallback' },
    ].filter((s) => !req.excludeProvider || providerForModel(s.model) !== req.excludeProvider);

    let lastErr = '';
    for (const step of plan) {
      const adapter = this.adapterFor(step.model);
      if (!adapter) {
        lastErr = `no configured adapter for ${step.model}`;
        continue;
      }
      const started = Date.now();
      try {
        const r: LlmResult = await this.withTimeout(
          adapter.complete({
            model: step.model,
            system: req.system,
            user: req.user,
            jsonOutput: req.jsonOutput,
            maxTokens: req.maxTokens,
            temperature: req.temperature,
          }),
          timeoutMs,
        );
        const costUsd = this.cost(r.model, r.promptTokens, r.completionTokens);
        await this.record(req, adapter.name, r, costUsd, Date.now() - started, 'success', null);
        return {
          text: r.text,
          model: r.model,
          provider: adapter.name,
          costUsd,
          promptTokens: r.promptTokens,
          completionTokens: r.completionTokens,
        };
      } catch (e) {
        lastErr = (e as Error).message;
        this.logger.warn(
          `${req.agentType} ${step.attempt} (${step.model}) failed: ${lastErr}`,
        );
        await this.record(
          req, adapter.name, null, 0, Date.now() - started, 'failed', lastErr,
        );
      }
    }
    throw new Error(`All providers failed for ${req.agentType}: ${lastErr}`);
  }

  private async record(
    req: RouterRequest,
    provider: string,
    r: LlmResult | null,
    costUsd: number,
    durationMs: number,
    status: 'success' | 'failed',
    error: string | null,
  ): Promise<void> {
    await this.runRepo.save(
      this.runRepo.create({
        planId: req.planId ?? null,
        lessonId: req.lessonId ?? null,
        agentType: req.agentType,
        provider,
        model: r?.model ?? null,
        promptTokens: r?.promptTokens ?? 0,
        completionTokens: r?.completionTokens ?? 0,
        costUsd,
        durationMs,
        status,
        error,
      }),
    );
  }
}
