import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export type MemoryType = 'voice' | 'style' | 'hook' | 'structure' | 'do' | 'dont';

/** Reusable brand voice/style/pattern fed into agent prompts. */
@Entity('cs_brand_memories')
export class BrandMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'varchar', length: 30 })
  memoryType: MemoryType;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, default: 1 })
  weight: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
