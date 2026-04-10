"use client";

// Spec § 5. Key Interaction Patterns:
// ⌘K — open command bar | ⌘N — start new interview | Esc — close

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import CommandBar from "@/components/CommandBar";
import AiCoachPanel from "@/components/AiCoachPanel";
import PageTransition from "@/components/PageTransition";
import DashboardProvider from "@/components/DashboardProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [cmdOpen,   setCmdOpen]   = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const router = useRouter();

  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    // Spec: ⌘K — open command bar
    if (meta && e.key === "k") { e.preventDefault(); setCmdOpen((o) => !o); return; }
    // Spec: ⌘N — start new interview
    if (meta && e.key === "n") { e.preventDefault(); router.push("/interview/setup"); return; }
    // Spec: ⌘⇧P — go to progress
    if (meta && e.shiftKey && e.key === "p") { e.preventDefault(); router.push("/progress"); return; }
    // Spec: ⌘⇧Q — open question bank
    if (meta && e.shiftKey && e.key === "q") { e.preventDefault(); router.push("/question-bank"); return; }
    // Esc — close any overlay
    if (e.key === "Escape") { setCmdOpen(false); setCoachOpen(false); }
  }, [router]);

  useEffect(() => {
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  return (
    <DashboardProvider>
    <div className="min-h-screen bg-bg-app">
      <Sidebar onCoachOpen={() => setCoachOpen(true)} />
      <TopBar  onCmdOpen={() => setCmdOpen(true)} onCoachOpen={() => setCoachOpen(true)} />

      <div className="lg:pl-[240px]">
        <main className="max-w-app mx-auto px-4 lg:px-8 py-6 lg:py-8">
          <AnimatePresence mode="wait">
            <PageTransition>{children}</PageTransition>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav />

      {/* Mobile FAB */}
      <button
        onClick={() => router.push("/interview/setup")}
        aria-label="Start interview"
        className="lg:hidden fixed bottom-20 right-5 z-40 w-14 h-14
                   btn-gradient text-white rounded-2xl shadow-blue-glow
                   flex items-center justify-center transition-all active:scale-95"
      >
        <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>add</span>
      </button>

      <div className="lg:hidden h-24" />

      {/* Global overlays */}
      <CommandBar  open={cmdOpen}   onClose={() => setCmdOpen(false)}   />
      <AiCoachPanel open={coachOpen} onClose={() => setCoachOpen(false)} />
    </div>
    </DashboardProvider>
  );
}
