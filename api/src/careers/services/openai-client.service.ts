import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/** OpenAI client for careers embeddings (job descriptions + resumes). */
@Injectable()
export class CareersOpenAIClientService {
  private readonly logger = new Logger(CareersOpenAIClientService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('careers.openai.apiKey');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — careers embeddings disabled');
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
