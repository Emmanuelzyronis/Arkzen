"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { blockedReasonLabels } from "@/lib/plain";
import { defaultServiceProfile } from "@/lib/domain/service-profile";

interface ProfileData {
  name: string;
  description: string;
  capabilities: string[];
  keywords: string[];
  negativeSignals: string[];
  locations: string[];
  minimumEngagement: string;
}

const DEFAULT_CAPABILITIES = defaultServiceProfile.capabilities;
const DEFAULT_NEGATIVES_RAW = defaultServiceProfile.negativeSignals;

export function ProfileEditor({ initialProfile }: { initialProfile: ProfileData }) {
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCap, setNewCap] = useState("");
  const [newNeg, setNewNeg] = useState("");

  function toggleCapability(cap: string) {
    setProfile((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter((c) => c !== cap)
        : [...prev.capabilities, cap],
    }));
  }

  function toggleNegative(neg: string) {
    setProfile((prev) => ({
      ...prev,
      negativeSignals: prev.negativeSignals.includes(neg)
        ? prev.negativeSignals.filter((n) => n !== neg)
        : [...prev.negativeSignals, neg],
    }));
  }

  function addCapability() {
    const trimmed = newCap.trim();
    if (!trimmed || profile.capabilities.includes(trimmed)) return;
    setProfile((prev) => ({ ...prev, capabilities: [...prev.capabilities, trimmed] }));
    setNewCap("");
  }

  function addNegative() {
    const trimmed = newNeg.trim();
    if (!trimmed || profile.negativeSignals.includes(trimmed)) return;
    setProfile((prev) => ({ ...prev, negativeSignals: [...prev.negativeSignals, trimmed] }));
    setNewNeg("");
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: profile.name.trim(),
          description: profile.description.trim(),
          capabilities: profile.capabilities,
          keywords: profile.keywords,
          negativeSignals: profile.negativeSignals,
          locations: profile.locations,
          minimumEngagement: profile.minimumEngagement?.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Could not save. Please try again.");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px] text-fg placeholder-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* Left column */}
      <div className="space-y-3">
        {/* About */}
        <Card>
          <CardHeader title="What you're looking for" subtitle="The profile behind every score and recommendation." />
          <CardBody className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-fg-muted">What you do</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. AI product engineering for small teams"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-fg-muted">Description</label>
              <textarea
                rows={3}
                value={profile.description}
                onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-fg-muted">Where you work</label>
                <input
                  type="text"
                  value={profile.locations.join(", ")}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      locations: e.target.value.split(",").map((l) => l.trim()).filter(Boolean),
                    }))
                  }
                  placeholder="e.g. Remote, EU/US"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-fg-muted">Minimum engagement</label>
                <input
                  type="text"
                  value={profile.minimumEngagement}
                  onChange={(e) => setProfile((p) => ({ ...p, minimumEngagement: e.target.value }))}
                  placeholder="e.g. $2,000"
                  className={inputClass}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Capabilities */}
        <Card>
          <CardHeader
            title="What you sell"
            subtitle="Every post is read for these. The more it asks for, the higher it scores."
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DEFAULT_CAPABILITIES.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleCapability(cap)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    profile.capabilities.includes(cap)
                      ? "border-brand bg-brand-soft text-brand"
                      : "border-line bg-surface text-fg-soft hover:border-brand/40 hover:bg-surface-3",
                  ].join(" ")}
                >
                  {cap}
                </button>
              ))}
              {profile.capabilities
                .filter((c) => !DEFAULT_CAPABILITIES.includes(c))
                .map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCapability(cap)}
                    className="rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-[12px] font-medium text-brand transition-colors"
                  >
                    {cap} ✕
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCap}
                onChange={(e) => setNewCap(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCapability(); }}
                placeholder="Add a capability…"
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg placeholder-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <Button variant="secondary" size="sm" type="button" onClick={addCapability}>Add</Button>
            </div>
          </CardBody>
        </Card>

        {/* Negative signals */}
        <Card>
          <CardHeader
            title="What you won't take on"
            subtitle="A post matching any of these is dropped before scoring. Never reaches your list."
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DEFAULT_NEGATIVES_RAW.map((neg) => {
                const label = blockedReasonLabels([neg])[0] ?? neg;
                return (
                  <button
                    key={neg}
                    type="button"
                    onClick={() => toggleNegative(neg)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                      profile.negativeSignals.includes(neg)
                        ? "border-down bg-down-bg text-down"
                        : "border-line bg-surface text-fg-soft hover:border-line-strong hover:bg-surface-3",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
              {profile.negativeSignals
                .filter((n) => !DEFAULT_NEGATIVES_RAW.includes(n))
                .map((neg) => (
                  <button
                    key={neg}
                    type="button"
                    onClick={() => toggleNegative(neg)}
                    className="rounded-full border border-down bg-down-bg px-3 py-1.5 text-[12px] font-medium text-down transition-colors"
                  >
                    {neg} ✕
                  </button>
                ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNeg}
                onChange={(e) => setNewNeg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNegative(); }}
                placeholder="Add a phrase to block…"
                className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg placeholder-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
              <Button variant="secondary" size="sm" type="button" onClick={addNegative}>Add</Button>
            </div>
          </CardBody>
        </Card>

        {/* Save */}
        <div className="flex items-center gap-3">
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && <span className="text-[13px] text-up">Saved.</span>}
          {error && <span className="text-[13px] text-down">{error}</span>}
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-3">
        <Card>
          <CardHeader
            title="How it looks"
            subtitle="Your choice is remembered on this device."
          />
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-fg">Dark mode</span>
              <ThemeToggle />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How scoring works" />
          <CardBody className="space-y-3">
            <p className="text-[13px] leading-relaxed text-fg-soft">
              Every lead is scored once, when it is found. Scores are kept as they were.
            </p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Changing this profile changes what gets found from now on — it won&rsquo;t re-score
              leads already in your list. The score on each existing lead still reflects the profile
              that found it.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
