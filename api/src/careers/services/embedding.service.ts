import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JobListing } from '../entities/job-listing.entity';
import { CareersOpenAIClientService } from './openai-client.service';

export interface VectorCandidate {
  id: string;
  similarity: number;
}

/** Embedding generation + pgvector read/write (TypeORM has no vector type). */
@Injectable()
export class CareersEmbeddingService {
  private readonly logger = new Logger(CareersEmbeddingService.name);

  constructor(
    @InjectRepository(JobListing)
    private readonly jobRepo: Repository<JobListing>,
    private readonly openai: CareersOpenAIClientService,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.openai.isConfigured();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const model =
      this.config.get<string>('careers.openai.embeddingModel') ??
      'text-embedding-3-small';
    const res = await this.openai.getClient().embeddings.create({
      model,
      input: text.slice(0, 8000),
    });
    return res.data[0].embedding;
  }

  async storeJobEmbedding(jobId: string, embedding: number[]): Promise<void> {
    const literal = `[${embedding.join(',')}]`;
    await this.jobRepo.query(
      `UPDATE career_job_listings SET embedding = $1::vector WHERE id = $2`,
      [literal, jobId],
    );
  }

  /**
   * Top-K active, fresh listings by cosine similarity to the given embedding.
   * Returns ids + similarity (1 - cosine distance), best first.
   */
  async nearestJobs(
    embedding: number[],
    limit: number,
    freshnessDays: number,
  ): Promise<VectorCandidate[]> {
    const literal = `[${embedding.join(',')}]`;
    const rows: Array<{ id: string; similarity: string }> =
      await this.jobRepo.query(
        `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
           FROM career_job_listings
          WHERE embedding IS NOT NULL
            AND status = 'active'
            AND ("postedAt" IS NULL OR "postedAt" > NOW() - ($2 || ' days')::interval)
          ORDER BY embedding <=> $1::vector
          LIMIT $3`,
        [literal, String(freshnessDays), limit],
      );
    return rows.map((r) => ({ id: r.id, similarity: Number(r.similarity) }));
  }
}
