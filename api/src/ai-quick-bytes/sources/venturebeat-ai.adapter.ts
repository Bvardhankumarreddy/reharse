import { Injectable } from '@nestjs/common';
import { RssBaseAdapter } from './rss-base.adapter';

@Injectable()
export class VentureBeatAIAdapter extends RssBaseAdapter {
  protected feedUrl = 'https://venturebeat.com/category/ai/feed/';
  constructor() { super('VentureBeat AI'); }
}
