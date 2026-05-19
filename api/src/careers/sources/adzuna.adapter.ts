import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RawJob, htmlToText } from './types';

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url: string;
  created?: string;
  contract_time?: string;
  contract_type?: string;
}

/**
 * Adzuna aggregator — DORMANT until CAREERS_ADZUNA_APP_ID + _APP_KEY are set
 * (free tier: https://developer.adzuna.com). Mirrors the HeyGen "built but
 * dormant until creds" pattern used elsewhere.
 */
@Injectable()
export class AdzunaAdapter {
  private readonly logger = new Logger(AdzunaAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return (
      !!this.config.get<string>('careers.adzuna.appId') &&
      !!this.config.get<string>('careers.adzuna.appKey')
    );
  }

  async fetch(extraQueries: string[] = []): Promise<RawJob[]> {
    if (!this.isConfigured()) return [];
    const appId = this.config.get<string>('careers.adzuna.appId')!;
    const appKey = this.config.get<string>('careers.adzuna.appKey')!;
    const country =
      this.config.get<string>('careers.adzuna.country') ?? 'in';
    const baseQueries =
      this.config.get<string[]>('careers.adzuna.queries') ?? [];
    const queries = Array.from(
      new Set([...baseQueries, ...extraQueries].map((q) => q.trim()).filter(Boolean)),
    ).slice(0, 12);

    const out: RawJob[] = [];
    for (const what of queries) {
      try {
        const url =
          `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
          `?app_id=${appId}&app_key=${appKey}` +
          `&results_per_page=50&what=${encodeURIComponent(what)}` +
          `&max_days_old=30&content-type=application/json`;
        const { data } = await axios.get<{ results: AdzunaResult[] }>(url, {
          timeout: 30000,
        });
        for (const r of data.results ?? []) {
          out.push({
            externalId: `adzuna:${r.id}`,
            title: r.title,
            company: r.company?.display_name ?? 'Unknown',
            location: r.location?.display_name ?? null,
            remote: /remote/i.test(r.location?.display_name ?? ''),
            description: htmlToText(r.description),
            applyUrl: r.redirect_url,
            postedAt: r.created ? new Date(r.created) : null,
            employmentType: r.contract_time ?? r.contract_type ?? null,
            metadata: { query: what },
          });
        }
      } catch (e) {
        this.logger.warn(`Adzuna query "${what}" failed: ${(e as Error).message}`);
      }
    }
    return out;
  }
}
