import { Injectable, Logger } from '@nestjs/common';
import { ModelRouterService } from './model-router.service';

const SYSTEM = `
You classify a single YouTube comment as spam or not spam, fast.

Spam = link farms, "check my channel", crypto pumps, scam giveaways,
copy-paste promotions, AI-generated filler, multi-emoji junk.
NOT spam = genuine reactions (positive or negative), questions, criticism,
debate, off-topic but human, even rude — as long as it's a real human
voice.

Be calibrated; many comments are NOT spam. Default to not-spam unless
clearly otherwise.

Output STRICT JSON ONLY:
{"isSpam":<bool>,"confidence":<0-1>,"reason":"<one short sentence>"}
`.trim();

export interface SpamVerdict {
  isSpam: boolean;
  confidence: number;
  reason: string;
}

@Injectable()
export class SpamDetectionService {
  private readonly logger = new Logger(SpamDetectionService.name);

  constructor(private readonly router: ModelRouterService) {}

  async classify(comment: string): Promise<SpamVerdict> {
    const result = await this.router.run({
      task: 'grader', // cheap, fast tier
      agentType: 'strategy', // cost ledger; not a content agent
      jsonOutput: true,
      maxTokens: 200,
      temperature: 0.0,
      system: SYSTEM,
      user: `COMMENT:\n${comment.slice(0, 2000)}\n\nClassify it. JSON only.`,
    });
    try {
      const j = JSON.parse(result.text || '{}') as Partial<SpamVerdict>;
      return {
        isSpam: !!j.isSpam,
        confidence: Math.max(0, Math.min(1, Number(j.confidence ?? 0))),
        reason: String(j.reason ?? '').slice(0, 240),
      };
    } catch (e) {
      this.logger.warn(`Spam JSON parse failed: ${(e as Error).message}`);
      return { isSpam: false, confidence: 0, reason: 'classifier output unparseable' };
    }
  }
}
