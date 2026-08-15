"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

// Terac participants land here. Two quick comparisons, big tap targets,
// then back to Terac's completion callback. No chrome, no distractions.

const COMPARISONS = [
  {
    id: "illustration-style",
    prompt: "Which illustration would you rather see in a children's book?",
    kind: "image" as const,
    a: "/study/style-a.jpg",
    b: "/study/style-b.jpg",
  },
  {
    id: "opening-line",
    prompt: "Which opening would you rather read aloud at bedtime?",
    kind: "text" as const,
    a: "On Maya's birthday morning, the sun peeked over Grandma's farm, and Biscuit the cat stretched out one orange paw to say: today is yours.",
    b: "Maya woke up on her birthday and went to Grandma's farm with her cat Biscuit. She was very excited about what the day would bring.",
  },
];

function Study() {
  const params = useSearchParams();
  const submissionId =
    params.get("teracSubmissionId") ?? params.get("submissionId");
  const taskId = params.get("taskId");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const done = step >= COMPARISONS.length;

  async function vote(choice: "A" | "B") {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const res = await fetch("/api/study/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comparison: COMPARISONS[step].id,
          choice,
          submissionId,
        }),
      });
      if (!res.ok) throw new Error(`vote save failed: ${res.status}`);
      setStep((s) => s + 1);
    } catch {
      // Never advance past an unsaved vote — the participant's pick counts.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const callback = submissionId
      ? `https://terac.com/api/external/callback?teracSubmissionId=${encodeURIComponent(
          submissionId,
        )}${taskId ? `&taskId=${encodeURIComponent(taskId)}` : ""}&result=completed`
      : null;
    if (callback && typeof window !== "undefined") {
      window.location.href = callback;
    }
    return (
      <Shell>
        <h1 className="display text-3xl">Thank you! 💛</h1>
        <p className="mt-3" style={{ color: "var(--moon-dim)" }}>
          {callback
            ? "Recording your completion with Terac…"
            : "Your picks help our studio paint better books."}
        </p>
      </Shell>
    );
  }

  const c = COMPARISONS[step];
  return (
    <Shell>
      <p className="text-xs uppercase tracking-widest" style={{ color: "var(--moon-dim)" }}>
        {step + 1} of {COMPARISONS.length}
      </p>
      <h1 className="display mt-2 text-2xl leading-snug">{c.prompt}</h1>
      {saveFailed && (
        <p className="mt-3 text-sm" role="alert" style={{ color: "var(--ember)" }}>
          Your pick didn&apos;t save — tap it again.
        </p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((side) => (
          <button
            key={side}
            onClick={() => vote(side)}
            disabled={saving}
            className="page-card p-4 text-left transition-transform hover:scale-[1.02] focus-visible:scale-[1.02]"
          >
            {c.kind === "image" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={side === "A" ? c.a : c.b}
                alt={`Option ${side}`}
                className="w-full rounded"
              />
            ) : (
              <p className="display text-lg leading-relaxed" style={{ color: "var(--ink)" }}>
                {side === "A" ? c.a : c.b}
              </p>
            )}
            <p className="mt-3 text-center text-sm font-semibold" style={{ color: "var(--ink)" }}>
              Pick {side}
            </p>
          </button>
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 text-center sm:text-left">
      {children}
    </main>
  );
}

export default function StudyPage() {
  return (
    <Suspense>
      <Study />
    </Suspense>
  );
}
