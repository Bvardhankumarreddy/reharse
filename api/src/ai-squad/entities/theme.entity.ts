import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type ThemeCategory = 'fundamentals' | 'ethics' | 'tools' | 'future' | 'debate';

@Entity('ai_squad_themes')
export class Theme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  category: ThemeCategory | null;

  @Column({ type: 'varchar', length: 100, default: 'general' })
  targetAudience: string;

  @Column({ type: 'int', default: 10 })
  estimatedTopicsCount: number;

  @Column({ type: 'boolean', default: true })
  llmGenerated: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 6, default: 0 })
  generationCostUsd: number;

  @Index()
  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'archived';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
