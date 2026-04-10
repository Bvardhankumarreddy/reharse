"use client";

// Spec § 8. Pricing Page
// "Stripe-inspired. The Pro card should feel like the obvious choice."

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "/ month",
    description: "Perfect for getting started",
    highlight: false,
    cta: "Get Started",
    ctaHref: "/onboarding",
    features: [
      { text: "5 sessions / week",                  ok: true  },
      { text: "Behavioral interviews only",         ok: true  },
      { text: "Basic feedback report",              ok: true  },
      { text: "Question bank (100 questions)",      ok: true  },
      { text: "Voice mode",                         ok: false },
      { text: "Coding interviews",                  ok: false },
      { text: "System design",                      ok: false },
      { text: "Company-specific modes",             ok: false },
      { text: "AI Coach",                           ok: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    // Spec: "$19 / month (strikethrough $29, sale badge)"
    price: "$19",
    originalPrice: "$29",
    period: "/ month",
    description: "For serious candidates",
    highlight: true,
    badge: "Most Popular",
    cta: "Start Free Trial",
    ctaHref: "/onboarding",
    features: [
      { text: "Unlimited sessions",                 ok: true },
      { text: "All interview types",                ok: true },
      { text: "Voice + Text mode",                  ok: true },
      { text: "Full question bank (1,800+)",         ok: true },
      { text: "Detailed AI feedback",               ok: true },
      { text: "Progress tracking",                  ok: true },
      { text: "Company-specific modes",             ok: true },
      { text: "AI Coach (unlimited)",               ok: true },
      { text: "Resume-based questions",             ok: true },
    ],
  },
  {
    id: "teams",
    name: "Teams",
    price: "$49",
    period: "/ seat / month",
    periodSub: "billed annually",
    description: "For bootcamps and hiring orgs",
    highlight: false,
    cta: "Contact Sales",
    ctaHref: "mailto:sales@interviewai.app",
    features: [
      { text: "Everything in Pro",                  ok: true },
      { text: "Admin dashboard",                    ok: true },
      { text: "Cohort progress tracking",           ok: true },
      { text: "Custom question sets",               ok: true },
      { text: "Bulk invites",                       ok: true },
      { text: "White-label option",                 ok: true },
    ],
  },
] as const;

const FAQS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes — cancel any time from your account settings. You keep access until the end of your billing period. No questions asked.",
  },
  {
    q: "What AI model powers the interviews?",
    a: "Rehearse uses Claude by Anthropic — claude-sonnet-4-6 for question generation and real-time coaching, and claude-opus-4-6 for deep answer evaluation.",
  },
  {
    q: "Is my data private?",
    a: "Your sessions, transcripts, and resume are never used to train AI models. All data is encrypted at rest and in transit. You can delete your account and all data at any time.",
  },
];

function CheckIcon({ ok }: { ok: boolean }) {
  return ok
    ? <span className="material-symbols-outlined text-[#22C55E] text-[18px] flex-shrink-0"
        style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>check_circle</span>
    : <span className="material-symbols-outlined text-text-muted text-[18px] flex-shrink-0"
        style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>cancel</span>;
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-bg-app py-16 px-4">
      <div className="max-w-[1100px] mx-auto space-y-16">

        {/* ── Heading ── */}
        {/* Spec: "Page heading: 'Simple, honest pricing' (32px bold, centered)" */}
        <div className="text-center space-y-3">
          <h1 className="text-[32px] font-bold text-text-pri tracking-tight">
            Simple, honest pricing
          </h1>
          <p className="text-[18px] text-text-sec">
            Start free. Upgrade when you&apos;re ready to go deep.
          </p>
        </div>

        {/* ── Pricing cards ── */}
        {/* Spec: "3 pricing cards in a row (white, rounded 16px, subtle shadow)" */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={clsx(
                "bg-surface rounded-card p-7 flex flex-col gap-6 border transition-all",
                // Spec: "Pro card has blue shadow/glow"
                plan.highlight
                  ? "border-blue shadow-[0_8px_40px_rgba(59,130,246,0.18)] relative"
                  : "border-border shadow-card"
              )}
            >
              {/* Spec: "'Most Popular' badge (blue chip, top of card)" */}
              {plan.highlight && "badge" in plan && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 bg-blue text-white rounded-full label shadow-blue-glow" style={{ fontSize: 11 }}>
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div>
                <p className={clsx("label mb-1", plan.highlight ? "text-blue" : "text-text-sec")}>
                  {plan.name}
                </p>
                <div className="flex items-end gap-1.5">
                  <span className="text-[36px] font-black text-text-pri tracking-tight">{plan.price}</span>
                  {/* Spec: "strikethrough $29" for Pro */}
                  {"originalPrice" in plan && (
                    <span className="text-[18px] text-text-muted line-through mb-1">{plan.originalPrice}</span>
                  )}
                  <span className="text-[14px] text-text-sec mb-1">{plan.period}</span>
                </div>
                {"periodSub" in plan && (
                  <p className="text-small text-text-muted">{plan.periodSub}</p>
                )}
                <p className="text-small text-text-sec mt-1">{plan.description}</p>
              </div>

              {/* Feature list */}
              <ul className="space-y-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-center gap-2.5">
                    <CheckIcon ok={f.ok} />
                    <span className={clsx("text-small", f.ok ? "text-text-pri" : "text-text-muted")}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={plan.ctaHref}
                className={clsx(
                  "w-full py-3 rounded-btn font-bold text-[15px] text-center block transition-all hover:-translate-y-0.5 active:scale-95",
                  plan.highlight
                    ? "btn-gradient text-white shadow-blue-glow"
                    : "border border-border text-text-sec hover:border-blue/40 hover:text-blue"
                )}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* ── FAQ accordion ── */}
        {/* Spec: "FAQ accordion (3 items, collapsed)" */}
        <div className="max-w-[640px] mx-auto space-y-3">
          <h2 className="text-[22px] font-bold text-text-pri text-center mb-6">
            Frequently asked questions
          </h2>
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-bg-app transition-colors"
              >
                <span className="text-[15px] font-semibold text-text-pri">{faq.q}</span>
                <span className="material-symbols-outlined text-text-muted text-[20px] flex-shrink-0 transition-transform duration-200"
                  style={{ transform: openFaq === i ? "rotate(180deg)" : "rotate(0)" }}>
                  expand_more
                </span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 border-t border-border">
                  <p className="text-body text-text-sec leading-relaxed pt-4">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom CTA strip */}
        <div className="text-center space-y-4 py-8 border-t border-border">
          <p className="text-[18px] font-semibold text-text-pri">
            Ready to start? It&apos;s free — no credit card needed.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex btn-gradient text-white px-8 py-3.5 rounded-btn font-bold text-[15px]
                       shadow-blue-glow hover:-translate-y-0.5 transition-all"
          >
            Get Started Free →
          </Link>
        </div>

      </div>
    </div>
  );
}
