"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export interface QuestionData {
  questionId: string;
  question:   string;
  category:   string;
  index:      number;
  total:      number;
  hints:      string[];
}

export interface CoachMessage {
  role: "user" | "coach";
  text: string;
}

export interface PhaseTransition {
  phase:     string;  // "behavioral" | "coding" | "system-design"
  label:     string;  // human-readable e.g. "Coding Challenge"
  questionN: number;  // question index where transition happened
}

export function useInterviewSocket(
  sessionId: string | null,
  getToken:  () => Promise<string | null>,
  onFeedbackReady: (feedbackId: string) => void,
) {
  const socketRef          = useRef<Socket | null>(null);
  const getTokenRef        = useRef(getToken);
  const onFeedbackRef      = useRef(onFeedbackReady);
  const answerStart        = useRef<number>(Date.now());
  const hintsUsedRef       = useRef<number>(0);
  const firstQReceived     = useRef(false);
  const coachHistoryRef    = useRef<Array<{ role: string; content: string }>>([]);

  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);
  useEffect(() => { onFeedbackRef.current = onFeedbackReady; }, [onFeedbackReady]);

  const [connected,        setConnected]        = useState(false);
  const [question,         setQuestion]         = useState<QuestionData | null>(null);
  const [questionIndex,    setQuestionIndex]    = useState(0);
  const [totalQuestions,   setTotalQuestions]   = useState(8);
  const [elapsed,          setElapsed]          = useState(0);
  const [remaining,        setRemaining]        = useState(0);
  const [ended,            setEnded]            = useState(false);
  const [aiTyping,         setAiTyping]         = useState(false);
  const [wsError,          setWsError]          = useState<string | null>(null);
  const [sessionError,     setSessionError]     = useState<string | null>(null);
  const [voiceTranscript,  setVoiceTranscript]  = useState<string | null>(null);

  // Hint state
  const [currentHint,      setCurrentHint]      = useState<string | null>(null);

  // Coach state
  const [coachMessages,    setCoachMessages]    = useState<CoachMessage[]>([]);
  const [coachTyping,      setCoachTyping]      = useState(false);

  // Full-loop phase transitions
  const [phaseTransition,  setPhaseTransition]  = useState<PhaseTransition | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;

    (async () => {
      const token  = await getTokenRef.current();
      const wsBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1")
        .replace(/\/api\/v1\/?$/, "");

      const socket = io(`${wsBase}/interview`, {
        auth:       { token },
        query:      { sessionId },
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (!mounted) return;
        setConnected(true);
        socket.emit("interview:start");
        answerStart.current = Date.now();
      });

      socket.on("interview:question", (data: QuestionData) => {
        if (!mounted) return;
        firstQReceived.current = true;
        setQuestion(data);
        setQuestionIndex(data.index);
        setTotalQuestions(data.total);
        setCurrentHint(null); // clear hint on new question
        hintsUsedRef.current = 0;
        answerStart.current  = Date.now();
      });

      // ── Hint response ────────────────────────────────────────────────────
      socket.on("interview:hint", ({ text }: { text: string | null; hintIndex: number; message?: string }) => {
        if (!mounted) return;
        if (text) setCurrentHint(text);
      });

      // ── AI coach messages ────────────────────────────────────────────────
      socket.on("interview:ai_message", ({ role, text }: { role: string; text: string; partial: boolean }) => {
        if (!mounted || role !== "coach") return;
        setCoachTyping(false);
        const msg: CoachMessage = { role: "coach", text };
        coachHistoryRef.current = [...coachHistoryRef.current, { role: "assistant", content: text }];
        setCoachMessages((prev) => [...prev, msg]);
      });

      // ── Full-loop phase transition ────────────────────────────────────────
      socket.on("interview:phase_transition", (data: PhaseTransition) => {
        if (!mounted) return;
        setPhaseTransition(data);
      });

      socket.on("interview:timer_tick", ({ elapsed: e, remaining: r }: { elapsed: number; remaining: number }) => {
        if (!mounted) return;
        setElapsed(e * 1000);
        setRemaining(r * 1000);
      });

      socket.on("interview:session_ended", () => {
        if (!mounted) return;
        setEnded(true);
      });

      socket.on("interview:feedback_ready", ({ feedbackId }: { feedbackId: string }) => {
        if (!mounted) return;
        onFeedbackRef.current(feedbackId);
      });

      socket.on("interview:ai_typing", ({ typing }: { typing: boolean }) => {
        if (!mounted) return;
        setAiTyping(typing);
        if (typing) setCoachTyping(false); // interviewer typing takes precedence
      });

      socket.on("interview:voice_transcript", ({ text, final }: { text: string; final: boolean }) => {
        if (!mounted || !final || !text) return;
        setVoiceTranscript(text);
      });

      socket.on("interview:error", ({ code, message }: { code: string; message: string }) => {
        if (!mounted) return;
        if (code === "QUESTION_GENERATION_FAILED" && firstQReceived.current) {
          setSessionError(message);
        } else {
          setWsError(message);
        }
      });

      socket.on("connect_error", (err: Error) => {
        if (!mounted) return;
        setWsError(err.message);
      });

      socket.on("disconnect", () => {
        if (!mounted) return;
        setConnected(false);
      });
    })();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const submitAnswer = useCallback((answer: string) => {
    const timeSpentMs = Date.now() - answerStart.current;
    socketRef.current?.emit("interview:answer_submit", {
      answer,
      timeSpentMs,
      hintsUsed: hintsUsedRef.current,
    });
  }, []);

  const passQuestion = useCallback(() => {
    socketRef.current?.emit("interview:pass_question", {});
  }, []);

  const requestHint = useCallback(() => {
    hintsUsedRef.current += 1;
    socketRef.current?.emit("interview:hint_request", {});
  }, []);

  const endSession = useCallback(() => {
    socketRef.current?.emit("interview:end_session", {});
  }, []);

  const sendVoiceChunk = useCallback((buffer: ArrayBuffer) => {
    socketRef.current?.emit("interview:voice_chunk", buffer);
  }, []);

  const sendVoiceEnd = useCallback(() => {
    socketRef.current?.emit("interview:voice_end");
  }, []);

  const sendCoachMessage = useCallback((message: string) => {
    const userMsg: CoachMessage = { role: "user", text: message };
    coachHistoryRef.current = [...coachHistoryRef.current, { role: "user", content: message }];
    setCoachMessages((prev) => [...prev, userMsg]);
    setCoachTyping(true);
    socketRef.current?.emit("interview:coach_message", {
      message,
      conversationHistory: coachHistoryRef.current.slice(-10), // last 10 turns
    });
  }, []);

  const clearVoiceTranscript = useCallback(() => setVoiceTranscript(null), []);
  const clearSessionError    = useCallback(() => setSessionError(null), []);
  const clearHint            = useCallback(() => setCurrentHint(null), []);
  const clearPhaseTransition = useCallback(() => setPhaseTransition(null), []);

  return {
    connected, question, questionIndex, totalQuestions,
    elapsed, remaining, ended, aiTyping, wsError, sessionError,
    voiceTranscript, clearVoiceTranscript, clearSessionError,
    currentHint, clearHint,
    coachMessages, coachTyping, sendCoachMessage,
    phaseTransition, clearPhaseTransition,
    submitAnswer, passQuestion, requestHint, endSession,
    sendVoiceChunk, sendVoiceEnd,
  };
}

export function fmtMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
