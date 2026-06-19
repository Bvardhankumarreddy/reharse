import {
  BadRequestException,
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { AqbQuoteLanguage } from '../entities/aqb-quote.entity';
import { QuoteBankService, QuoteSuggestion } from '../services/quote-bank.service';

@Controller('admin/ai-quick-bytes/quotes')
@UseGuards(AdminGuard)
export class AqbQuotesController {
  constructor(private readonly bank: QuoteBankService) {}

  /** Paginated list with optional language / active / search filters. */
  @Get()
  async list(
    @Query('language') language?: string,
    @Query('active')   active?:   string,
    @Query('search')   search?:   string,
    @Query('page')     page?:     string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bank.list({
      language: language === 'te' || language === 'en' ? (language as AqbQuoteLanguage) : undefined,
      active:   active === 'true' ? true : active === 'false' ? false : undefined,
      search:   search?.trim() || undefined,
      page:     page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** Add a single quote manually. */
  @Post()
  async create(@Body() body: {
    language: AqbQuoteLanguage;
    text:     string;
    author:   string;
    source?:  string;
    themes?:  string[];
  }) {
    if (body.language !== 'en' && body.language !== 'te') {
      throw new BadRequestException('language must be en or te');
    }
    return this.bank.create(body);
  }

  /** Bulk insert from the "Suggest" approval flow. */
  @Post('bulk')
  async bulk(@Body() body: {
    language: AqbQuoteLanguage;
    quotes:   QuoteSuggestion[];
  }) {
    if (body.language !== 'en' && body.language !== 'te') {
      throw new BadRequestException('language must be en or te');
    }
    return this.bank.createMany(body.language, body.quotes ?? []);
  }

  /** Ask Claude to draft N quote candidates — NOT saved. */
  @Post('suggest')
  async suggest(@Body() body: {
    language:    AqbQuoteLanguage;
    count?:      number;
    themesHint?: string[];
  }) {
    if (body.language !== 'en' && body.language !== 'te') {
      throw new BadRequestException('language must be en or te');
    }
    const quotes = await this.bank.suggest({
      language:   body.language,
      count:      body.count,
      themesHint: body.themesHint,
    });
    return { quotes };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() patch: {
      text?: string; author?: string; source?: string | null;
      themes?: string[]; isActive?: boolean;
    },
  ) {
    return this.bank.update(id, patch);
  }

  /** Soft-retire (is_active=false). Old scripts still reference it. */
  @Delete(':id')
  async retire(@Param('id') id: string) {
    return this.bank.retire(id);
  }
}
