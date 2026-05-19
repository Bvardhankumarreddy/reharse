import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { RawJob, htmlToText } from './types';

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  employmentType?: string;
  publishedDate?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

/**
 * Ashby public job-board API — no key:
 *   https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
 */
@Injectable()
export class AshbyAdapter {
  async fetch(boardToken: string, company: string): Promise<RawJob[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
      boardToken,
    )}?includeCompensation=true`;
    const { data } = await axios.get<{ jobs: AshbyJob[] }>(url, {
      timeout: 30000,
    });
    return (data.jobs ?? []).map((j) => ({
      externalId: j.id,
      title: j.title,
      company,
      location: j.location ?? null,
      remote: !!j.isRemote || /remote/i.test(j.location ?? ''),
      description: j.descriptionPlain?.slice(0, 12000) ?? htmlToText(j.descriptionHtml),
      applyUrl: j.applyUrl ?? j.jobUrl ?? '',
      postedAt: j.publishedDate ? new Date(j.publishedDate) : null,
      employmentType: j.employmentType ?? null,
    }));
  }
}
