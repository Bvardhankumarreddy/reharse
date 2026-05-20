import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  LlmRequest, LlmResult, ProviderAdapter, stripFences,
} from './provider.types';

@Injectable()
export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini' as const;
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly client: GoogleGenerativeAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('contentStudio.gemini.apiKey');
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    if (!this.client) {
      this.logger.warn('GEMINI_API_KEY not set — Gemini adapter disabled');
    }
  }

  supports(model: string): boolean {
    return /^gemini/i.test(model);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    if (!this.client) throw new Error('Gemini not configured');
    const model = this.client.getGenerativeModel({
      model: req.model,
      systemInstruction: req.system,
    });
    const resp = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 4000,
        temperature: req.temperature ?? 0.7,
        ...(req.jsonOutput ? { responseMimeType: 'application/json' } : {}),
      },
    });
    const text = resp.response.text();
    return {
      text: req.jsonOutput ? stripFences(text) : text,
      promptTokens: resp.response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: resp.response.usageMetadata?.candidatesTokenCount ?? 0,
      model: req.model,
    };
  }
}
