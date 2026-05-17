import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { BaseSourceAdapter, RawNewsItem } from './base-source.adapter';

@Injectable()
export class ArxivAdapter extends BaseSourceAdapter {
  constructor() { super('ArXiv cs.AI'); }

  async fetch(): Promise<RawNewsItem[]> {
    try {
      const url =
        'http://export.arxiv.org/api/query?search_query=cat:cs.AI' +
        '&sortBy=submittedDate&sortOrder=descending&max_results=20';
      const { data } = await axios.get<string>(url, { timeout: 30000 });

      const $ = cheerio.load(data, { xmlMode: true });
      const items: RawNewsItem[] = [];

      $('entry').each((_, entry) => {
        const $entry = $(entry);
        const title = $entry.find('title').first().text().trim();
        const id = $entry.find('id').first().text().trim();
        if (!title || !id) return;
        items.push({
          title,
          url: id,
          summary: $entry.find('summary').first().text().trim(),
          author: $entry
            .find('author name')
            .map((_i, el) => $(el).text())
            .get()
            .join(', '),
          publishedAt: new Date($entry.find('published').first().text()),
        });
      });

      return items;
    } catch (error) {
      return this.handleError(error);
    }
  }
}
