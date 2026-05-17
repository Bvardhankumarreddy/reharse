import { Injectable } from '@nestjs/common';
import { RssBaseAdapter } from './rss-base.adapter';

@Injectable()
export class TheBatchAdapter extends RssBaseAdapter {
  protected feedUrl = 'https://www.deeplearning.ai/the-batch/feed/';
  constructor() { super('The Batch'); }
}
