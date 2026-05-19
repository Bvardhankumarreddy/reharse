import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  LlmRequest, LlmResult, ProviderAdapter, stripFences,
} from './provider.types';

@Injectable()
export class AnthropicAdapter implements ProviderAdapter {
  readonly name = 'anthropic' as const;
  private readonly logger = new Logger(AnthropicAdapter.name);
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('contentStudio.anthropic.apiKey');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY not set — Anthropic adapter disabled');
    }
  }

  supports(model: string): boolean {
    return /^claude/i.test(model);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    if (!this.client) throw new Error('Anthropic not configured');
    const resp = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4000,
      temperature: req.temperature ?? 0.7,
      system: req.jsonOutput
        ? `${req.system}\n\nRespond with a single valid JSON object only — no prose, no code fences.`
        : req.system,
      messages: [{ role: 'user', content: req.user }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text: req.jsonOutput ? stripFences(text) : text,
      promptTokens: resp.usage.input_tokens,
      completionTokens: resp.usage.output_tokens,
      model: resp.model ?? req.model,
    };
  }
}
