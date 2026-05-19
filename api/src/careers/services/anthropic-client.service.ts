import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeJsonResult {
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

/** Anthropic client for the careers rerank ("why this job fits you"). */
@Injectable()
export class CareersAnthropicClientService {
  private readonly logger = new Logger(CareersAnthropicClientService.name);
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('careers.anthropic.apiKey');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY not set — careers rerank disabled');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async completeJSON(opts: {
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<ClaudeJsonResult> {
    if (!this.client) {
      throw new Error('Anthropic client not configured (ANTHROPIC_API_KEY missing)');
    }
    const model =
      this.config.get<string>('careers.anthropic.rerankModel') ?? 'claude-sonnet-4-6';

    const resp = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.4,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return {
      content: this.stripFences(text),
      usage: {
        prompt_tokens: resp.usage.input_tokens,
        completion_tokens: resp.usage.output_tokens,
      },
      model,
    };
  }

  private stripFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
  }
}
