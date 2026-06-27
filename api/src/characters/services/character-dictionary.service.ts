import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character, CharacterCategory } from '../entities/character.entity';
import { CHARACTER_SEED, SHARED_CARTOON_BASE_STYLE, SeedCharacter } from '../data/seed';

/**
 * The point of this service: when news mentions Sam Altman, the SAME
 * cartoon Sam Altman shows up across every script that names him —
 * week after week. Channel identity compounds when characters recur.
 *
 *   - Seed entries (CHARACTER_SEED) upsert into the `characters` table
 *     on boot. Updating a seed entry → next pod cycle picks it up.
 *   - Unknown subjects mentioned in news get auto-generated DNAs via
 *     the casting service and saved here (source = 'auto_generated'),
 *     so the next appearance is consistent.
 *   - Aliases map alt names (e.g. "openai" → openai_org).
 */
@Injectable()
export class CharacterDictionaryService implements OnModuleInit {
  private readonly logger = new Logger(CharacterDictionaryService.name);

  /** alias slug → canonical slug; built once at boot from CHARACTER_SEED. */
  private aliasMap = new Map<string, string>();

  constructor(
    @InjectRepository(Character) private readonly repo: Repository<Character>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Alias map is built from in-memory CHARACTER_SEED — always works
    // even when the DB table doesn't exist yet (first deploy, pre-migration).
    this.buildAliasMap();
    // Seed is best-effort — must NOT crash the pod when the migration
    // is pending. Without seed, dictionary lookups return null and the
    // casting service soft-fails; script gen still runs (scene gen
    // throws an explicit error which the operator can act on).
    try {
      await this.seedIfMissing();
    } catch (e) {
      this.logger.warn(
        `Character seed skipped — table likely missing (run migration-001-characters.sql). ` +
        `Error: ${(e as Error).message}`,
      );
    }
  }

  /** Idempotent seed — upserts every CHARACTER_SEED row, only updates
   *  source='seed' rows (never overwrites operator-edited or
   *  auto_generated entries). Throws if the `characters` table doesn't
   *  exist; caller wraps in try/catch so boot survives a pending migration. */
  private async seedIfMissing(): Promise<void> {
    for (const s of CHARACTER_SEED) {
      const existing = await this.repo.findOne({ where: { slug: s.slug } });
      if (existing && existing.source !== 'seed') continue; // don't clobber auto/manual
      await this.repo.save(this.repo.create({
        slug:             s.slug,
        category:         s.category,
        display_name:     s.display_name,
        visual_dna:       s.visual_dna,
        signature_action: s.signature_action,
        personality:      s.personality,
        mood_palette:     s.mood_palette,
        source:           'seed',
      }));
    }
    this.logger.log(`Character dictionary seeded — ${CHARACTER_SEED.length} entries upserted.`);
  }

  private buildAliasMap(): void {
    this.aliasMap.clear();
    for (const s of CHARACTER_SEED) {
      this.aliasMap.set(s.slug, s.slug);
      for (const a of s.aliases ?? []) this.aliasMap.set(a, s.slug);
    }
  }

  /** Resolve any name the LLM might emit to the canonical slug, or null
   *  if it doesn't match a known character. Case-insensitive, ignores
   *  whitespace + hyphens (so "Sam Altman" / "sam-altman" / "sam_altman"
   *  all resolve). */
  resolve(name: string): string | null {
    if (!name) return null;
    const norm = name.toLowerCase().trim().replace(/[\s\-]+/g, '_');
    return this.aliasMap.get(norm) ?? null;
  }

  async findBySlug(slug: string): Promise<Character | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async findManyBySlugs(slugs: string[]): Promise<Character[]> {
    if (slugs.length === 0) return [];
    return this.repo
      .createQueryBuilder('c')
      .where('c.slug IN (:...slugs)', { slugs })
      .getMany();
  }

  /** Upsert an auto-generated character. Called by CharacterCastingService
   *  when the LLM proposes a brand-new character that wasn't in the seed. */
  async upsertAuto(input: {
    slug:             string;
    category:         CharacterCategory;
    display_name:     string;
    visual_dna:       string;
    signature_action?:string;
    personality?:     string;
    mood_palette?:    string;
  }): Promise<Character> {
    const existing = await this.repo.findOne({ where: { slug: input.slug } });
    if (existing) return existing; // never overwrite anything that exists
    return this.repo.save(this.repo.create({
      slug:             input.slug,
      category:         input.category,
      display_name:     input.display_name,
      visual_dna:       input.visual_dna,
      signature_action: input.signature_action ?? null,
      personality:      input.personality      ?? null,
      mood_palette:     input.mood_palette     ?? null,
      source:           'auto_generated',
    }));
  }

  /** Compose the character_dna string the scene generator pastes into
   *  every scene. Concatenates the cast's visual_dnas + the shared base
   *  style suffix. Cast must already be resolved to known characters.
   *
   *  Example output:
   *    [Sam Altman] cartoon caricature: 40-something man, short tousled…
   *    [EU Regulation] cartoon character: a stern but fair judge…
   *    SHARED STYLE: Cinematic universe style: flat 2D illustration… */
  composeCharacterDna(cast: Character[]): string {
    if (cast.length === 0) return SHARED_CARTOON_BASE_STYLE;
    const lines = cast.map((c) => `[${c.display_name}] ${c.visual_dna}`);
    return `${lines.join('\n')}\nSHARED STYLE: ${SHARED_CARTOON_BASE_STYLE}`;
  }
}

export { SeedCharacter };
