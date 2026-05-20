import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from '../entities/brand.entity';
import { Lesson } from '../entities/lesson.entity';
import { WeeklyContentPlan } from '../entities/weekly-content-plan.entity';
import { PublishedVideo } from '../entities/published-video.entity';
import { ModelRouterService } from '../services/model-router.service';
import { BrandMemoryService } from '../services/brand-memory.service';
import {
  YouTubeCommentService, YtComment,
} from '../services/youtube-comment.service';
import { SpamDetectionService, SpamVerdict } from '../services/spam-detection.service';

const REPLY_SYSTEM = `
You draft ONE reply to a YouTube comment, in the brand's voice. Replies
should be warm but specific — never generic ("thanks!" alone is useless).
If the comment asks a question, answer it; if it pushes back, acknowledge
and engage; if it praises, accept gracefully and add a relevant nudge.

Length: 1–3 short sentences. No "AI"-y openers ("Great question!"). No
emojis unless the original used one. No "check our channel" promo lines.
Honour the brand voice/style/do/don't memories verbatim.

Output STRICT JSON: {"reply":"<the reply>"}.
`.trim();

export interface CommentDraft {
  comment: YtComment;
  spam: SpamVerdict;
  suggestedReply: string | null;
}

/**
 * Phase D / D4 — for a published lesson, fetch recent comments,
 * spam-filter each, and (for non-spam) draft a reply in the brand's voice.
 * Returns drafts as JSON; admin reviews + posts via POST .../reply.
 *
 * Listing comments needs CS_YT_API_KEY (read-only).
 * Posting replies needs OAuth (dormant).
 */
@Injectable()
export class CommentReplyAgent {
  private readonly logger = new Logger(CommentReplyAgent.name);

  constructor(
    @InjectRepository(Brand) private readonly brandRepo: Repository<Brand>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(WeeklyContentPlan) private readonly planRepo: Repository<WeeklyContentPlan>,
    @InjectRepository(PublishedVideo) private readonly publishedRepo: Repository<PublishedVideo>,
    private readonly comments: YouTubeCommentService,
    private readonly spam: SpamDetectionService,
    private readonly router: ModelRouterService,
    private readonly memories: BrandMemoryService,
  ) {}

  async draftFor(lessonId: string, limit = 25): Promise<{
    drafts: CommentDraft[];
    canPostReplies: boolean;
  }> {
    if (!this.comments.canRead()) {
      throw new BadRequestException(
        'CS_YT_API_KEY not set — cannot read YouTube comments',
      );
    }
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    const pub = await this.publishedRepo.findOne({ where: { lessonId } });
    if (!pub?.youtubeVideoId) {
      throw new BadRequestException(
        'Lesson is not published to YouTube yet — no comments to draft against',
      );
    }
    const plan = await this.planRepo.findOne({ where: { id: lesson.planId } });
    const brand = plan
      ? await this.brandRepo.findOne({ where: { id: plan.brandId } })
      : null;
    if (!brand) throw new BadRequestException('Could not resolve brand');

    const memories = await this.memories.relevantFor(brand.id, 'promo'); // closest match for tone
    const memoryBlock = this.memories.format(memories);

    const comments = await this.comments.listTopLevel(pub.youtubeVideoId, limit);
    const drafts: CommentDraft[] = [];

    for (const c of comments) {
      const verdict = await this.spam.classify(c.textOriginal);
      let suggested: string | null = null;
      if (!verdict.isSpam) {
        try {
          const r = await this.router.run({
            task: 'grader',          // cheap tier; one reply is small
            agentType: 'promo',
            modelOverride: brand.modelOverrides?.grader,
            jsonOutput: true,
            maxTokens: 300,
            temperature: 0.5,
            system: REPLY_SYSTEM,
            user:
              `BRAND: ${brand.name}\nVoice: ${brand.voiceStyle ?? ''}\n\n` +
              `LESSON: ${lesson.title}\nHook: ${lesson.hook ?? ''}\n\n` +
              `COMMENT BY ${c.authorDisplayName}:\n${c.textOriginal}\n\n` +
              `BRAND MEMORIES:\n${memoryBlock}\n\n` +
              `Return {"reply":"..."} only.`,
          });
          const parsed = JSON.parse(r.text || '{}') as { reply?: string };
          suggested = parsed.reply?.trim().slice(0, 800) || null;
        } catch (e) {
          this.logger.warn(`Reply draft failed for ${c.id}: ${(e as Error).message}`);
        }
      }
      drafts.push({ comment: c, spam: verdict, suggestedReply: suggested });
    }
    this.logger.log(
      `Drafted ${drafts.length} comment replies for lesson "${lesson.title}" ` +
      `(spam-flagged: ${drafts.filter((d) => d.spam.isSpam).length})`,
    );
    return { drafts, canPostReplies: this.comments.canWrite() };
  }

  /** OAuth-only path: post an admin-approved reply to YouTube. */
  async postReply(parentCommentId: string, text: string) {
    if (!this.comments.canWrite()) {
      throw new BadRequestException('YouTube OAuth not configured — cannot post replies');
    }
    if (!text?.trim()) throw new BadRequestException('reply text required');
    return this.comments.postReply(parentCommentId, text.trim().slice(0, 4000));
  }
}
