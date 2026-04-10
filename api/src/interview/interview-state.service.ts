import { Injectable, Logger } from '@nestjs/common';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InterviewQuestion {
  id:           string;
  question:     string;
  type:         string;
  hints:        string[];
  followUps:    string[];
  timeEstimateSec: number;
}

export type ParticipantStatus = 'idle' | 'answering' | 'paused' | 'disconnected';

export interface SessionState {
  sessionId:       string;
  userId:          string;
  interviewType:   string;
  targetRole:      string | null;
  targetCompany:   string | null;
  experienceLevel: string | null;
  mode:            'text' | 'voice' | 'mixed';
  durationSec:     number;

  questions:      InterviewQuestion[];
  currentIndex:   number;
  maxQuestions:   number;    // planned upper bound (for progress display); questions grow dynamically
  hintsUsed:      number;    // hints consumed for current question
  status:         'waiting' | 'active' | 'paused' | 'ended';
  participantStatus: ParticipantStatus;

  // Transcript accumulates as answers come in
  transcript: Array<{
    questionId:     string;
    question:       string;
    answer:         string;
    hintsUsed:      number;
    timeSpentMs:    number;
    submittedAt:    Date;
  }>;

  // Timing
  startedAt:      Date | null;
  pausedAt:       Date | null;
  elapsedMs:      number;    // ms elapsed before last pause

  // Resume context for adaptive question personalisation
  resumeContext:  string | null;

  // Adaptive difficulty — adjusts per answer quality
  currentDifficulty: 'easy' | 'medium' | 'hard';

  // Full-loop orchestration
  isFullLoop:       boolean;
  fullLoopPhase:    'behavioral' | 'coding' | 'system-design';

  // Pinned question queue — non-empty when session was started from the question bank
  pinnedQueue:    InterviewQuestion[];

