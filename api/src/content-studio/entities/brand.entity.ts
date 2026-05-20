import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('cs_brands')
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Index()
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  voiceStyle: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  colorPrimary: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  colorSecondary: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Per-brand model overrides — { [task]: modelId }. Wins over env / tier
   * defaults. Tasks: strategy / script / ppt / seo / thumbnail / promo /
   * quiz / quiz_validator / grader. Empty object = no overrides.
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  modelOverrides: Record<string, string>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
