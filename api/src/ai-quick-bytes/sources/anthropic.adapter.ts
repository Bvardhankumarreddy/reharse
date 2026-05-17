import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseSourceAdapter, RawNewsItem } from './base-source.adapter';

@Injectable()
export class AnthropicNewsAdapter extends BaseSourceAdapter {
  constructor() { super('Anthropic News'); }

  async fetch(): Promise<RawNewsItem[]> {
    try {
      const { data } = await axios.get<string>('https://www.anthropic.com/news', {
        headers: { 'User-Agent': 'AetherStackAI-NewsBot/1.0' },
        timeout: 30000,
      });

      const $ = cheerio.load(data);
      const items: RawNewsItem[] = [];

      $('article, .post-card, [data-component="post"]').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2, h3, [data-title]').first().text().trim();
        const link = $el.find('a').first().attr('href');
        const summary = $el.find('p, [data-summary]').first().text().trim();
        const dateStr = $el.find('time, [datetime]').first().attr('datetime');

        if (title && link) {
          items.push({
            title,
            url: link.startsWith('http') ? link : `https://www.anthropic.com${link}`,
            summary: summary || undefined,
            publishedAt: dateStr ? new Date(dateStr) : undefined,
          });
        }
      });

      // De-dupe within the page (cards can repeat across sections).
      const seen = new Set<string>();
      return items.filter((i) => {
        if (seen.has(i.url)) return false;
        seen.add(i.url);
        return true;
      });
    } catch (error) {
      return this.handleError(error);
    }
  }
}
