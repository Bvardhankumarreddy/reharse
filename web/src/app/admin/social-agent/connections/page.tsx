"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchToken, api, PLATFORM_LABEL, PLATFORM_COLOR,
  type SocialConnection, type SocialPlatform,
} from "../_helpers";

const LINKEDIN_PLATFORMS: SocialPlatform[] = ["linkedin_page", "linkedin_personal"];

interface ConnectionRowProps {
  platform: SocialPlatform;
  connection?: SocialConnection;
  onChange: () => void;
}

function ConnectionRow({ platform, connection, onChange }: ConnectionRowProps) {
  const [busy, setBusy] = useState(false);
  const accent = PLATFORM_COLOR[platform];
  const connected = !!connection;
  const expired = connection ? new Date(connection.tokenExpiresAt) < new Date() : false;

  async function connect() {
    setBusy(true);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      const { url } = await api<{ url: string }>(token, `/connect/linkedin?platform=${platform}`);
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to start OAuth");
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${PLATFORM_LABEL[platform]}? You'll need to re-authorize to publish again.`)) return;
    setBusy(true);
    const token = await fetchToken();
    if (!token) { setBusy(false); return; }
    try {
      await api(token, `/connections/${platform}`, { method: "DELETE" });
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <span
            className="w-3 h-3 rounded-full mt-1.5 shrink-0"
            style={{ backgroundColor: accent }}
          />
          <div>
            <h3 className="text-white font-bold text-lg">{PLATFORM_LABEL[platform]}</h3>
            {connected ? (
              <>
                <div className="text-[#B8C5E0] text-sm mt-0.5">
                  Connected as <span className="text-white font-semibold">{connection.accountName ?? connection.accountId}</span>
                </div>
                <div className="text-xs text-[#6B7799] mt-1">
                  Token {expired ? <span className="text-[#FF5C7C] font-semibold">expired</span> : `expires ${new Date(connection.tokenExpiresAt).toLocaleString()}`}
                  {connection.lastUsedAt && <> · last used {new Date(connection.lastUsedAt).toLocaleString()}</>}
                </div>
                {connection.lastError && (
                  <div className="text-xs text-[#FF5C7C] mt-1 max-w-md">⚠ {connection.lastError}</div>
                )}
              </>
            ) : (
              <div className="text-[#6B7799] text-sm mt-0.5">Not connected — posts to this platform won&apos;t auto-publish</div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {connected && (
            <button
              onClick={disconnect}
              disabled={busy}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-[#FF5C7C]/30 text-[#FF5C7C] hover:bg-[#FF5C7C]/10 disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
          <button
            onClick={connect}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold rounded-xl text-white disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {busy ? "..." : connected ? "Reconnect" : `Connect ${PLATFORM_LABEL[platform]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await fetchToken();
    if (!token) { setLoading(false); return; }
    try {
      const list = await api<SocialConnection[]>(token, "/connections");
      setConnections(list);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Read OAuth callback flash messages from query params
  useEffect(() => {
    const connected = searchParams.get("connected");
    const errorOauth = searchParams.get("error");
    const msg = searchParams.get("msg");
    if (connected !== null) setToast({ kind: "ok", msg: msg ? `✓ Connected: ${msg.replace(":", " — ")}` : "✓ Connected" });
    else if (errorOauth) setToast({ kind: "err", msg: msg ?? `OAuth failed: ${errorOauth}` });
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const byPlatform = new Map(connections.map((c) => [c.platform, c]));

  return (
    <div className="space-y-6 max-w-3xl">
      {toast && (
        <div className={`rounded-xl p-3 text-sm border ${
          toast.kind === "ok"
            ? "bg-[#00F5A0]/10 border-[#00F5A0]/30 text-[#00F5A0]"
            : "bg-[#FF5C7C]/10 border-[#FF5C7C]/30 text-[#FF5C7C]"
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="bg-gradient-to-br from-[#151B3D] to-[#0F1438] border border-[#00D4FF]/20 rounded-2xl p-5">
        <h2 className="text-white font-bold text-lg mb-1">🔗 Platform Connections</h2>
        <p className="text-[#B8C5E0] text-sm">
          Authorize once — approved posts will auto-publish at their scheduled time. The cron checks every minute.
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-32 bg-[#151B3D] rounded-2xl animate-pulse" />
          ))
        ) : (
          LINKEDIN_PLATFORMS.map((p) => (
            <ConnectionRow
              key={p}
              platform={p}
              connection={byPlatform.get(p)}
              onChange={load}
            />
          ))
        )}
      </div>

      <div className="bg-[#151B3D] border border-white/10 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3">⚙️ Setup</h3>
        <ol className="space-y-2 text-sm text-[#B8C5E0] list-decimal list-inside">
          <li>Create a LinkedIn app at <a className="text-[#00D4FF] hover:underline" href="https://www.linkedin.com/developers/" target="_blank" rel="noopener">linkedin.com/developers</a></li>
          <li>Add redirect URL: <code className="text-[#FFD700] bg-[#0A0E27] px-1.5 py-0.5 rounded">https://reharse.inferix.in/api/v1/social-agent/oauth/linkedin/callback</code></li>
          <li>Request products: <em>Sign In with OpenID Connect</em>, <em>Share on LinkedIn</em>, and (for page posting) <em>Marketing Developer Platform</em></li>
          <li>Set env vars on the API: <code className="text-[#FFD700] bg-[#0A0E27] px-1.5 py-0.5 rounded">LINKEDIN_CLIENT_ID</code>, <code className="text-[#FFD700] bg-[#0A0E27] px-1.5 py-0.5 rounded">LINKEDIN_CLIENT_SECRET</code>, <code className="text-[#FFD700] bg-[#0A0E27] px-1.5 py-0.5 rounded">LINKEDIN_REDIRECT_URI</code>, <code className="text-[#FFD700] bg-[#0A0E27] px-1.5 py-0.5 rounded">ENCRYPTION_KEY</code></li>
          <li>Click <strong>Connect</strong> above to start the OAuth flow</li>
        </ol>
      </div>
    </div>
  );
}
