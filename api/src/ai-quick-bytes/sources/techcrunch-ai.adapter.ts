import { Injectable } from '@nestjs/common';
import { RssBaseAdapter } from './rss-base.adapter';

@Injectable()
export class TechCrunchAIAdapter extends RssBaseAdapter {
  protected feedUrl = 'https://techcrunch.com/category/artificial-intelligence/feed/';
  constructor() { super('TechCrunch AI'); }
}
