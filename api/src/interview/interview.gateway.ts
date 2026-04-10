import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { InterviewStateService, type InterviewQuestion } from './interview-state.service';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';
import { QuestionsService } from '../questions/questions.service';
import { FeedbackService } from '../feedback/feedback.service';
import { QUEUES, FEEDBACK_JOBS } from '../jobs/queue.constants';

type UserAIHistory = Awaited<ReturnType<FeedbackService['getUserAIHistory']>>;

// ── Socket extension ──────────────────────────────────────────────────────────

type AuthenticatedSocket = Socket & {
  userId:    string;
  sessionId: string;
};

// ── Event catalogue (single source of truth shared with frontend) ─────────────

export const EVENTS = {
  // ── Server → Client ───────────────────────────────────────────────────────
  STATE_SYNC:        'interview:state_sync',
  QUESTION:          'interview:question',
  AI_TYPING:         'interview:ai_typing',
  AI_MESSAGE:        'interview:ai_message',
  HINT:              'interview:hint',
  TIMER_TICK:        'interview:timer_tick',
  TIMER_WARNING:     'interview:timer_warning',
  SESSION_PAUSED:    'interview:session_paused',
  SESSION_RESUMED:   'interview:session_resumed',
  SESSION_ENDED:     'interview:session_ended',
  FEEDBACK_READY:    'interview:feedback_ready',
  VOICE_TRANSCRIPT:  'interview:voice_transcript',
  PHASE_TRANSITION:  'interview:phase_transition',
  ERROR:             'interview:error',

  // ── Client → Server ───────────────────────────────────────────────────────
  START:            'interview:start',
  ANSWER_SUBMIT:    'interview:answer_submit',
  PASS_QUESTION:    'interview:pass_question',
  HINT_REQUEST:     'interview:hint_request',
  PAUSE:            'interview:pause',
  RESUME:           'interview:resume',
  END:              'interview:end_session',
  THINK_ALOUD:      'interview:think_aloud',
  VOICE_CHUNK:      'interview:voice_chunk',
  VOICE_END:        'interview:voice_end',
  COACH_MESSAGE:    'interview:coach_message',
} as const;

// ── Gateway ───────────────────────────────────────────────────────────────────

