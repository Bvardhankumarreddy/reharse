import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/** Thin wrapper for OpenAI embeddings — used by pgvector memory retrieval. */
@Injectable()
export class OpenAIEmbeddingService {
  private readonly logger = new Logger(OpenAIEmbeddingService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('contentStudio.openai.apiKey');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = 'text-embedding-3-small';
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — content-studio embeddings disabled');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.client) return null;
    const res = await this.client.embeddings.create({
      model: this.model,
      input: text.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? null;
  }
}
