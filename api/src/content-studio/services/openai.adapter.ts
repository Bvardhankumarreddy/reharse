import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmRequest, LlmResult, ProviderAdapter } from './provider.types';

@Injectable()
export class OpenAIAdapter implements ProviderAdapter {
  readonly name = 'openai' as const;
  private readonly logger = new Logger(OpenAIAdapter.name);
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('contentStudio.openai.apiKey');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — OpenAI adapter disabled');
    }
  }

  supports(model: string): boolean {
    return !/^claude/i.test(model);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    if (!this.client) throw new Error('OpenAI not configured');
    const res = await this.client.chat.completions.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4000,
      temperature: req.temperature ?? 0.7,
      ...(req.jsonOutput ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      model: res.model ?? req.model,
    };
  }
}
