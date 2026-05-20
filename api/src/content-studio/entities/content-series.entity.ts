import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type SeriesStatus = 'planning' | 'active' | 'completed' | 'paused';

export type LessonFormat =
  | 'lecture' | 'live_coding' | 'walkthrough' | 'interview' | 'short';

export interface SeriesWeekArc {
  weekIndex: number;              // 1-based
  plannedTheme: string;
  plannedHook: string;
  plannedFocus: string;            // what this specific week teaches
  plannedLessonFormats: LessonFormat[]; // typical length 1-2
}

@Entity('cs_content_series')
export class ContentSeries {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  brandId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  goal: string | null;

  @Column({ type: 'int', default: 4 })
  targetWeeks: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  topicArc: SeriesWeekArc[];

  @Column({ type: 'int', default: 0 })
  currentWeek: number;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'planning' })
  status: SeriesStatus;

  @Column({ type: 'date', nullable: true })
  startWeekOf: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const LESSON_FORMATS: LessonFormat[] = [
  'lecture', 'live_coding', 'walkthrough', 'interview', 'short',
];

export function isLessonFormat(v: string): v is LessonFormat {
  return (LESSON_FORMATS as string[]).includes(v);
}
