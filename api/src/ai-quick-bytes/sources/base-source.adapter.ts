import { Logger } from '@nestjs/common';

export interface RawNewsItem {
  title: string;
  url: string;
  content?: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export abstract class BaseSourceAdapter {
  protected readonly logger: Logger;

  /** Must match the `name` column in aqb_news_sources for adapter routing. */
  constructor(public readonly sourceName: string) {
    this.logger = new Logger(`AQB:Source:${sourceName}`);
  }

  abstract fetch(): Promise<RawNewsItem[]>;

  protected handleError(error: unknown): RawNewsItem[] {
    const e = error as Error;
    this.logger.error(`Fetch failed: ${e.message}`, e.stack);
    return [];
  }
}
