"use client";

import { useState, useEffect } from "react";
import { useApiClient } from "@/lib/hooks/useApiClient";
import type { TeamData } from "@/lib/api/client";

export default function TeamPage() {
  const { api, ready } = useApiClient();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [maxSeats, setMaxSeats] = useState(10);
  const [creating, setCreating] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    api.getMyTeam()
      .then((data) => setTeam(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [api, ready]);

  async function handleCreate() {
    if (!teamName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const data = await api.createTeam(teamName.trim(), maxSeats);
      setTeam(data);
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite() {
    if (!team || !inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const data = await api.inviteToTeam(team.id, inviteEmail.trim());
      setTeam(data);
      setInviteEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to invite member");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (!team) return;
    try {
      const data = await api.removeFromTeam(team.id, memberId);
      setTeam(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface border border-border rounded-card animate-pulse" />
        ))}
      </div>
    );
  }

  // No team — show create option
  if (!team) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-heading-l text-text-pri">Team Plan</h2>
          <p className="text-body text-text-sec mt-1">
            Create a team to give your group Pro access and practice together
          </p>
        </div>

        {!showCreate ? (
          <div className="bg-surface border border-border rounded-card p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-text-muted mb-4 block">groups</span>
            <h3 className="text-text-pri font-semibold text-lg mb-2">No Team Yet</h3>
            <p className="text-text-sec text-sm max-w-md mx-auto mb-6">
              Create a team for your college, bootcamp, or study group.
              All members get Pro access included with the team plan.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] shadow-blue-glow"
            >
              Create a Team
            </button>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-card p-6">
            <h3 className="text-text-pri font-semibold mb-4">Create Your Team</h3>
            <div className="space-y-4">
              <div>
                <label className="text-text-sec text-xs uppercase tracking-wide block mb-1">Team Name</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., IIT Placement Prep 2026"
                  className="w-full bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri placeholder-text-muted focus:outline-none focus:border-blue"
                />
              </div>
              <div>
                <label className="text-text-sec text-xs uppercase tracking-wide block mb-1">Max Seats</label>
                <select
                  value={maxSeats}
                  onChange={(e) => setMaxSeats(Number(e.target.value))}
                  className="w-full bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri"
                >
                  {[5, 10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n} members</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 text-text-sec hover:text-text-pri text-sm transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !teamName.trim()}
                  className="btn-gradient text-white px-6 py-2.5 rounded-btn font-semibold text-[14px] disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Team"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pricing info */}
        <div className="bg-surface border border-border rounded-card p-6">
          <h3 className="text-text-pri font-semibold mb-3">Enterprise Plan Benefits</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "workspace_premium", text: "Pro access for all members" },
              { icon: "group", text: "Centralized team management" },
              { icon: "analytics", text: "Team analytics dashboard" },
              { icon: "mic", text: "Unlimited mock interviews" },
              { icon: "code", text: "All interview types included" },
              { icon: "support_agent", text: "Priority support" },
            ].map((b) => (
              <div key={b.text} className="flex items-center gap-2 text-sm text-text-sec">
                <span className="material-symbols-outlined text-[16px] text-blue">{b.icon}</span>
                {b.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Has team — show management
  const activeMembers = team.members.filter((m) => m.status !== "removed");
  const isOwner = team.members.some((m) => m.role === "owner" && m.status === "active");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-heading-l text-text-pri">{team.name}</h2>
          <p className="text-body text-text-sec mt-1">
            {activeMembers.length} of {team.maxSeats} seats used
          </p>
        </div>
        <span className="text-xs font-semibold bg-blue/10 text-blue px-3 py-1.5 rounded-full uppercase tracking-wide">
          {team.plan}
        </span>
      </div>

      {/* Seats bar */}
      <div className="bg-surface border border-border rounded-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-sec">Team Capacity</span>
          <span className="text-sm font-medium text-text-pri">{activeMembers.length}/{team.maxSeats}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue rounded-full transition-all"
            style={{ width: `${(activeMembers.length / team.maxSeats) * 100}%` }}
          />
        </div>
      </div>

      {/* Invite */}
      {isOwner && (
        <div className="bg-surface border border-border rounded-card p-5">
          <h3 className="text-text-pri font-semibold mb-3">Invite Member</h3>
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Enter email address"
              type="email"
              className="flex-1 bg-bg-app border border-border rounded-xl px-4 py-2.5 text-sm text-text-pri placeholder-text-muted focus:outline-none focus:border-blue"
              onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="btn-gradient text-white px-5 py-2.5 rounded-btn font-semibold text-[14px] disabled:opacity-50"
            >
              {inviting ? "..." : "Invite"}
            </button>
          </div>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        </div>
      )}

      {/* Members list */}
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-text-pri font-semibold">Members ({activeMembers.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {activeMembers.map((m) => (
            <div key={m.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center text-blue text-xs font-bold">
                  {(m.name?.[0] ?? m.email[0]).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm text-text-pri">{m.name ?? m.email}</div>
                  <div className="text-xs text-text-muted">{m.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  m.role === "owner" ? "bg-amber-50 text-amber-600" :
                  m.status === "pending" ? "bg-gray-50 text-text-muted" :
                  "bg-green-50 text-green-600"
                }`}>
                  {m.role === "owner" ? "Owner" : m.status === "pending" ? "Pending" : "Member"}
                </span>
                {isOwner && m.role !== "owner" && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-xs text-text-muted hover:text-red-500 transition"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