  // Voice state
  voiceChunks:    Buffer[];  // raw PCM/webm chunks buffering for current answer
  voiceActive:    boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class InterviewStateService {
  private readonly logger = new Logger(InterviewStateService.name);

  /** sessionId → in-memory state. Cleared when session ends. */
  private readonly sessions = new Map<string, SessionState>();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create(params: {
    sessionId:         string;
    userId:            string;
    interviewType:     string;
    targetRole:        string | null;
    targetCompany:     string | null;
    experienceLevel:   string | null;
    mode:              SessionState['mode'];
    durationSec:       number;
    questions:         InterviewQuestion[];
    maxQuestions:      number;
    resumeContext:     string | null;
    initialDifficulty: 'easy' | 'medium' | 'hard';
    isFullLoop:        boolean;
    pinnedQueue?:      InterviewQuestion[];
  }): SessionState {
    const state: SessionState = {
      ...params,
      currentIndex:      0,
      hintsUsed:         0,
      status:            'waiting',
      participantStatus: 'idle',
      transcript:        [],
      startedAt:         null,
      pausedAt:          null,
      elapsedMs:         0,
      resumeContext:     params.resumeContext,
      currentDifficulty: params.initialDifficulty,
      isFullLoop:        params.isFullLoop,
      fullLoopPhase:     'behavioral',
      pinnedQueue:       params.pinnedQueue ?? [],
      voiceChunks:       [],
      voiceActive:       false,
    };
    this.sessions.set(params.sessionId, state);
    this.logger.log(`State created for session ${params.sessionId}`);
    return state;
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getOrThrow(sessionId: string): SessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No state for session ${sessionId}`);
    return state;
  }

  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.logger.log(`State destroyed for session ${sessionId}`);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  start(sessionId: string): SessionState {
    const state = this.getOrThrow(sessionId);
    state.status    = 'active';
    state.startedAt = new Date();
    state.participantStatus = 'answering';
    return state;
  }

  pause(sessionId: string): SessionState {
    const state = this.getOrThrow(sessionId);
    if (state.status !== 'active') return state;
    state.status   = 'paused';
    state.pausedAt = new Date();
    state.elapsedMs += Date.now() - (state.startedAt?.getTime() ?? Date.now());
    state.participantStatus = 'paused';
    return state;
  }

  resume(sessionId: string): SessionState {
    const state = this.getOrThrow(sessionId);
    if (state.status !== 'paused') return state;
    state.status    = 'active';
    state.startedAt = new Date();
    state.pausedAt  = null;
    state.participantStatus = 'answering';
    return state;
  }

  /**
   * Records the current answer into the transcript.
   * Does NOT advance the question index — call addNextQuestion() for that.
   */
  recordAnswer(
    sessionId: string,
    answer: string,
    timeSpentMs: number,
  ): SessionState {
    const state = this.getOrThrow(sessionId);
    const q     = state.questions[state.currentIndex];
    if (!q) throw new Error('No current question');

    state.transcript.push({
      questionId:  q.id,
      question:    q.question,
      answer,
      hintsUsed:   state.hintsUsed,
      timeSpentMs,
      submittedAt: new Date(),
    });
    state.hintsUsed = 0;

    return state;
  }

  /**
   * Appends the next adaptive question and advances the current index.
   * Called by the gateway after the AI generates the next question.
   */
  addNextQuestion(sessionId: string, question: InterviewQuestion): SessionState {
    const state = this.getOrThrow(sessionId);
    state.questions.push(question);
    state.currentIndex = state.questions.length - 1;
    state.hintsUsed    = 0;
    return state;
  }

  /** Removes and returns the next pinned question, or null if queue is empty */
  shiftPinnedQuestion(sessionId: string): InterviewQuestion | null {
    const state = this.getOrThrow(sessionId);
    return state.pinnedQueue.shift() ?? null;
  }

  requestHint(sessionId: string): { hint: string; hintIndex: number } | null {
    const state = this.getOrThrow(sessionId);
    const q     = state.questions[state.currentIndex];
    if (!q) return null;

    const hintIndex = state.hintsUsed;
    if (hintIndex >= q.hints.length) return null;

    state.hintsUsed += 1;
    return { hint: q.hints[hintIndex], hintIndex };
  }

  /**
   * Adjusts difficulty based on the last answer's word count.
   * >80 words → harder, <25 words or pass → easier, else stay.
   */
  adjustDifficulty(sessionId: string, answer: string): 'easy' | 'medium' | 'hard' {
    const state = this.getOrThrow(sessionId);
    const words = answer.trim().split(/\s+/).filter(Boolean).length;
    const isPassed = answer === '[PASSED]';
    const order: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
    const idx = order.indexOf(state.currentDifficulty);

    if (!isPassed && words >= 80 && idx < 2) {
      state.currentDifficulty = order[idx + 1];
    } else if ((isPassed || words < 25) && idx > 0) {
      state.currentDifficulty = order[idx - 1];
    }
    return state.currentDifficulty;
  }

  /**
   * For full-loop sessions: advances to the next phase when the question threshold is met.
   * Returns the new phase if a transition occurred, null otherwise.
   */
  advanceFullLoopPhase(sessionId: string): 'behavioral' | 'coding' | 'system-design' | null {
    const state = this.getOrThrow(sessionId);
    if (!state.isFullLoop) return null;

    const answered = state.transcript.length;
    const phases: Array<'behavioral' | 'coding' | 'system-design'> = ['behavioral', 'coding', 'system-design'];
    const phaseSize = Math.floor(state.maxQuestions / 3);
    const phaseIdx  = Math.min(Math.floor(answered / phaseSize), 2);
    const newPhase  = phases[phaseIdx];

    if (newPhase !== state.fullLoopPhase) {
      state.fullLoopPhase  = newPhase;
      state.interviewType  = newPhase;  // switch the active type so AI generates correct questions
      return newPhase;
    }
    return null;
  }

  appendVoiceChunk(sessionId: string, chunk: Buffer): void {
    const state = this.getOrThrow(sessionId);
    state.voiceChunks.push(chunk);
    state.voiceActive = true;
  }

  flushVoiceChunks(sessionId: string): Buffer {
    const state  = this.getOrThrow(sessionId);
    const merged = Buffer.concat(state.voiceChunks);
    state.voiceChunks = [];
    state.voiceActive = false;
    return merged;
  }

  setParticipantStatus(sessionId: string, status: ParticipantStatus): void {
    const state = this.getOrThrow(sessionId);
    state.participantStatus = status;
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  elapsedSeconds(sessionId: string): number {
    const state = this.sessions.get(sessionId);
    if (!state || !state.startedAt) return 0;
    if (state.status === 'paused') return Math.floor(state.elapsedMs / 1000);
    return Math.floor((state.elapsedMs + Date.now() - state.startedAt.getTime()) / 1000);
  }

  remainingSeconds(sessionId: string): number {
    const state = this.sessions.get(sessionId);
    if (!state) return 0;
    return Math.max(0, state.durationSec - this.elapsedSeconds(sessionId));
  }

  currentQuestion(sessionId: string): InterviewQuestion | null {
    const state = this.sessions.get(sessionId);
    if (!state) return null;
    return state.questions[state.currentIndex] ?? null;
  }
}
