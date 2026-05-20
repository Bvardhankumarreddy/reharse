import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { ModelRouterService } from '../services/model-router.service';
import { ImprovementLoopService } from '../services/improvement-loop.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import { ProviderName } from '../services/provider.types';
import { PptxRendererService, SlideJson } from '../services/pptx-renderer.service';
import { LessonFormat } from '../entities/content-series.entity';

const SYSTEM_LECTURE = `
You design SLIDE CONTENT for a 13-slide educational presentation that
accompanies a YouTube lesson. Slides are shown on-screen while a host
narrates. Write concise, scannable slide text — NOT prose.

OUTPUT exactly 13 slides in this fixed order and layout:

 1. title           {"layout":"title","title":"<lesson title>","subtitle":"<one-line angle>"}
 2. hook            {"layout":"kicker","kicker":"THE HOOK","title":"<stakes, ≤12 words>","body":"<one supporting fact>"}
 3. why_it_matters  {"layout":"bullets","title":"Why this matters","bullets":["…","…"]}        (2–3 bullets)
 4. agenda          {"layout":"bullets","title":"What you'll learn","bullets":["…"]}           (3–5 bullets)
 5. concept_define  {"layout":"kicker","kicker":"DEFINITION","title":"<the concept>","body":"<one short sentence>"}
 6. concept_detail  {"layout":"bullets","title":"<concept aspect>","bullets":["…"]}            (3–5 bullets)
 7. real_example    {"layout":"kicker","kicker":"IN THE WILD","title":"<real company / tool>","body":"<one sentence WITH a real number>"}
 8. walkthrough_1   {"layout":"bullets","title":"Step 1 — <verb-led>","bullets":["…"]}         (3–5 bullets)
 9. walkthrough_2   {"layout":"bullets","title":"Step 2 — <verb-led>","bullets":["…"]}         (3–5 bullets)
10. mistake         {"layout":"kicker","kicker":"COMMON MISTAKE","title":"<the mistake>","body":"<the fix>"}
11. recap           {"layout":"bullets","title":"Recap","bullets":["…"]}                       (3–5 bullets)
12. quiz_tease      {"layout":"kicker","kicker":"SATURDAY QUIZ","title":"<the lure>","body":"<one sentence on the scope>"}
13. end_card        {"layout":"end","title":"<CTA — Subscribe + …>","subtitle":"<brand name>"}

RULES:
- Titles ≤ 60 chars. Bullets ≤ 90 chars each, MUST stand alone (no "we'll…", no "this is").
- Use real names / tools / numbers from the script if provided.
- Obey the brand voice/style/do/don't memories — verbatim.
- No markdown, no emoji, no quotation marks around values.

Return SINGLE JSON: {"slides":[ <exactly 13 objects in order> ]}. Nothing else.
`.trim();

const SYSTEM_INTERVIEW = `
You design SLIDES for a 5-slide deck that bookends a TWO-VOICE interview
video. Slides appear at the open and close, plus three "topic card"
slides between segments.

OUTPUT exactly 5 slides in this fixed order:

 1. title       {"layout":"title","title":"<interview topic>","subtitle":"with <guest hint, or 'a practitioner'>"}
 2. topic_1     {"layout":"kicker","kicker":"SEGMENT 1","title":"<first question, ≤12 words>","body":"<one-line setup>"}
 3. topic_2     {"layout":"kicker","kicker":"SEGMENT 2","title":"<second question>","body":"<one-line setup>"}
 4. quiz_tease  {"layout":"kicker","kicker":"SATURDAY QUIZ","title":"<the lure>","body":"<one sentence scope>"}
 5. end_card    {"layout":"end","title":"<CTA — Subscribe + …>","subtitle":"<brand name>"}

RULES:
- Titles ≤ 60 chars. Body ≤ 120 chars.
- Obey brand voice/style/do/don't memories — verbatim.
- No markdown, no emoji.

Return SINGLE JSON: {"slides":[ <exactly 5 objects> ]}. Nothing else.
`.trim();

interface PptJson { slides?: SlideJson[] }

/**
 * Per-format slide count expectation. Formats absent here skip PPT
 * generation entirely.
 */
const SLIDE_PROFILE: Partial<Record<LessonFormat, { count: number; system: string }>> = {
  lecture: { count: 13, system: SYSTEM_LECTURE },
  walkthrough: { count: 13, system: SYSTEM_LECTURE },
  interview: { count: 5, system: SYSTEM_INTERVIEW },
  // live_coding + short: no slide deck — host is on-screen the whole time.
};

@Injectable()
export class PptAgent {
  private readonly logger = new Logger(PptAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly loop: ImprovementLoopService,
    private readonly memories: BrandMemoryService,
    private readonly renderer: PptxRendererService,
  ) {}

