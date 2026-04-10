import type { Config } from "tailwindcss";

// Design tokens sourced from ai_mock_interview_figma_spec.md § 2. Design System
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // ── Color Palette (spec § 2) ──────────────────────────────────────────
      colors: {
        // Surfaces
        "bg-app":     "#F7F8FA",
        "surface":    "#FFFFFF",
        "border":     "#E2E6ED",
        // Text
        "text-pri":   "#0F172A",
        "text-sec":   "#64748B",
        "text-muted": "#94A3B8",
        // Accent / action colors
        "blue":       "#3B82F6",
        "violet":     "#7C3AED",
        "green":      "#22C55E",
        "amber":      "#F59E0B",
        "red":        "#EF4444",
        "teal":       "#0EA5E9",
        "pink":       "#EC4899",
        // Score bands
        score: {
          strong: "#22C55E",   // 80–100
          good:   "#3B82F6",   // 60–79
          fair:   "#F59E0B",   // 40–59
          weak:   "#EF4444",   // 0–39
        },
        // Interview type accents
        behavioral:  "#7C3AED",
        coding:      "#0EA5E9",
        design:      "#F59E0B",
        hr:          "#22C55E",
        "case-study":"#EC4899",
        // Dark mode surfaces
        "dark-bg":      "#0D0F14",
        "dark-surface": "#151820",
        "dark-border":  "#1E2330",
      },

      // ── Typography (spec § 2) ─────────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        // heading-xl: 36px/700
        "heading-xl": ["36px", { lineHeight: "1.1", fontWeight: "700" }],
        // heading-l: 28px/600
        "heading-l":  ["28px", { lineHeight: "1.2", fontWeight: "600" }],
        // heading-m: 20px/600
        "heading-m":  ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        // body-l: 16px/400
        "body-l":     ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        // body: 15px/400
        "body":       ["15px", { lineHeight: "1.6", fontWeight: "400" }],
        // small: 13px/400
        "small":      ["13px", { lineHeight: "1.5", fontWeight: "400" }],
        // label: 11px/600 uppercase
        "label":      ["11px", { lineHeight: "1.4", fontWeight: "600" }],
        // code: 14px/400
        "code":       ["14px", { lineHeight: "1.7", fontWeight: "400" }],
      },

      // ── Spacing (spec § 2) ────────────────────────────────────────────────
      spacing: {
        "sidebar":      "240px",
        "right-panel":  "340px",
        "card-pad":     "24px",
        "row-compact":  "44px",
        "row-comfort":  "56px",
      },

      // ── Max widths ─────────────────────────────────────────────────────────
      maxWidth: {
        app:       "1440px",
        interview: "880px",
        modal:     "560px",
      },

      // ── Border radius ─────────────────────────────────────────────────────
      borderRadius: {
        card:   "16px",
        btn:    "12px",
        chip:   "20px",
        editor: "8px",
      },

      // ── Box shadows ───────────────────────────────────────────────────────
      boxShadow: {
        card:     "0 1px 4px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.04)",
        float:    "0 8px 32px rgba(15,23,42,0.12)",
        "blue-glow": "0 4px 20px rgba(59,130,246,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
