import {
  Entity, PrimaryColumn, Column, Index, CreateDateColumn,
} from 'typeorm';

export type CharacterCategory =
  | 'ai_brands'         // Claude, GPT-5, Gemini, Llama, Cursor, Copilot, …
  | 'real_people'       // Sam Altman, Sundar Pichai, Demis Hassabis, …
  | 'organizations'     // OpenAI-as-character, Google-G, EU, RBI, FDA, …
  | 'indian_archetypes' // Sharma-ji-ka-beta, UPSC aspirant, kirana uncle, …
  | 'concept_objects';  // deepfake, regulation, layoff-notice, exam, AI agent, …

export type CharacterSource = 'seed' | 'auto_generated' | 'manual';

/**
 * Shared character dictionary — one row per recurring cartoon character
 * the scene generator can pull from. The point: when a news item mentions
 * Sam Altman, the SAME cartoon Sam Altman appears across every script
 * that references him, week after week. Channel identity compounds.
 *
 * Seeded from data/seed.ts at boot; unknown subjects mentioned in news
 * get auto-generated DNAs via the CharacterCastingService and saved here
 * (source = 'auto_generated') so the next appearance is consistent.
 */
@Entity('characters')
export class Character {
  /** Slug like "sam_altman" / "claude" / "eu_regulation". */
  @PrimaryColumn({ type: 'varchar', length: 80 })
  slug: string;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  category: CharacterCategory;

  @Column({ type: 'varchar', length: 200 })
  display_name: string;

  /** 2-3 sentence cartoon spec — pasted verbatim into scene's character_dna. */
  @Column({ type: 'text' })
  visual_dna: string;

  /** 1 sentence — what this character is usually doing in scenes. */
  @Column({ type: 'text', nullable: true })
  signature_action: string | null;

  /** 1 line — personality cue for the script writer's voice. */
  @Column({ type: 'text', nullable: true })
  personality: string | null;

  /** Comma-separated colour hints. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  mood_palette: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'auto_generated' })
  source: CharacterSource;

  @CreateDateColumn()
  createdAt: Date;
}
