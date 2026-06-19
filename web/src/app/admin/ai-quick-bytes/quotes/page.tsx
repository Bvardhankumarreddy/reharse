"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fetchToken } from "../_helpers";

// ── Types ──────────────────────────────────────────────────────────────────

type Lang = "en" | "te";

interface Quote {
  id:            string;
  language:      Lang;
  text:          string;
  author:        string;
  source:        string | null;
  themes:        string[];
  timesUsed:     number;
  lastUsedAt:    string | null;
  isActive:      boolean;
  createdAt:     string;
}

interface ListResponse {
  rows:        Quote[];
  total:       number;
  activeCount: number;
}

interface Suggestion {
  text:    string;
  author:  string;
  source?: string | null;
  themes:  string[];
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AqbQuotesAdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { void fetchToken().then(setToken); }, []);

  const onToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  }, []);

  if (!token) {
    return <div className="p-8 text-[#6B7799] text-sm">Loading…</div>;
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-white">AQB Quote Bank</h1>
          <p className="text-[12px] text-[#6B7799] mt-1">
            Closing motivational quotes injected into every short. Telugu seeded later — start with English.
          </p>
        </div>
      </header>

      <QuotePanel token={token} onToast={onToast} />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#151B3D] border border-white/15 text-white text-[13px] px-4 py-2.5 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

function QuotePanel({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [language, setLanguage] = useState<Lang>("en");
  const [activeFilter, setActiveFilter] = useState<"true" | "false" | "">("true");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Modals
  const [showAdd, setShowAdd]           = useState(false);
  const [showSuggest, setShowSuggest]   = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ language, page: String(page), pageSize: String(pageSize) });
      if (activeFilter) qs.set("active", activeFilter);
      if (search.trim()) qs.set("search", search.trim());
      setData(await api<ListResponse>(token, `/quotes?${qs.toString()}`));
    } catch (e) { onToast(`⚠ ${(e as Error).message}`); }
  }, [token, language, activeFilter, search, page, onToast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Stats + filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <Stat label="Active" value={data?.activeCount ?? 0} accent="text-[#00F5A0]" />
        <Stat label="In view" value={data?.total ?? 0} />

        <div className="flex gap-1 ml-auto">
          {(["en", "te"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => { setLanguage(l); setPage(1); }}
              className={
                "px-3 py-1.5 rounded-full text-xs font-medium transition " +
                (language === l
                  ? "bg-[#00D4FF] text-[#0A0E27]"
                  : "bg-white/5 text-[#B8C5E0] hover:bg-white/10")
              }
            >
              {l === "en" ? "English" : "Telugu"}
            </button>
          ))}
        </div>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value as "true" | "false" | ""); setPage(1); }}
          className="bg-[#151B3D] border border-white/10 rounded-lg text-[12px] text-white px-2 py-1.5"
        >
          <option value="true">Active only</option>
          <option value="false">Retired only</option>
          <option value="">All</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void load(); } }}
          placeholder="Search text / author / theme…"
          className="bg-[#151B3D] border border-white/10 rounded-lg text-[12px] text-white px-2.5 py-1.5 w-56"
        />
        <button
          onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 rounded-lg bg-[#00D4FF] text-[#0A0E27] text-xs font-semibold hover:bg-[#00D4FF]/90"
        >
          + Add quote
        </button>
        <button
          onClick={() => setShowSuggest(true)}
          className="px-3 py-1.5 rounded-lg border border-[#FFB020]/40 text-[#FFB020] text-xs font-semibold hover:bg-[#FFB020]/10"
        >
          ✨ Suggest with Claude
        </button>
      </div>

      {/* List */}
      {!data ? (
        <Loading />
      ) : data.rows.length === 0 ? (
        <Empty
          msg={
            (data.total === 0 && data.activeCount === 0)
              ? "Bank is empty. Click ✨ Suggest with Claude to get a draft batch, or + Add quote for one-offs."
              : "No quotes match the current filter."
          }
        />
      ) : (
        <div className="bg-[#151B3D] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          {data.rows.map((q) => (
            <QuoteRow key={q.id} q={q} token={token} onToast={onToast} onReload={load} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > pageSize && (
        <div className="flex items-center justify-between text-[12px] text-[#B8C5E0]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 border border-white/10 rounded-lg disabled:opacity-40"
          >
            ← Prev
          </button>
          <span>Page {page} of {Math.ceil(data.total / pageSize)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * pageSize >= data.total}
            className="px-3 py-1.5 border border-white/10 rounded-lg disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {showAdd && (
        <AddQuoteModal
          language={language}
          token={token}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); void load(); onToast("✓ Quote added"); }}
          onToast={onToast}
        />
      )}
      {showSuggest && (
        <SuggestQuotesModal
          language={language}
          token={token}
          onClose={() => setShowSuggest(false)}
          onSaved={(n) => { setShowSuggest(false); void load(); onToast(`✓ Added ${n} quote(s)`); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function QuoteRow({
  q, token, onToast, onReload,
}: { q: Quote; token: string; onToast: (m: string) => void; onReload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await api(token, `/quotes/${q.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !q.isActive }),
      });
      await onReload();
      onToast(q.isActive ? "Quote retired" : "Quote reactivated");
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white leading-relaxed">“{q.text}”</p>
        <div className="mt-1 text-[11px] text-[#B8C5E0]">
          — {q.author}
          {q.source && <span className="text-[#6B7799]"> · {q.source}</span>}
        </div>
        {q.themes.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {q.themes.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] text-[#B8C5E0]">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 text-[10px] text-[#6B7799]">
          Used {q.timesUsed}× · {q.lastUsedAt ? `last ${new Date(q.lastUsedAt).toLocaleDateString()}` : "never used"}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={
            "text-[10px] px-2 py-0.5 rounded-full " +
            (q.isActive ? "bg-[#00F5A0]/15 text-[#00F5A0]" : "bg-white/5 text-[#6B7799]")
          }
        >
          {q.isActive ? "active" : "retired"}
        </span>
        <button
          onClick={toggleActive}
          disabled={busy}
          className="text-[11px] text-[#B8C5E0] hover:text-white disabled:opacity-50"
        >
          {busy ? "…" : q.isActive ? "Retire" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

// ── Add quote modal ────────────────────────────────────────────────────────

function AddQuoteModal({
  language, token, onClose, onSaved, onToast,
}: {
  language: Lang; token: string;
  onClose: () => void; onSaved: () => void; onToast: (m: string) => void;
}) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState("");
  const [themesRaw, setThemesRaw] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!text.trim() || !author.trim()) {
      onToast("Text and author are required");
      return;
    }
    setBusy(true);
    try {
      await api(token, "/quotes", {
        method: "POST",
        body: JSON.stringify({
          language,
          text:   text.trim(),
          author: author.trim(),
          source: source.trim() || undefined,
          themes: themesRaw.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      onSaved();
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <ModalShell onClose={onClose} title={`Add ${language === "en" ? "English" : "Telugu"} quote`}>
      <div className="space-y-3">
        <Field label="Quote" required>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-lg p-2.5 text-[13px] text-white"
          />
        </Field>
        <Field label="Author" required>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-lg p-2.5 text-[13px] text-white"
          />
        </Field>
        <Field label="Source (book / speech / film, optional)">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-lg p-2.5 text-[13px] text-white"
          />
        </Field>
        <Field label="Themes (comma-separated, e.g. perseverance, learning)">
          <input
            value={themesRaw}
            onChange={(e) => setThemesRaw(e.target.value)}
            className="w-full bg-[#0A0E27] border border-white/10 rounded-lg p-2.5 text-[13px] text-white"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 border border-white/10 rounded-lg text-[12px] text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-[#00D4FF] text-[#0A0E27] text-[12px] font-semibold disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Suggest + approve modal ────────────────────────────────────────────────

function SuggestQuotesModal({
  language, token, onClose, onSaved, onToast,
}: {
  language: Lang; token: string;
  onClose: () => void; onSaved: (n: number) => void; onToast: (m: string) => void;
}) {
  const [count, setCount] = useState(10);
  const [themesHint, setThemesHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  async function suggest() {
    setBusy(true);
    try {
      const { quotes } = await api<{ quotes: Suggestion[] }>(token, "/quotes/suggest", {
        method: "POST",
        body: JSON.stringify({
          language,
          count,
          themesHint: themesHint.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setSuggestions(quotes);
      // Pre-select all by default so admin can rapidly deselect bad ones.
      setSelected(new Set(quotes.map((_, i) => i)));
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function approve() {
    if (!suggestions || selected.size === 0) return;
    const picked = Array.from(selected).map((i) => suggestions[i]).filter(Boolean);
    setBusy(true);
    try {
      const { inserted } = await api<{ inserted: number; skipped: number }>(
        token,
        "/quotes/bulk",
        { method: "POST", body: JSON.stringify({ language, quotes: picked }) },
      );
      onSaved(inserted);
    } catch (e) {
      onToast(`⚠ ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const toggle = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i); else next.add(i);
    setSelected(next);
  };

  return (
    <ModalShell
      onClose={onClose}
      title={`Suggest ${language === "en" ? "English" : "Telugu"} quotes`}
      wide
    >
      {!suggestions ? (
        <div className="space-y-3">
          <p className="text-[12px] text-[#B8C5E0]">
            Claude drafts candidate quotes. Nothing is saved until you tick + approve.
            Existing quotes are passed in to avoid duplicates.
          </p>
          <Field label="How many to draft">
            <input
              type="number" min={3} max={20}
              value={count}
              onChange={(e) => setCount(Math.min(20, Math.max(3, Number(e.target.value) || 10)))}
              className="w-24 bg-[#0A0E27] border border-white/10 rounded-lg p-2 text-[13px] text-white"
            />
          </Field>
          <Field label="Themes to favour (optional, comma-separated)">
            <input
              value={themesHint}
              onChange={(e) => setThemesHint(e.target.value)}
              placeholder="e.g. resilience, ownership, craftsmanship"
              className="w-full bg-[#0A0E27] border border-white/10 rounded-lg p-2 text-[13px] text-white"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-1.5 border border-white/10 rounded-lg text-[12px] text-white">
              Cancel
            </button>
            <button
              onClick={suggest}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-[#FFB020] text-[#0A0E27] text-[12px] font-semibold disabled:opacity-50"
            >
              {busy ? "Drafting…" : "Draft candidates"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-[#B8C5E0]">
            Reviewed {suggestions.length} candidates. Untick anything that is misattributed or doesn't fit.
            <span className="text-[#FFB020] font-semibold"> Selected: {selected.size}</span>
          </p>
          <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
            {suggestions.map((s, i) => (
              <label
                key={i}
                className={
                  "block border rounded-xl p-3 cursor-pointer transition " +
                  (selected.has(i)
                    ? "border-[#FFB020]/50 bg-[#FFB020]/5"
                    : "border-white/10 bg-[#0A0E27] hover:border-white/20")
                }
              >
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white">“{s.text}”</p>
                    <div className="text-[11px] text-[#B8C5E0] mt-1">
                      — {s.author}
                      {s.source && <span className="text-[#6B7799]"> · {s.source}</span>}
                    </div>
                    {s.themes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.themes.map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] text-[#B8C5E0]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-between gap-2 pt-1">
            <button
              onClick={() => { setSuggestions(null); setSelected(new Set()); }}
              className="px-3 py-1.5 border border-white/10 rounded-lg text-[12px] text-white"
            >
              ← Redraft
            </button>
            <button
              onClick={approve}
              disabled={busy || selected.size === 0}
              className="px-3 py-1.5 rounded-lg bg-[#00D4FF] text-[#0A0E27] text-[12px] font-semibold disabled:opacity-50"
            >
              {busy ? "Saving…" : `Add ${selected.size} to bank`}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function ModalShell({
  title, onClose, children, wide,
}: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={"bg-[#151B3D] border border-white/10 rounded-2xl p-5 w-full " + (wide ? "max-w-3xl" : "max-w-md")}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-[#B8C5E0] hover:text-white text-[18px]">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#B8C5E0] mb-1">
        {label}
        {required && <span className="text-[#FF6B6B]"> *</span>}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-[#151B3D] border border-white/5 rounded-xl px-3 py-2">
      <div className="text-[10px] text-[#6B7799] uppercase tracking-wide">{label}</div>
      <div className={"text-[16px] font-bold " + (accent ?? "text-white")}>{value}</div>
    </div>
  );
}

function Loading() {
  return <div className="p-6 text-center text-[#6B7799] text-[12px]">Loading…</div>;
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-8 text-center text-[#B8C5E0] text-[13px]">
      {msg}
    </div>
  );
}
