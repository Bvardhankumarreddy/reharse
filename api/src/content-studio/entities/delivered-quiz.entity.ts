import {
  Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

/** The 9 questions drawn for one Saturday quiz (4 easy + 3 med + 2 hard). */
@Entity('cs_delivered_quizzes')
export class DeliveredQuiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  planId: string | null;

  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'date' })
  weekOf: string;

  /** Ordered array of QuestionPool ids in draw order. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  questionIds: string[];

  /** S3 keys when uploaded — currently unused (XLSX rendered on demand). */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  publicXlsxKey: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  privateXlsxKey: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
