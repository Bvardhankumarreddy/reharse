"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR, CONTENT_TYPE_LABEL,
  type SocialPlatform,
} from "../_helpers";

interface Experiment {
  experimentId: string;
  platform: SocialPlatform;
  contentType: string;
  variantCount: number;
  posts: Array<{ id: string; textContent: string; status: string; externalUrl: string | null }>;
  createdAt: string;
}

interface AudienceSnapshot {
  id: string;
  platform: SocialPlatform;
  snapshotDate: string;
  totalAudience: number;
  ageBuckets: Record<string, number>;
  gender: Record<string, number>;
  topCountries: Record<string, number>;
  topCities: Record<string, number>;
}

interface Insight {
  id: string;
  insightType: string;
  platform: string | null;
  insightData: { finding: string; recommendation: string };
  confidenceScore: string | number;
  generatedAt: string;
}

interface AnalyticsSummary {
  period: { since: string; until: string };
  totalPosts: number;
  totalEngagement: { likes: number; comments: number; shares: number; saves: number; impressions: number };
  avgEngagementRate: number;
  platformComparison: Array<{
    platform: SocialPlatform; posts: number; engagement: number; impressions: number;
    avgEngagementPerPost: number; engagementRate: number;
  }>;
  contentTypePerformance: Array<{
    contentType: string; posts: number; engagement: number; avgEngagementPerPost: number;
  }>;
  engagementTrend: Array<{ date: string; likes: number; comments: number; shares: number; impressions: number }>;
  topPosts: Array<{
    id: string; platform: SocialPlatform; contentType: string; textContent: string;
    externalUrl: string | null; publishedAt: string | null;
    likes: number; comments: number; shares: number; impressions: number; engagement: number;
  }>;
  insights: Insight[];
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-1">{label}</div>
      <div className="text-3xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-[#6B7799] mt-1">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [audience, setAudience] = useState<AudienceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [syncingAudience, setSyncingAudience] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const [summary, exps, aud] = await Promise.all([
        api<AnalyticsSummary>(token, "/analytics"),
        api<Experiment[]>(token, "/experiments"),
        api<AudienceSnapshot[]>(token, "/audience"),
      ]);
      setData(summary);
      setExperiments(exps);
      setAudience(aud);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally { setLoading(false); }
  }, []);

  async function syncAudienceNow() {
    setSyncingAudience(true);
    const token = await fetchToken();
    if (!token) { setSyncingAudience(false); return; }
    try {
      await api(token, "/audience/sync", { method: "POST" });
      await load();
    } finally { setSyncingAudience(false); }
  }

  async function exportPostsCSV() {
    const token = await fetchToken();
    if (!token) return;
    const res = await fetch("/api/v1/admin/social-agent/reports/posts.csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social_posts_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportTimeseriesCSV() {
    const token = await fetchToken();
    if (!token) return;
    const res = await fetch("/api/v1/admin/social-agent/reports/timeseries.csv", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social_timeseries_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { void load(); }, [load]);

  async function generateInsights() {
    setGenerating(true);
    const token = await fetchToken();
    if (!token) { setGenerating(false); return; }
    try {
      await api<{ generated: number }>(token, "/insights/generate", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate insights");
    } finally { setGenerating(false); }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-[#151B3D] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="bg-[#FF5C7C]/10 border border-[#FF5C7C]/30 rounded-xl p-4 text-[#FF5C7C]">{error}</div>;
  }

  if (!data || data.totalPosts === 0) {
    return (
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-12 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-white font-bold text-lg mb-1">No published posts yet</h3>
        <p className="text-[#B8C5E0] text-sm">Approve and publish some posts — analytics will populate here within an hour.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Posts (30d)"        value={data.totalPosts}                        color="#00D4FF" />
        <StatCard label="Total Engagement"   value={(data.totalEngagement.likes + data.totalEngagement.comments + data.totalEngagement.shares).toLocaleString()} sub="likes + comments + shares" color="#FFD700" />
        <StatCard label="Impressions"        value={data.totalEngagement.impressions.toLocaleString() || "—"} color="#7C3AED" />
        <StatCard label="Avg Engagement"     value={`${data.avgEngagementRate}%`}             sub="across all posts" color="#00F5A0" />
      </div>

      {/* Engagement trend */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <h2 className="text-white font-bold mb-4">Engagement Trend (30 days)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data.engagementTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3158" />
            <XAxis dataKey="date" stroke="#6B7799" fontSize={11} tickFormatter={(v: string) => v.slice(5)} />
            <YAxis stroke="#6B7799" fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: "#151B3D", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
              labelStyle={{ color: "#B8C5E0" }}
            />
            <Line type="monotone" dataKey="likes"      stroke="#00D4FF" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="comments"   stroke="#FFD700" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="shares"     stroke="#00F5A0" strokeWidth={2} dot={false} />
            {data.totalEngagement.impressions > 0 && (
              <Line type="monotone" dataKey="impressions" stroke="#7C3AED" strokeWidth={2} dot={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Platform comparison */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <h2 className="text-white font-bold mb-4">Platform Performance</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.platformComparison.map((p) => ({ ...p, label: PLATFORM_LABEL[p.platform] }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A3158" />
            <XAxis dataKey="label" stroke="#6B7799" fontSize={11} />
            <YAxis stroke="#6B7799" fontSize={11} />
            <Tooltip
              contentStyle={{ backgroundColor: "#151B3D", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
              labelStyle={{ color: "#B8C5E0" }}
            />
            <Bar dataKey="avgEngagementPerPost" fill="#00D4FF" name="Avg engagement / post" />
          </BarChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#6B7799] uppercase tracking-widest">
                <th className="text-left py-2">Platform</th>
                <th className="text-right py-2">Posts</th>
                <th className="text-right py-2">Engagement</th>
                <th className="text-right py-2">Impressions</th>
                <th className="text-right py-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.platformComparison.map((p) => (
                <tr key={p.platform} className="border-t border-white/5 text-[#B8C5E0]">
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[p.platform] }} />
                      {PLATFORM_LABEL[p.platform]}
                    </span>
                  </td>
                  <td className="text-right">{p.posts}</td>
                  <td className="text-right">{p.engagement.toLocaleString()}</td>
                  <td className="text-right">{p.impressions ? p.impressions.toLocaleString() : "—"}</td>
                  <td className="text-right">{p.engagementRate ? `${p.engagementRate}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-br from-[#151B3D] to-[#0F1438] border border-[#7C3AED]/30 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold flex items-center gap-2">
            <span>🤖</span> AI Insights
          </h2>
          <button
            onClick={generateInsights}
            disabled={generating}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#7C3AED]/40 text-[#7C3AED] hover:bg-[#7C3AED]/10 disabled:opacity-50"
          >
            {generating ? "Generating…" : "🔄 Generate Now"}
          </button>
        </div>
        {data.insights.length === 0 ? (
          <p className="text-[#6B7799] text-sm">
            No insights yet. They auto-generate daily at 06:30 UTC, or click <strong>Generate Now</strong>. Needs ≥3 published posts.
          </p>
        ) : (
          <div className="space-y-3">
            {data.insights.map((i) => {
              const conf = Number(i.confidenceScore);
              const confColor = conf >= 0.8 ? "#00F5A0" : conf >= 0.5 ? "#FFD700" : "#FF5C7C";
              return (
                <div key={i.id} className="bg-[#0A0E27]/60 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-[#7C3AED]/20 text-[#7C3AED] px-2 py-0.5 rounded">
                      {i.insightType.replace(/_/g, " ")}
                    </span>
                    {i.platform && (
                      <span className="text-[10px] text-[#B8C5E0]">
                        {i.platform === "all" ? "All platforms" : PLATFORM_LABEL[i.platform as SocialPlatform] ?? i.platform}
                      </span>
                    )}
                    <span className="text-[10px] font-bold ml-auto" style={{ color: confColor }}>
                      {Math.round(conf * 100)}% confidence
                    </span>
                  </div>
                  <div className="text-white text-sm font-medium leading-snug">{i.insightData.finding}</div>
                  <div className="text-[#B8C5E0] text-xs mt-1.5">→ {i.insightData.recommendation}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Phase 5: A/B Experiments */}
      {experiments.length > 0 && (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-bold mb-4 flex items-center gap-2">🧪 A/B Experiments ({experiments.length})</h2>
          <div className="space-y-3">
            {experiments.map((exp) => (
              <div key={exp.experimentId} className="bg-[#0A0E27]/60 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[exp.platform] }} />
                  <span className="text-white text-sm font-semibold">{PLATFORM_LABEL[exp.platform]}</span>
                  <span className="text-[#6B7799] text-xs">·</span>
                  <span className="text-[#B8C5E0] text-xs">{exp.contentType}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#FFD700]/15 text-[#FFD700] px-2 py-0.5 rounded ml-auto">
                    {exp.variantCount} variants
                  </span>
                </div>
                <div className="space-y-1">
                  {exp.posts.map((p, vi) => (
                    <div key={p.id} className="flex items-start gap-2 text-xs">
                      <span className="text-[#FFD700] font-bold w-5 shrink-0">{String.fromCharCode(65 + vi)}.</span>
                      <span className="text-[#B8C5E0] flex-1 line-clamp-2">{p.textContent.slice(0, 200)}</span>
                      <span className="text-[10px] text-[#6B7799] shrink-0">{p.status}</span>
                      {p.externalUrl && (
                        <a href={p.externalUrl} target="_blank" rel="noopener" className="text-[#00D4FF] text-[10px] shrink-0">↗</a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 5: Audience demographics */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold flex items-center gap-2">👥 Audience Demographics</h2>
          <button
            onClick={syncAudienceNow}
            disabled={syncingAudience}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#00D4FF]/40 text-[#00D4FF] hover:bg-[#00D4FF]/10 disabled:opacity-50"
          >
            {syncingAudience ? "Syncing…" : "🔄 Sync Now"}
          </button>
        </div>
        {audience.length === 0 ? (
          <p className="text-[#6B7799] text-sm">
            No audience snapshots yet. Connect Instagram + click <strong>Sync Now</strong>. Auto-runs Mondays @ 07:00 UTC.
            (LinkedIn requires Marketing Developer Platform; YouTube needs YouTube Analytics API — not wired yet.)
          </p>
        ) : (
          <div className="space-y-4">
            {audience.map((a) => (
              <div key={a.id} className="bg-[#0A0E27]/60 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[a.platform] }} />
                  <span className="text-white text-sm font-semibold">{PLATFORM_LABEL[a.platform]}</span>
                  <span className="text-[#FFD700] text-sm font-bold">{a.totalAudience.toLocaleString()} followers</span>
                  <span className="text-[10px] text-[#6B7799] ml-auto">{a.snapshotDate}</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <DemoBlock title="Age" data={a.ageBuckets} />
                  <DemoBlock title="Gender" data={a.gender} />
                  <DemoBlock title="Top Countries" data={a.topCountries} limit={5} />
                  <DemoBlock title="Top Cities" data={a.topCities} limit={5} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Phase 5: Export */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <h2 className="text-white font-bold mb-3 flex items-center gap-2">📥 Export Reports</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportPostsCSV}
            className="px-4 py-2 bg-[#00F5A0]/15 border border-[#00F5A0]/40 text-[#00F5A0] text-sm font-semibold rounded-xl hover:bg-[#00F5A0]/25"
          >
            📄 Download Posts CSV
          </button>
          <button
            onClick={exportTimeseriesCSV}
            className="px-4 py-2 bg-[#7C3AED]/15 border border-[#7C3AED]/40 text-[#7C3AED] text-sm font-semibold rounded-xl hover:bg-[#7C3AED]/25"
          >
            📈 Download Timeseries CSV
          </button>
        </div>
        <p className="text-[#6B7799] text-xs mt-2">
          Posts CSV: one row per published post with latest engagement snapshot.
          Timeseries CSV: daily engagement per platform — pivot in Excel for charts.
        </p>
      </div>

      {/* Content type performance */}
      {data.contentTypePerformance.length > 0 && (
        <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-bold mb-4">What&apos;s Working — by Content Type</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6B7799] uppercase tracking-widest">
                  <th className="text-left py-2">Content Type</th>
                  <th className="text-right py-2">Posts</th>
                  <th className="text-right py-2">Total Engagement</th>
                  <th className="text-right py-2">Avg / Post</th>
                </tr>
              </thead>
              <tbody>
                {data.contentTypePerformance.map((c) => (
                  <tr key={c.contentType} className="border-t border-white/5 text-[#B8C5E0]">
                    <td className="py-2 text-white font-medium">{CONTENT_TYPE_LABEL[c.contentType as keyof typeof CONTENT_TYPE_LABEL] ?? c.contentType}</td>
                    <td className="text-right">{c.posts}</td>
                    <td className="text-right">{c.engagement.toLocaleString()}</td>
                    <td className="text-right text-[#FFD700] font-semibold">{c.avgEngagementPerPost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top posts */}
      <div className="bg-[#151B3D] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-bold">🏆 Top Posts (30 days)</h2>
        </div>
        <div className="divide-y divide-white/5">
          {data.topPosts.slice(0, 10).map((p, i) => (
            <div key={p.id} className="px-5 py-3 flex items-start gap-3">
              <span className="text-[#FFD700] font-bold text-sm w-6 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLOR[p.platform] }} />
                  <span className="text-white text-xs font-semibold">{PLATFORM_LABEL[p.platform]}</span>
                  <span className="text-[#6B7799] text-xs">·</span>
                  <span className="text-[#B8C5E0] text-xs">{CONTENT_TYPE_LABEL[p.contentType as keyof typeof CONTENT_TYPE_LABEL] ?? p.contentType}</span>
                  <span className="text-[#6B7799] text-xs ml-auto">
                    {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <p className="text-[#B8C5E0] text-xs line-clamp-2">{p.textContent}</p>
                <div className="flex gap-3 text-[10px] text-[#6B7799] mt-1.5">
                  <span>❤️ {p.likes}</span>
                  <span>💬 {p.comments}</span>
                  <span>🔁 {p.shares}</span>
                  {p.impressions > 0 && <span>👁 {p.impressions.toLocaleString()}</span>}
                  {p.externalUrl && (
                    <a
                      href={p.externalUrl}
                      target="_blank"
                      rel="noopener"
                      className="ml-auto text-[#00D4FF] hover:underline"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DemoBlock({ title, data, limit = 6 }: { title: string; data: Record<string, number>; limit?: number }) {
  const entries = Object.entries(data ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (entries.length === 0) {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#6B7799] mb-1">{title}</div>
        <div className="text-[#4A5470] text-xs">—</div>
      </div>
    );
  }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#B8C5E0] mb-1">{title}</div>
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-[#B8C5E0] text-[11px] w-16 truncate">{k}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#00D4FF] rounded-full" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="text-[#FFD700] text-[10px] w-10 text-right tabular-nums">{v.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
