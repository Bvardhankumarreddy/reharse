import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type AqbQuoteLanguage = 'en' | 'te';

/**
 * Curated motivational quote injected at the closing of each AQB short
 * (just before the CTA). Seeded manually by the admin — Claude can
 * draft candidates via the "Suggest" endpoint but never auto-inserts;
 * misattribution risk is too high for an unattended pipeline.
 *
 * Pickup rotation lives in QuoteBankService.pickFor() — filters by
 * (language, is_active), prefers quotes not used in the last 30 days,
 * then asks an LLM to pick the best fit from a shortlist for the
 * specific story being scripted.
 */
@Entity('aqb_quotes')
@Index('idx_aqb_quotes_lang_active', ['language', 'isActive'])
@Index('idx_aqb_quotes_last_used',  ['lastUsedAt'])
export class AqbQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 8, default: 'en', name: 'language' })
  language: AqbQuoteLanguage;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'varchar', length: 255 })
  author: string;

  /** Book / speech / film / album the quote came from. Optional. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  source: string | null;

  /** Topic tags like ['perseverance','learning','innovation'] — used by
   *  the picker to match to a story's themes. */
  @Column({ type: 'text', array: true, default: '{}', name: 'themes' })
  themes: string[];

  @Column({ type: 'int', default: 0, name: 'times_used' })
  timesUsed: number;

  @Column({ type: 'timestamp', nullable: true, name: 'last_used_at' })
  lastUsedAt: Date | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
