"use client";

import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const email = form.get("email")?.toString().trim();

    if (!email) {
      setError("Please enter your email address.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not send reset instructions.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Recovery service is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-sky-400/30 bg-sky-950/40 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Check your email</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          If an account exists with that address, we have sent instructions to reset your password. The link will remain valid for 15 minutes.
        </p>
        <p className="mt-4 text-xs text-slate-400">
          Didn&apos;t receive an email? Check your spam folder or try again in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-200">
          Account Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="viewer@example.com"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </label>
      </div>

      <div aria-live="polite" role="status" className="min-h-5 text-sm text-rose-300">
        {error}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-sky-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Sending link…" : "Send password reset link"}
      </button>
    </form>
  );
}
