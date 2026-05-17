import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIClientService {
  private readonly logger = new Logger(OpenAIClientService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('aiQuickBytes.openai.apiKey');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — AI Quick Bytes LLM calls disabled');
    }
  }

  getClient(): OpenAI {
    if (!this.client) {
      throw new Error('OpenAI client not configured (OPENAI_API_KEY missing)');
    }
    return this.client;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }
}