@WebSocketGateway({
  namespace: '/interview',
  // origin: true reflects the request's Origin header — required when credentials: true
  // (browsers reject wildcard '*' combined with credentials)
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 5 * 1024 * 1024,
})
export class InterviewGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger       = new Logger(InterviewGateway.name);
  private readonly timers       = new Map<string, ReturnType<typeof setInterval>>();
  /** Prefetched Q2 keyed by sessionId — consumed once in recordAndAdvance */
  private readonly prefetchedQ  = new Map<string, InterviewQuestion>();
  /** Cached user AI history keyed by sessionId — cleared when session ends */
  private readonly userHistoryCache = new Map<string, UserAIHistory>();

  constructor(
    private readonly config:     ConfigService,
    private readonly state:      InterviewStateService,
    private readonly sessions:   SessionsService,
    private readonly users:      UsersService,
    private readonly questions:  QuestionsService,
    private readonly feedback:   FeedbackService,
    @InjectQueue(QUEUES.FEEDBACK)
    private readonly feedbackQ: Queue,
  ) {}

  // ── Connection lifecycle ──────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const { userId, sessionId } = this.authenticate(client);
      (client as AuthenticatedSocket).userId    = userId;
      (client as AuthenticatedSocket).sessionId = sessionId;

      await client.join(`session:${sessionId}`);
      this.logger.log(`[WS] ${userId} joined session ${sessionId} (${client.id})`);

      // Fire-and-forget warmup so the AI engine container is hot before handleStart
      const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
      fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(5_000) }).catch(() => {});

      const existing = this.state.get(sessionId);
      if (existing) {
        client.emit(EVENTS.STATE_SYNC, this.buildStateSnapshot(sessionId));
      }
    } catch (err) {
      this.logger.warn(`[WS] Auth failed ${client.id}: ${(err as Error).message}`);
      client.emit(EVENTS.ERROR, { code: 'AUTH_FAILED', message: 'Authentication failed' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const ac = client as AuthenticatedSocket;
    if (ac.sessionId) {
      const s = this.state.get(ac.sessionId);
      if (s && s.status !== 'ended') {
        this.state.setParticipantStatus(ac.sessionId, 'disconnected');
      }
    }
    this.logger.log(`[WS] Disconnected ${client.id}`);
  }

  // ── Client → Server handlers ──────────────────────────────────────────────

  /**
   * START — generate only the first question from the AI engine.
   * Subsequent questions are generated adaptively in ANSWER_SUBMIT / PASS_QUESTION.
   */
  @SubscribeMessage(EVENTS.START)
  async handleStart(@ConnectedSocket() client: AuthenticatedSocket) {
    const { sessionId, userId } = client;
    if (!sessionId || !userId) throw new WsException('Not authenticated');

    // Skip if already running (reconnect)
    if (this.state.get(sessionId)) {
      const s = this.state.get(sessionId)!;
      const q = this.state.currentQuestion(sessionId);
      if (q) {
        client.emit(EVENTS.QUESTION, this.buildQuestionPayload(s, q));
      }
      return { ok: true };
    }

    // Load session from DB
    let session: Awaited<ReturnType<typeof this.sessions.findOne>>;
    try {
      session = await this.sessions.findOne(sessionId, userId);
    } catch {
      client.emit(EVENTS.ERROR, { code: 'SESSION_NOT_FOUND', message: 'Session not found' });
      return;
    }

    // Parallelize the status update, resume fetch, and user AI history — none depend on each other
    const [, userResult, historyResult] = await Promise.allSettled([
      this.sessions.update(sessionId, userId, { status: 'active' }),
      this.users.findById(userId),
      this.feedback.getUserAIHistory(userId),
    ]);
    const resumeContext: string | null =
      userResult.status === 'fulfilled' ? (userResult.value.resumeText ?? null) : null;
    const userHistory: UserAIHistory | null =
      historyResult.status === 'fulfilled' ? historyResult.value : null;
    if (userHistory) this.userHistoryCache.set(sessionId, userHistory);

    // ── Pinned-question path (Question Bank shortcut) ─────────────────────────
    const pinnedIds = session.pinnedQuestionIds?.filter(Boolean) ?? [];
    let firstQuestion: InterviewQuestion;
    let pinnedQueue:   InterviewQuestion[] = [];
    let maxQuestions:  number;

    if (pinnedIds.length > 0) {
      // Load all pinned questions from DB upfront — no AI needed
      const dbQuestions = await Promise.all(
        pinnedIds.map((id) => this.questions.findOne(id).catch(() => null)),
      );
      const loaded = dbQuestions
        .filter((q): q is NonNullable<typeof q> => q !== null)
        .map((q): InterviewQuestion => ({
          id:              q.id,
          question:        q.question,
          type:            q.type,
          hints:           [],
          followUps:       [],
          timeEstimateSec: 180,
        }));

      if (!loaded.length) {
        client.emit(EVENTS.ERROR, { code: 'QUESTION_GENERATION_FAILED', message: 'None of the selected questions could be loaded.' });
        await this.sessions.update(sessionId, userId, { status: 'pending' });
        return;
      }

      [firstQuestion, ...pinnedQueue] = loaded;
      maxQuestions = loaded.length;
    } else {
      // ── AI-generated path (default) ─────────────────────────────────────────
      maxQuestions = Math.ceil(session.durationMinutes / 5);
      client.emit(EVENTS.AI_TYPING, { typing: true });

      try {
        firstQuestion = await this.fetchNextAiQuestion({
          interviewType:   session.interviewType,
          targetRole:      session.targetRole      ?? null,
          targetCompany:   session.targetCompany   ?? null,
          experienceLevel: session.experienceLevel ?? null,
          resumeContext,
          previousQA:      [],
          userHistory,
        });
      } catch (err) {
        client.emit(EVENTS.AI_TYPING, { typing: false });
        this.logger.error(`[WS] Failed to generate first question for ${sessionId}: ${(err as Error).message}`);
        client.emit(EVENTS.ERROR, {
          code:    'QUESTION_GENERATION_FAILED',
          message: 'Could not generate a question. Please check the AI engine and try again.',
        });
        await this.sessions.update(sessionId, userId, { status: 'pending' });
        return;
      }

      client.emit(EVENTS.AI_TYPING, { typing: false });
    }

    this.state.create({
      sessionId,
      userId,
      interviewType:     session.interviewType,
      targetRole:        session.targetRole      ?? null,
      targetCompany:     session.targetCompany   ?? null,
      experienceLevel:   session.experienceLevel ?? null,
      mode:              session.mode,
      durationSec:       session.durationMinutes * 60,
      questions:         [firstQuestion],
      maxQuestions,
      resumeContext,
      initialDifficulty: this.deriveDifficulty(session.experienceLevel),
      isFullLoop:        pinnedIds.length === 0 && session.durationMinutes >= 60 && maxQuestions >= 9,
      pinnedQueue,
    });

    const s = this.state.start(sessionId);
    const q = this.state.currentQuestion(sessionId)!;
    this.server.to(`session:${sessionId}`).emit(EVENTS.QUESTION, this.buildQuestionPayload(s, q));
    this.startTimer(sessionId);

    // Kick off Q2 AI prefetch only when not using pinned questions
    if (pinnedIds.length === 0 && maxQuestions > 1) {
      this.prefetchNextQ(sessionId, {
        interviewType:   session.interviewType,
        targetRole:      session.targetRole      ?? null,
        targetCompany:   session.targetCompany   ?? null,
        experienceLevel: session.experienceLevel ?? null,
        resumeContext,
        previousQA:      [{ question: q.question, answer: '[ANSWERING]' }],
        userHistory,
      });
    }

    return { ok: true };
  }

  /** ANSWER_SUBMIT — record answer, then adaptively generate the next question */
  @SubscribeMessage(EVENTS.ANSWER_SUBMIT)
  async handleAnswerSubmit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { answer: string; timeSpentMs: number },
  ) {
    const { sessionId } = client;
    await this.recordAndAdvance(sessionId, data.answer, data.timeSpentMs);
    return { ok: true };
  }

  /** PASS_QUESTION — skip without answering, then adaptively generate the next question */
  @SubscribeMessage(EVENTS.PASS_QUESTION)
  async handlePassQuestion(@ConnectedSocket() client: AuthenticatedSocket) {
    const { sessionId } = client;
    await this.recordAndAdvance(sessionId, '[PASSED]', 0);
    return { ok: true };
  }

  /**
   * Shared logic for ANSWER_SUBMIT and PASS_QUESTION:
   * 1. Record the answer in state
   * 2. If max questions reached or time almost up → end session
   * 3. Otherwise → call AI for next adaptive question and emit it
   */
  private async recordAndAdvance(
    sessionId: string,
    answer: string,
    timeSpentMs: number,
  ): Promise<void> {
    const state = this.state.recordAnswer(sessionId, answer, timeSpentMs);

    const answeredCount = state.transcript.length;
    const remaining     = this.state.remainingSeconds(sessionId);
    if (answeredCount >= state.maxQuestions || remaining < 120) {
      await this.endSession(sessionId, 'completed');
      return;
    }

    // Adaptive difficulty — adjust based on answer quality
    const nextDifficulty = this.state.adjustDifficulty(sessionId, answer);

    // Full-loop phase transition — advance type when phase threshold hit
    const newPhase = this.state.advanceFullLoopPhase(sessionId);
    if (newPhase) {
      const phaseLabels: Record<string, string> = {
        behavioral:      'Behavioral Round',
        coding:          'Coding Challenge',
        'system-design': 'System Design Round',
      };
      this.server.to(`session:${sessionId}`).emit(EVENTS.PHASE_TRANSITION, {
        phase:     newPhase,
        label:     phaseLabels[newPhase] ?? newPhase,
        questionN: answeredCount,
      });
      // Invalidate any prefetched question from the old phase
      this.prefetchedQ.delete(sessionId);
    }

    // Re-read state after mutations (phase may have changed interviewType)
    const currentState = this.state.getOrThrow(sessionId);

    // Build conversation history — reset after a phase transition for cleaner prompts
    const previousQA = newPhase
      ? []
      : state.transcript.map((t) => ({ question: t.question, answer: t.answer }));

    const fetchCtx = {
      interviewType:   currentState.interviewType,
      targetRole:      currentState.targetRole,
      targetCompany:   currentState.targetCompany,
      experienceLevel: currentState.experienceLevel,
      resumeContext:   currentState.resumeContext,
      difficulty:      nextDifficulty,
      previousQA,
      userHistory:     this.userHistoryCache.get(sessionId) ?? null,
    };

    // ── Pinned queue takes priority over AI ──────────────────────────────────
    const pinned = this.state.shiftPinnedQuestion(sessionId);
    if (pinned) {
      const updatedState = this.state.addNextQuestion(sessionId, pinned);
      this.server.to(`session:${sessionId}`).emit(EVENTS.QUESTION, this.buildQuestionPayload(updatedState, pinned));
      return;
    }

    // Use a prefetched question if one is ready, otherwise fetch live
    const prefetched = this.prefetchedQ.get(sessionId);
    this.prefetchedQ.delete(sessionId);

    if (prefetched) {
      const updatedState = this.state.addNextQuestion(sessionId, prefetched);
      this.server.to(`session:${sessionId}`).emit(EVENTS.QUESTION, this.buildQuestionPayload(updatedState, prefetched));
      if (updatedState.transcript.length + 1 < updatedState.maxQuestions) {
        this.prefetchNextQ(sessionId, { ...fetchCtx, previousQA: [...previousQA, { question: prefetched.question, answer: '[ANSWERING]' }] });
      }
      return;
    }

    this.server.to(`session:${sessionId}`).emit(EVENTS.AI_TYPING, { typing: true });

    try {
      const nextQ        = await this.fetchNextAiQuestion(fetchCtx);
      const updatedState = this.state.addNextQuestion(sessionId, nextQ);
      this.server.to(`session:${sessionId}`).emit(EVENTS.AI_TYPING, { typing: false });
      this.server.to(`session:${sessionId}`).emit(EVENTS.QUESTION, this.buildQuestionPayload(updatedState, nextQ));

      if (updatedState.transcript.length + 1 < updatedState.maxQuestions) {
        this.prefetchNextQ(sessionId, { ...fetchCtx, previousQA: [...previousQA, { question: nextQ.question, answer: '[ANSWERING]' }] });
      }
    } catch (err) {
      this.logger.error(`[WS] Failed to generate next question for ${sessionId}: ${(err as Error).message}`);
      this.server.to(`session:${sessionId}`).emit(EVENTS.AI_TYPING, { typing: false });
      this.server.to(`session:${sessionId}`).emit(EVENTS.ERROR, {
        code:    'QUESTION_GENERATION_FAILED',
        message: 'Could not generate next question. The session will end.',
      });
      await this.endSession(sessionId, 'completed');
    }
  }

  /** HINT_REQUEST */
  @SubscribeMessage(EVENTS.HINT_REQUEST)
  handleHintRequest(@ConnectedSocket() client: AuthenticatedSocket) {
    const result = this.state.requestHint(client.sessionId);
    if (!result) {
      client.emit(EVENTS.HINT, { text: null, hintIndex: -1, message: 'No more hints available' });
      return;
    }
    client.emit(EVENTS.HINT, { text: result.hint, hintIndex: result.hintIndex });
  }

  /** PAUSE */
  @SubscribeMessage(EVENTS.PAUSE)
  handlePause(@ConnectedSocket() client: AuthenticatedSocket) {
    const s = this.state.pause(client.sessionId);
    this.stopTimer(client.sessionId);
    this.server.to(`session:${client.sessionId}`).emit(EVENTS.SESSION_PAUSED, {
      elapsedSec: this.state.elapsedSeconds(client.sessionId),
    });
    return { ok: true, status: s.status };
  }

  /** RESUME */
  @SubscribeMessage(EVENTS.RESUME)
  handleResume(@ConnectedSocket() client: AuthenticatedSocket) {
    const s = this.state.resume(client.sessionId);
    this.startTimer(client.sessionId);
    this.server.to(`session:${client.sessionId}`).emit(EVENTS.SESSION_RESUMED, {
      remainingSec: this.state.remainingSeconds(client.sessionId),
    });
    return { ok: true, status: s.status };
  }

  /** END — manual early stop */
  @SubscribeMessage(EVENTS.END)
  async handleEnd(@ConnectedSocket() client: AuthenticatedSocket) {
    await this.endSession(client.sessionId, 'manual');
    return { ok: true };
  }

  /** THINK_ALOUD */
  @SubscribeMessage(EVENTS.THINK_ALOUD)
  handleThinkAloud(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { text: string; partial: boolean },
  ) {
    client.emit(EVENTS.AI_MESSAGE, { role: 'transcript', text: data.text, partial: data.partial });
  }

  /** VOICE_CHUNK */
  @SubscribeMessage(EVENTS.VOICE_CHUNK)
  handleVoiceChunk(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() chunk: Buffer,
  ) {
    this.state.appendVoiceChunk(client.sessionId, Buffer.from(chunk));
  }

  /** VOICE_END — flush buffer, forward to AI engine */
  @SubscribeMessage(EVENTS.VOICE_END)
  async handleVoiceEnd(@ConnectedSocket() client: AuthenticatedSocket) {
    const { sessionId } = client;
    const audio = this.state.flushVoiceChunks(sessionId);
    if (!audio.length) return;

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/webm' }), 'audio.webm');

      const res = await fetch(`${aiUrl}/voice/transcribe`, { method: 'POST', body: form });
      const { transcript } = await res.json() as { transcript: string };
      client.emit(EVENTS.VOICE_TRANSCRIPT, { text: transcript, final: true });
    } catch (err) {
      this.logger.error(`Voice transcription failed: ${(err as Error).message}`);
      client.emit(EVENTS.ERROR, { code: 'VOICE_FAILED', message: 'Transcription unavailable' });
    }
  }

  /** COACH_MESSAGE */
  @SubscribeMessage(EVENTS.COACH_MESSAGE)
  async handleCoachMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { message: string; conversationHistory: Array<{ role: string; content: string }> },
  ) {
    const { sessionId } = client;
    const s = this.state.get(sessionId);
    const q = this.state.currentQuestion(sessionId);

    client.emit(EVENTS.AI_TYPING, { typing: true });

    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';
    try {
      const res = await fetch(`${aiUrl}/coach`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...data.conversationHistory, { role: 'user', content: data.message }],
          user_context: {
            targetRole:      s?.interviewType,
            currentQuestion: q?.question,
            stream:          false,
          },
        }),
      });
      const { reply } = await res.json() as { reply: string };
      client.emit(EVENTS.AI_TYPING,  { typing: false });
      client.emit(EVENTS.AI_MESSAGE, { role: 'coach', text: reply, partial: false });
    } catch {
      client.emit(EVENTS.AI_TYPING, { typing: false });
      client.emit(EVENTS.ERROR, { code: 'COACH_FAILED', message: 'AI coach unavailable' });
    }
  }

  // ── Called from other services ────────────────────────────────────────────

  emitFeedbackReady(sessionId: string, feedbackId: string) {
    this.server.to(`session:${sessionId}`).emit(EVENTS.FEEDBACK_READY, { feedbackId });
    this.state.destroy(sessionId);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async endSession(sessionId: string, reason: 'completed' | 'manual' | 'timeout') {
    this.stopTimer(sessionId);
    this.prefetchedQ.delete(sessionId);
    this.userHistoryCache.delete(sessionId);
    const s = this.state.get(sessionId);
    if (!s) return;

    // Persist transcript to DB
    try {
      await this.sessions.update(sessionId, s.userId, {
        status:     'completed',
        transcript: s.transcript as unknown as object[],
      });
    } catch (err) {
      this.logger.error(`Failed to persist transcript for ${sessionId}: ${(err as Error).message}`);
    }

    // Enqueue AI feedback job
    try {
      await this.feedbackQ.add(FEEDBACK_JOBS.EVALUATE, {
        sessionId,
        userId:     s.userId,
        transcript: s.transcript,
        context: {
          interviewType:   s.interviewType,
          targetRole:      s.targetRole      ?? undefined,
          targetCompany:   s.targetCompany   ?? undefined,
          experienceLevel: s.experienceLevel ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue feedback job for ${sessionId}: ${(err as Error).message}`);
    }

    this.server.to(`session:${sessionId}`).emit(EVENTS.SESSION_ENDED, {
      reason,
      transcript: s.transcript,
    });

    this.logger.log(`[WS] Session ${sessionId} ended (${reason})`);
  }

  private startTimer(sessionId: string) {
    this.stopTimer(sessionId);
    let warnedAt60 = false;

    const interval = setInterval(() => {
      const remaining = this.state.remainingSeconds(sessionId);
      const elapsed   = this.state.elapsedSeconds(sessionId);

      this.server.to(`session:${sessionId}`).emit(EVENTS.TIMER_TICK, {
        elapsed,
        remaining,
      });

      if (remaining <= 60 && !warnedAt60) {
        warnedAt60 = true;
        this.server.to(`session:${sessionId}`).emit(EVENTS.TIMER_WARNING, {
          message: '1 minute remaining',
        });
      }

      if (remaining <= 0) {
        void this.endSession(sessionId, 'timeout');
      }
    }, 1000);

    this.timers.set(sessionId, interval);
  }

  private stopTimer(sessionId: string) {
    const t = this.timers.get(sessionId);
    if (t) { clearInterval(t); this.timers.delete(sessionId); }
  }

  /** Fire-and-forget: fetch the next question and store it for instant delivery */
  private prefetchNextQ(
    sessionId: string,
    ctx: Parameters<typeof this.fetchNextAiQuestion>[0],
  ): void {
    this.fetchNextAiQuestion(ctx)
      .then((q) => {
        // Only store if the session is still active
        if (this.state.get(sessionId)) this.prefetchedQ.set(sessionId, q);
      })
      .catch(() => { /* prefetch miss — live fetch will handle it */ });
  }

  /** Map experience-level string → AI engine difficulty value */
  private deriveDifficulty(level: string | null | undefined): 'easy' | 'medium' | 'hard' {
    if (!level) return 'medium';
    const l = level.toLowerCase();
    if (l.includes('entry') || l.includes('0–2') || l.includes('0-2') || l.includes('student') || l.includes('new grad')) return 'easy';
    if (l.includes('senior') || l.includes('5–8') || l.includes('5-8') || l.includes('7+')) return 'hard';
    return 'medium';
  }

  /**
   * Calls the AI engine for a single adaptive question.
   * Passes conversation history so Claude can avoid repeats and probe weak areas.
   * Throws on failure — callers are responsible for error handling.
   */
  private async fetchNextAiQuestion(ctx: {
    interviewType:   string;
    targetRole:      string | null;
    targetCompany:   string | null;
    experienceLevel: string | null;
    resumeContext:   string | null;
    previousQA:      Array<{ question: string; answer: string }>;
    difficulty?:     'easy' | 'medium' | 'hard';
    userHistory?:    UserAIHistory | null;
  }): Promise<InterviewQuestion> {
    const aiUrl = this.config.get<string>('AI_ENGINE_URL') ?? 'http://localhost:8000';

    const res = await fetch(`${aiUrl}/questions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interview_type:   ctx.interviewType,
        target_role:      ctx.targetRole      ?? 'Software Engineer',
        target_company:   ctx.targetCompany   ?? null,
        experience_level: ctx.experienceLevel ?? 'Mid-level (3–5 years)',
        num_questions:    1,
        difficulty:       ctx.difficulty ?? this.deriveDifficulty(ctx.experienceLevel),
        resume_context:   ctx.resumeContext ?? null,
        previous_qa:      ctx.previousQA.length > 0 ? ctx.previousQA : null,
        user_history:     ctx.userHistory ?? null,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) throw new Error(`AI engine /questions returned HTTP ${res.status}`);

    const data = await res.json() as {
      questions: Array<{
        id:                    string;
        question:              string;
        type:                  string;
        hints:                 string[];
        follow_ups:            string[];
        time_estimate_seconds: number;
      }>;
    };

    const q = data.questions?.[0];
    if (!q) throw new Error('AI engine returned empty question list');

    return {
      id:              q.id,
      question:        q.question,
      type:            q.type,
      hints:           q.hints      ?? [],
      followUps:       q.follow_ups ?? [],
      timeEstimateSec: q.time_estimate_seconds ?? 180,
    };
  }

  private buildQuestionPayload(
    s: { questions: InterviewQuestion[]; currentIndex: number; maxQuestions: number },
    q: InterviewQuestion,
  ) {
    return {
      index:           s.currentIndex,
      total:           s.maxQuestions,
      questionId:      q.id,
      question:        q.question,
      type:            q.type,
      category:        q.type,     // alias used by session page
      hints:           q.hints,
      hasHints:        q.hints.length > 0,
      followUps:       q.followUps,
      timeEstimateSec: q.timeEstimateSec,
    };
  }

  private buildStateSnapshot(sessionId: string) {
    const s = this.state.getOrThrow(sessionId);
    const q = this.state.currentQuestion(sessionId);
    return {
      status:           s.status,
      currentIndex:     s.currentIndex,
      totalQuestions:   s.maxQuestions,
      remainingSec:     this.state.remainingSeconds(sessionId),
      currentQuestion:  q ? this.buildQuestionPayload(s, q) : null,
      transcriptLength: s.transcript.length,
    };
  }

  private authenticate(client: Socket): { userId: string; sessionId: string } {
    const token = this.extractToken(client);
    if (!token) throw new UnauthorizedException('Missing token');

    const secret  = this.config.getOrThrow<string>('BETTER_AUTH_SECRET');
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;

    const sessionId = (client.handshake.query['sessionId'] as string | undefined)?.trim();
    if (!sessionId) throw new UnauthorizedException('Missing sessionId query param');

    return { userId: payload.sub ?? '', sessionId };
  }

  private extractToken(client: Socket): string | null {
    const raw = (client.handshake.auth['token'] as string | undefined)
      ?? (client.handshake.headers['authorization'] as string | undefined);
    if (!raw) return null;
    return raw.startsWith('Bearer ') ? raw.slice(7) : raw;
  }
}
