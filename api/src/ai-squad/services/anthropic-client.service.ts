import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeJsonResult {
  /** Response text with any ```json fences stripped — ready for JSON.parse. */
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

/** Anthropic client for the entire AI Squad pipeline. */
@Injectable()
export class AnthropicClientService {
  private readonly logger = new Logger(AnthropicClientService.name);
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('aiSquad.anthropic.apiKey');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI Squad generation disabled');
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
      this.config.get<string>('aiSquad.anthropic.writeModel') ?? 'claude-sonnet-4-6';

    const resp = await this.client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.7,
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

  /** USD per 1M tokens [input, output]. */
  cost(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
    const rates: Record<string, [number, number]> = {
      'claude-sonnet-4-6': [3, 15],
      'claude-opus-4-7': [15, 75],
      'claude-haiku-4-5-20251001': [1, 5],
    };
    const [inR, outR] = rates[model] ?? rates['claude-sonnet-4-6'];
    return (usage.prompt_tokens / 1_000_000) * inR + (usage.completion_tokens / 1_000_000) * outR;
  }

  private stripFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
  }
}
