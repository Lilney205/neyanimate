"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-6 text-center">
        <p className="text-sm text-amber-200">
          This password reset link is invalid or incomplete.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-block rounded-full bg-sky-400 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-300"
        >
          Request new reset link
        </Link>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const password = form.get("password")?.toString() ?? "";
    const confirmPassword = form.get("confirmPassword")?.toString() ?? "";

    if (password.length < 14) {
      setError("Password must be at least 14 characters long.");
      setBusy(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Password reset could not be completed.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch {
      setError("Password reset service is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-950/40 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Password reset successfully!</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Your password has been updated and all previous sessions have been signed out. Redirecting to sign in…
        </p>
        <div className="mt-5">
          <Link
            href="/login"
            className="inline-block rounded-full bg-sky-400 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-300"
          >
            Sign in now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-200">
          New Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={14}
            maxLength={72}
            placeholder="At least 14 characters"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </label>
        <p className="mt-1 text-xs text-slate-400">Must be at least 14 characters long.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-200">
          Confirm New Password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={14}
            maxLength={72}
            placeholder="Re-enter your new password"
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
        {busy ? "Updating password…" : "Reset password"}
      </button>
    </form>
  );
}
