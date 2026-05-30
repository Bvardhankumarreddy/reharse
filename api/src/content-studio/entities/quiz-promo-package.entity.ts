import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  CreateDateColumn,
} from 'typeorm';

export interface QuizPromoYouTube {
  title: string;
  description: string;     // full description body (no hashtags yet)
  hashtags: string[];
  full_text: string;       // description with hashtags + footer appended
}
export interface QuizPromoLinkedIn {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  full_text: string;
}
export interface QuizPromoInstagram {
  caption: string;
  hashtags: string[];
  full_text: string;
}
export interface QuizPromoWhatsappChannel { full_text: string }
export interface QuizPromoWhatsappStatus  { full_text: string }
export interface QuizPromoLastChance      { full_text: string }

/** Subscribe + follow + repo links + lesson # + microsite URL. */
export interface QuizPromoSocialFooter {
  lines: string[];
  // Pre-joined string for one-tap copy — already \n-separated.
  block: string;
}

export interface QuizPromoLessonLink {
  lessonNumber: number;
  title: string;
  youtubeUrl: string | null;
}

export interface QuizPromoPayload {
  youtube_community?: QuizPromoYouTube;
  linkedin?:          QuizPromoLinkedIn;
  instagram?:         QuizPromoInstagram;
  whatsapp_channel?:  QuizPromoWhatsappChannel;
  whatsapp_status?:   QuizPromoWhatsappStatus;
  last_chance?:       QuizPromoLastChance;
  // Echo of the prompt context so the UI can show it without re-querying.
  lesson_links?:      QuizPromoLessonLink[];
  social_footer?:     QuizPromoSocialFooter;
  generated_at?:      string;
}

@Entity('cs_quiz_promo_packages')
export class QuizPromoPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'bundle_id', unique: true })
  bundleId: string;

  @Index()
  @Column({ type: 'uuid', name: 'plan_id' })
  planId: string;

  @Column({ type: 'uuid', name: 'brand_id' })
  brandId: string;

  @Column({ type: 'text', name: 'starts_at_label' })
  startsAtLabel: string;

  @Column({ type: 'text', name: 'ends_at_label' })
  endsAtLabel: string;

  @Column({ type: 'text', name: 'reward_label' })
  rewardLabel: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload: QuizPromoPayload;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'generator_model' })
  generatorModel: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, name: 'cost_usd', default: 0 })
  costUsd: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
