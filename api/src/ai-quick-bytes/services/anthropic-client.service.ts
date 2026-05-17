import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeJsonResult {
  /** Response text with any ```json fences stripped — ready for JSON.parse. */
  content: string;
  /** OpenAI-shaped usage so callers' existing cost helpers work unchanged. */
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

/**
 * Anthropic client for the AI Quick Bytes writing steps (script, thumbnail
 * prompt, distribution package). Scoring + embeddings stay on OpenAI.
 */
@Injectable()
export class AnthropicClientService {
  private readonly logger = new Logger(AnthropicClientService.name);
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('aiQuickBytes.anthropic.apiKey');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('ANTHROPIC_API_KEY not set — AI Quick Bytes writing steps disabled');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Run a system+user prompt expecting a STRICT-JSON reply. Claude has no
   * response_format=json, so we instruct it in the prompt (the callers
   * already do) and defensively strip code fences before returning.
   */
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
      this.config.get<string>('aiQuickBytes.anthropic.writeModel') ?? 'claude-sonnet-4-6';

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

  /** Claude sometimes wraps JSON in ```json … ``` — remove it. */
  private stripFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
  }
}
