import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { RawJob, htmlToText } from './types';

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  description?: string;
  workplaceType?: string;
}

/**
 * Lever public postings API — no key:
 *   https://api.lever.co/v0/postings/{token}?mode=json
 */
@Injectable()
export class LeverAdapter {
  async fetch(boardToken: string, company: string): Promise<RawJob[]> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
      boardToken,
    )}?mode=json`;
    const { data } = await axios.get<LeverPosting[]>(url, { timeout: 30000 });
    return (data ?? []).map((p) => {
      const loc = p.categories?.location ?? null;
      return {
        externalId: p.id,
        title: p.text,
        company,
        location: loc,
        remote:
          /remote/i.test(p.workplaceType ?? '') || /remote/i.test(loc ?? ''),
        description:
          p.descriptionPlain?.slice(0, 12000) ?? htmlToText(p.description),
        applyUrl: p.applyUrl ?? p.hostedUrl,
        postedAt: p.createdAt ? new Date(p.createdAt) : null,
        employmentType: p.categories?.commitment ?? null,
        metadata: { team: p.categories?.team },
      };
    });
  }
}
