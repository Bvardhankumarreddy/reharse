"use client";

// Spec § Screen 8 Frame 2: AI Coach Chat Panel (400px side panel)
// "Warm, personal, like a real coach. Coach remembers your sessions and weak areas."

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApiClient } from "@/lib/hooks/useApiClient";

interface Message {
  role: "ai" | "user";
  text: string;
  actions?: string[];
}

const INITIAL_MESSAGE: Message = {
  role: "ai",
  text: "Hi! I'm your AI Coach. I can help you prepare for interviews, work through tricky questions, or review your recent performance. What would you like to focus on?",
  actions: ["Review my weak areas", "Practice a question", "Interview tips"],
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AiCoachPanel({ open, onClose }: Props) {
  const { api, ready } = useApiClient();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || !ready) return;
    const userMsg: Message = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);

    // Build messages array for the API (convert "ai" → "assistant", skip action buttons)
    const history = [...messages, userMsg]
      .filter((m) => m.role === "user" || m.role === "ai")
      .map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));

    try {
      const res = await api.coachMessage(history);
      setMessages((m) => [...m, { role: "ai", text: res.reply }]);
    } catch {
      setMessages((m) => [...m, {
        role: "ai",
        text: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
      }]);
    } finally {
      setTyping(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop (mobile) */}
          <motion.div
            key="coach-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/20 lg:hidden"
            onClick={onClose}
          />

          {/* Spec: "side panel, 400px, white, shadow" */}
          <motion.aside
            key="coach-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-[95] w-full sm:w-[400px]
                       bg-surface shadow-float flex flex-col border-l border-border"
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] flex items-center justify-center">
                  <span
                    className="material-symbols-outlined text-white text-[16px]"
                    style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
                  >
                    auto_awesome
                  </span>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-text-pri">AI Coach</p>
                  <p className="text-[10px] text-text-muted">Powered by Claude</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-muted hover:bg-bg-app hover:text-text-pri transition-colors"
                aria-label="Close AI Coach"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* ── Chat area ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className="max-w-[85%] space-y-2">
                    <div
                      className={
                        m.role === "ai"
                          ? "bg-bg-app rounded-2xl rounded-tl-sm px-4 py-3"
                          : "bg-blue text-white rounded-2xl rounded-tr-sm px-4 py-3"
                      }
                    >
                      <p className={`text-small leading-relaxed whitespace-pre-line ${m.role === "ai" ? "text-text-pri" : "text-white"}`}>
                        {m.text}
                      </p>
                    </div>
                    {m.actions && m.role === "ai" && (
                      <div className="flex flex-wrap gap-2">
                        {m.actions.map((a) => (
                          <button
                            key={a}
                            onClick={() => send(a)}
                            className="px-3 py-1.5 border border-blue/30 text-blue rounded-full text-[12px] font-semibold hover:bg-blue-50 transition-colors"
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex justify-start">
                  <div className="bg-bg-app rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div className="px-5 pb-5 pt-3 border-t border-border flex-shrink-0 space-y-2">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder="Ask your AI coach..."
                  className="flex-1 h-10 px-4 bg-bg-app border border-border rounded-xl
                             text-small text-text-pri placeholder:text-text-muted
                             focus:outline-none focus:ring-2 focus:ring-violet/20 focus:border-violet/40 transition"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || typing}
                  className="w-10 h-10 bg-gradient-to-br from-[#7C3AED] to-[#3B82F6] text-white rounded-xl
                             flex items-center justify-center disabled:opacity-40 transition-opacity"
                >
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}
                  >
                    send
                  </span>
                </button>
              </div>
              <p className="text-[10px] text-text-muted text-center">
                Coach remembers your sessions and weak areas
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
