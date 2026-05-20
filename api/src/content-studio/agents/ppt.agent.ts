import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { BrandMemory } from '../entities/brand-memory.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { Lesson } from '../entities/lesson.entity';
import { ContentAsset } from '../entities/content-asset.entity';
import { ModelRouterService } from '../services/model-router.service';
import { PptxRendererService, SlideJson } from '../services/pptx-renderer.service';

const SYSTEM = `
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

interface PptJson { slides?: SlideJson[] }

@Injectable()
export class PptAgent {
  private readonly logger = new Logger(PptAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(BrandMemory) private readonly memoryRepo: Repository<BrandMemory>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(ContentAsset) private readonly assetRepo: Repository<ContentAsset>,
    private readonly router: ModelRouterService,
    private readonly renderer: PptxRendererService,
  ) {}

  async generatePpt(lessonId: string): Promise<ContentAsset> {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const memories = await this.memoryRepo.find({
      where: { brandId: brand.id, isActive: true },
      order: { weight: 'DESC' },
    });
    const memoryBlock = memories.length
      ? memories.map((m) => `- [${m.memoryType}] ${m.content}`).join('\n')
      : '(no brand memories yet)';

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

    const result = await this.router.run({
      task: 'ppt',
      agentType: 'ppt',
      planId: plan.id,
      lessonId: lesson.id,
      jsonOutput: true,
      maxTokens: 4000,
      temperature: 0.5,
      system: SYSTEM,
      user:
        `BRAND: ${brand.name}\n` +
        `Voice/style: ${brand.voiceStyle ?? ''}\n\n` +
        `WEEK THEME: ${plan.theme ?? '(none)'}\n` +
        `QUIZ SCOPE: ${plan.quizScope ?? '(none)'}\n\n` +
        `LESSON ${lesson.lessonNumber}: ${lesson.title}\n` +
        `Hook: ${lesson.hook ?? '(none)'}\n` +
        `Outline:\n${outlineBlock || '  (no outline)'}\n\n` +
        (scriptText
          ? `LESSON AUDIO SCRIPT (mine real names/numbers from this):\n${scriptText.slice(0, 8000)}\n\n`
          : `(No script yet — work from the outline.)\n\n`) +
        `BRAND MEMORIES (obey verbatim):\n${memoryBlock}\n\n` +
        `Output the JSON object only. Exactly 13 slides in the fixed order.`,
    });

    const parsed = JSON.parse(result.text || '{}') as PptJson;
    const slides = (parsed.slides ?? []).slice(0, 13);
    if (slides.length < 13) {
      throw new Error(`PPT agent returned ${slides.length} slides, expected 13`);
    }

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
          model: result.model,
          provider: result.provider,
          costUsd: result.costUsd,
        },
        status: 'draft',
      }),
    );

    await this.planRepo.update(plan.id, {
      totalCostUsd: Number(plan.totalCostUsd ?? 0) + result.costUsd,
    });

    this.logger.log(
      `PPT v${asset.version} for lesson "${lesson.title}" — ` +
      `${slides.length} slides ($${result.costUsd.toFixed(4)}, ${result.model})`,
    );
    return asset;
  }

  async latestPpt(lessonId: string): Promise<ContentAsset | null> {
    return this.assetRepo.findOne({
      where: { lessonId, assetType: 'ppt' },
      order: { version: 'DESC' },
    });
  }

  /** Render the latest PPT asset to a .pptx Buffer with brand colours. */
  async renderLatest(lessonId: string): Promise<{ buf: Buffer; filename: string }> {
    const asset = await this.latestPpt(lessonId);
    if (!asset) throw new NotFoundException('No slides generated yet for this lesson');
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    if (!plan) throw new BadRequestException('Lesson has no plan');
    const brand = await this.brandRepo.findOne({ where: { id: plan.brandId } });
    if (!brand) throw new BadRequestException('Plan has no brand');

    const slides =
      ((asset.content as { slides?: SlideJson[] } | null)?.slides ?? []);
    const buf = await this.renderer.render(slides, brand);
    const slug = (lesson.title || `lesson-${lesson.lessonNumber}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return {
      buf,
      filename: `lesson-${lesson.lessonNumber}-${slug}.pptx`,
    };
  }
}
