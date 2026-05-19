import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RawJob, htmlToText } from './types';

interface GhJob {
  id: number;
  title: string;
  updated_at: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  metadata?: unknown;
}

/**
 * Greenhouse public job-board API — no key:
 *   https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
 */
@Injectable()
export class GreenhouseAdapter {
  private readonly logger = new Logger(GreenhouseAdapter.name);

  async fetch(boardToken: string, company: string): Promise<RawJob[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
      boardToken,
    )}/jobs?content=true`;
    const { data } = await axios.get<{ jobs: GhJob[] }>(url, { timeout: 30000 });
    return (data.jobs ?? []).map((j) => {
      const loc = j.location?.name ?? null;
      return {
        externalId: String(j.id),
        title: j.title,
        company,
        location: loc,
        remote: /remote/i.test(loc ?? ''),
        description: htmlToText(j.content),
        applyUrl: j.absolute_url,
        postedAt: j.updated_at ? new Date(j.updated_at) : null,
      };
    });
  }
}
