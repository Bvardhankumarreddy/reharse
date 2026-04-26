import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Weekly AI Quiz | Rehearse",
  description: "Take this week's AI knowledge quiz. Win prizes weekly!",
};

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0E27] text-white antialiased">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0A0E27] via-[#0F1438] to-[#0A0E27] -z-10" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,212,255,0.08),_transparent_50%)] -z-10" />
      {children}
    </div>
  );
}
