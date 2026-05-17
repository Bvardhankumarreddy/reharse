import { Injectable } from '@nestjs/common';
import { RssBaseAdapter } from './rss-base.adapter';

@Injectable()
export class OpenAIBlogAdapter extends RssBaseAdapter {
  protected feedUrl = 'https://openai.com/blog/rss.xml';
  constructor() { super('OpenAI Blog'); }
}
