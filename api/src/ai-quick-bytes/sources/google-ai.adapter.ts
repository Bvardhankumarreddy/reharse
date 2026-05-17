import { Injectable } from '@nestjs/common';
import { RssBaseAdapter } from './rss-base.adapter';

@Injectable()
export class GoogleAIAdapter extends RssBaseAdapter {
  protected feedUrl = 'https://blog.google/technology/ai/rss/';
  constructor() { super('Google AI Blog'); }
}
