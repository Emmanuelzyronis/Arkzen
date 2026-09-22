"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/shell/brand-mark";
import { Button } from "@/components/ui/button";
import { defaultServiceProfile } from "@/lib/domain/service-profile";

type Step = 1 | 2 | 3;

interface ProfileDraft {
  name: string;
  description: string;
  locations: string;
  minimumEngagement: string;
  capabilities: string[];
  keywords: string[];
  negativeSignals: string[];
}

const DEFAULT_NEGATIVES = [
  "Paid only in equity",
  "Unpaid work",
  "Paid only on commission",
  "Paid only as a share of revenue",
  "No budget yet",
  "Paid in exposure",
];

const DEFAULT_CAPABILITIES = defaultServiceProfile.capabilities;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<ProfileDraft>({
    name: defaultServiceProfile.name,
    description: defaultServiceProfile.description,
    locations: defaultServiceProfile.locations.join(", "),
    minimumEngagement: defaultServiceProfile.minimumEngagement ?? "",
    capabilities: [...DEFAULT_CAPABILITIES],
    keywords: [...defaultServiceProfile.keywords],
    negativeSignals: [...DEFAULT_NEGATIVES],
  });

  function update(fields: Partial<ProfileDraft>) {
    setDraft((prev) => ({ ...prev, ...fields }));
  }

  function toggleCapability(cap: string) {
    setDraft((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter((c) => c !== cap)
        : [...prev.capabilities, cap],
    }));
  }

  function toggleNegative(neg: string) {
    setDraft((prev) => ({
      ...prev,
      negativeSignals: prev.negativeSignals.includes(neg)
        ? prev.negativeSignals.filter((n) => n !== neg)
        : [...prev.negativeSignals, neg],
    }));
  }

  function addCapability(cap: string) {
    const trimmed = cap.trim();
    if (!trimmed || draft.capabilities.includes(trimmed)) return;
    setDraft((prev) => ({ ...prev, capabilities: [...prev.capabilities, trimmed] }));
  }

  function addNegative(neg: string) {
    const trimmed = neg.trim();
    if (!trimmed || draft.negativeSignals.includes(trimmed)) return;
    setDraft((prev) => ({ ...prev, negativeSignals: [...prev.negativeSignals, trimmed] }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          capabilities: draft.capabilities,
          keywords: draft.keywords,
          negativeSignals: draft.negativeSignals,
          locations: draft.locations.split(",").map((l) => l.trim()).filter(Boolean),
          minimumEngagement: draft.minimumEngagement.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Could not save your profile. Please try again.");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const steps: Record<Step, { label: string; title: string; subtitle: string }> = {
    1: {
      label: "About you",
      title: "What do you do?",
      subtitle: "Describe the work you take on. ArkZen uses this to find people who need exactly that.",
    },
    2: {
      label: "What you sell",
      title: "What are your capabilities?",
      subtitle: "Pick everything that applies. Each one adds weight to posts that mention it.",
    },
    3: {
      label: "What to skip",
      title: "What will you not take on?",
      subtitle: "Posts matching these are dropped before they reach your list. Saves you the noise.",
    },
  };

  const current = steps[step];

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-6 py-4">
        <BrandMark />
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">Arkzen</span>
        <span className="ml-auto text-[12px] text-fg-muted">
          Step {step} of 3
        </span>
      </header>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-line">
        <div
          className="h-full bg-brand transition-all duration-300"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>

      {/* Content */}
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        {/* Step indicator chips */}
        <div className="mb-8 flex gap-2">
          {([1, 2, 3] as Step[]).map((n) => (
            <span
              key={n}
              className={[
                "rounded-full px-3 py-1 text-[11px] font-semibold",
                n === step
                  ? "bg-brand text-white"
                  : n < step
                    ? "bg-brand-soft text-brand"
                    : "bg-surface-3 text-fg-muted",
              ].join(" ")}
            >
              {steps[n].label}
            </span>
          ))}
        </div>

        <h1 className="text-[26px] font-bold tracking-[-0.03em] text-fg">{current.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-soft">{current.subtitle}</p>

        <div className="mt-8 space-y-5">
          {step === 1 && <Step1 draft={draft} update={update} />}
          {step === 2 && (
            <Step2
              capabilities={draft.capabilities}
              toggleCapability={toggleCapability}
              addCapability={addCapability}
            />
          )}
          {step === 3 && (
            <Step3
              negativeSignals={draft.negativeSignals}
              toggleNegative={toggleNegative}
              addNegative={addNegative}
            />
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-down-bg px-4 py-3 text-[13px] text-down">{error}</p>
        )}

        <div className="mt-8 flex justify-between gap-3">
          {step > 1 ? (
            <Button variant="ghost" size="md" onClick={() => setStep((s) => (s - 1) as Step)}>
              Back
            </Button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={step === 1 && (!draft.name.trim() || !draft.description.trim())}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant="accent"
              size="md"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Setting up…" : "Start finding leads"}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function Step1({
  draft,
  update,
}: {
  draft: ProfileDraft;
  update: (fields: Partial<ProfileDraft>) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor="profile-name" className="mb-1.5 block text-[13px] font-medium text-fg">
          What you do <span className="text-down">*</span>
        </label>
        <input
          id="profile-name"
          type="text"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. AI product engineering for small teams"
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg placeholder-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div>
        <label htmlFor="profile-description" className="mb-1.5 block text-[13px] font-medium text-fg">
          A bit more detail <span className="text-down">*</span>
        </label>
        <textarea
          id="profile-description"
          rows={4}
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Describe the kinds of problems you solve and who you typically work with."
          className="w-full resize-none rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg placeholder-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-locations" className="mb-1.5 block text-[13px] font-medium text-fg">
            Where you work
          </label>
          <input
            id="profile-locations"
            type="text"
            value={draft.locations}
            onChange={(e) => update({ locations: e.target.value })}
            placeholder="e.g. Remote, EU/US"
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg placeholder-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <div>
          <label htmlFor="profile-min" className="mb-1.5 block text-[13px] font-medium text-fg">
            Minimum engagement
          </label>
          <input
            id="profile-min"
            type="text"
            value={draft.minimumEngagement}
            onChange={(e) => update({ minimumEngagement: e.target.value })}
            placeholder="e.g. $2,000"
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] text-fg placeholder-fg-muted outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>
    </>
  );
}

function Step2({
  capabilities,
  toggleCapability,
  addCapability,
}: {
  capabilities: string[];
  toggleCapability: (c: string) => void;
  addCapability: (c: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {DEFAULT_CAPABILITIES.map((cap) => (
          <button
            key={cap}
            type="button"
            onClick={() => toggleCapability(cap)}
            className={[
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              capabilities.includes(cap)
                ? "border-brand bg-brand-soft text-brand"
                : "border-line bg-surface text-fg-soft hover:border-brand/50 hover:bg-surface-3",
            ].join(" ")}
          >
            {cap}
          </button>
        ))}
        {capabilities
          .filter((c) => !DEFAULT_CAPABILITIES.includes(c))
          .map((cap) => (
            <button
              key={cap}
              type="button"
              onClick={() => toggleCapability(cap)}
              className="rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-[12.5px] font-medium text-brand transition-colors"
            >
              {cap} ✕
            </button>
          ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              addCapability(custom);
              setCustom("");
            }
          }}
          placeholder="Add your own capability…"
          className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13.5px] text-fg placeholder-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => {
            addCapability(custom);
            setCustom("");
          }}
        >
          Add
        </Button>
      </div>

      {capabilities.length === 0 && (
        <p className="text-[13px] text-fg-muted">Select at least one capability so Arkzen knows what to look for.</p>
      )}
    </>
  );
}

function Step3({
  negativeSignals,
  toggleNegative,
  addNegative,
}: {
  negativeSignals: string[];
  toggleNegative: (n: string) => void;
  addNegative: (n: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {DEFAULT_NEGATIVES.map((neg) => (
          <button
            key={neg}
            type="button"
            onClick={() => toggleNegative(neg)}
            className={[
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              negativeSignals.includes(neg)
                ? "border-down bg-down-bg text-down"
                : "border-line bg-surface text-fg-soft hover:border-line-strong hover:bg-surface-3",
            ].join(" ")}
          >
            {neg}
          </button>
        ))}
        {negativeSignals
          .filter((n) => !DEFAULT_NEGATIVES.includes(n))
          .map((neg) => (
            <button
              key={neg}
              type="button"
              onClick={() => toggleNegative(neg)}
              className="rounded-full border border-down bg-down-bg px-3 py-1.5 text-[12.5px] font-medium text-down transition-colors"
            >
              {neg} ✕
            </button>
          ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              addNegative(custom);
              setCustom("");
            }
          }}
          placeholder="Add a phrase to block…"
          className="flex-1 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13.5px] text-fg placeholder-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => {
            addNegative(custom);
            setCustom("");
          }}
        >
          Add
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface-2 px-4 py-3">
        <p className="text-[13px] font-medium text-fg">Summary</p>
        <p className="mt-1 text-[12.5px] text-fg-muted">
          Any post containing these phrases will be dropped automatically and won&rsquo;t appear in your list.
        </p>
        {negativeSignals.length === 0 && (
          <p className="mt-2 text-[12.5px] italic text-fg-muted">Nothing blocked yet — everything will reach your list.</p>
        )}
      </div>
    </>
  );
}