  async generatePpt(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const fmt: LessonFormat = lesson.lessonFormat ?? 'lecture';
    const profile = SLIDE_PROFILE[fmt];
    if (!profile) {
      // Live coding / shorts: no deck. Record a placeholder so the pipeline
      // still completes the stage cleanly.
      const latest = await this.assetRepo.findOne({
        where: { lessonId, assetType: 'ppt' },
        order: { version: 'DESC' },
      });
      const asset = await this.assetRepo.save(
        this.assetRepo.create({
          planId: plan.id,
          lessonId: lesson.id,
          assetType: 'ppt',
          version: (latest?.version ?? 0) + 1,
          content: {
            skipped: true,
            reason: `lessonFormat=${fmt} — no slide deck for this format`,
            lessonFormat: fmt,
            costUsd: 0,
          },
          status: 'skipped',
        }),
      );
      this.logger.log(
        `PPT skipped for "${lesson.title}" — format=${fmt}`,
      );
      return asset;
    }

    const { count, system: SYSTEM } = profile;

    const memories = await this.memories.semanticRelevantFor(
      brand.id, 'ppt', `${lesson.title} ${lesson.hook ?? ''}`, 8,
    );
    const memoryBlock = this.memories.format(memories);

    const script = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'script' },
      order: { version: 'DESC' },
    });
    const scriptText =
      (script?.content as { fullScript?: string } | null | undefined)
        ?.fullScript ?? '';

    const outlineBlock = (lesson.outline ?? [])
      .map(
        (s, i) =>
          `  ${i + 1}. ${s.heading}\n` +
          (s.points ?? []).map((p) => `     - ${p}`).join('\n'),
      )
      .join('\n');

    const userBase =
      `BRAND: ${brand.name}\nVoice/style: ${brand.voiceStyle ?? ''}\n\n` +
      `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
      `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
      `LESSON ${lesson.lessonNumber}: ${lesson.title}\nFormat: ${fmt}\n` +
      `Hook: ${lesson.hook ?? '(none)'}\n` +
      `Outline:\n${outlineBlock || '  (no outline)'}\n\n` +
      (scriptText
        ? `LESSON SCRIPT (mine real names/numbers from this):\n${scriptText.slice(0, 8000)}\n\n`
        : `(No script yet — work from the outline.)\n\n`) +
      `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
      `Output the JSON object only. Exactly ${count} slides in the fixed order.`;

    const result = await this.loop.run<{ slides: SlideJson[] }>({
      agentType: 'ppt',
      planId: plan.id,
      lessonId: lesson.id,
      memoryCount: memories.length,
      graderModelOverride: brand.modelOverrides?.grader,
      context: `Lesson: ${lesson.title} (${fmt}) · Brand: ${brand.name}`,
      draftFn: async (critique) => {
        const user = critique
          ? `${userBase}\n\nREVISION REQUESTED — your previous slide JSON scored below the quality bar. Fix these:\n${critique}\nReturn the full ${count}-slide JSON only.`
          : userBase;
        const r = await this.router.run({
          task: 'ppt',
          agentType: 'ppt',
          planId: plan.id,
          lessonId: lesson.id,
          modelOverride: brand.modelOverrides?.ppt,
          jsonOutput: true,
          maxTokens: 4000,
          temperature: 0.5,
          system: SYSTEM,
          user,
        });
        const parsed = JSON.parse(r.text || '{}') as PptJson;
        const slides = (parsed.slides ?? []).slice(0, count);
        if (slides.length < count) {
          throw new Error(`PPT agent returned ${slides.length} slides, expected ${count}`);
        }
        return {
          parsed: { slides },
          rawForGrader: JSON.stringify({ slides }),
          model: r.model,
          provider: r.provider as ProviderName,
          costUsd: r.costUsd,
        };
      },
    });

    const slides = result.parsed.slides;
    const latest = await this.assetRepo.findOne({
      where: { lessonId, assetType: 'ppt' },
      order: { version: 'DESC' },
    });
    const asset = await this.assetRepo.save(
      this.assetRepo.create({
        planId: plan.id,
        lessonId: lesson.id,
        assetType: 'ppt',
        version: (latest?.version ?? 0) + 1,
        content: {
          slides,
          slideCount: slides.length,
          lessonFormat: fmt,
          model: result.model,
          provider: result.provider,
          costUsd: result.totalCostUsd,
        },
        qualityScore: result.qualityScore,
        revisions: result.revisions,
        critique: result.critique,
        confidence: result.confidence,
        status: 'draft',
      }),
    );

    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.totalCostUsd,
    });
    this.logger.log(
      `PPT v${asset.version} (${fmt}) for "${lesson.title}" — ${slides.length} slides, ` +
      `${result.revisions} revision(s), score ${result.qualityScore ?? 'n/a'} ` +
      `($${result.totalCostUsd.toFixed(4)})`,
    );
    return asset;
  }

  async latestPpt(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'ppt' },
      order: { version: 'DESC' },
    });
  }

  async renderLatest(lessonId: string): Promise<{ buf: Buffer; filename: string }> {
    const asset = await this.latestPpt(lessonId);
    if (!asset) throw new NotFoundException('No slides generated yet for this lesson');
    const content = (asset.content as { slides?: SlideJson[]; skipped?: boolean } | null);
    if (content?.skipped) {
      throw new BadRequestException('This lesson format has no slide deck');
    }
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const slides = content?.slides ?? [];
    const buf = await this.renderer.render(slides, brand);
    const slug = (lesson.title || `lesson-${lesson.lessonNumber}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return { buf, filename: `lesson-${lesson.lessonNumber}-${slug}.pptx` };
  }
}
