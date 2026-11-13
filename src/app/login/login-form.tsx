"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const authError = searchParams.get("authError");
  const requestedRedirect = searchParams.get("redirect") ?? searchParams.get("next");
  const providerError = authError === "setup"
    ? "That sign-in option is not configured yet. Ask the site administrator to finish its provider setup."
    : authError === "cancelled"
      ? "Sign-in was cancelled. You can try again whenever you are ready."
      : authError
        ? "Sign-in could not be completed. Please try again or use another sign-in method."
        : "";

  function getSafeRedirectUrl(target: string | null, fallback: string): string {
    if (!target) return fallback;
    if (target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\")) {
      return target;
    }
    return fallback;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = (await response.json()) as {
        error?: string;
        user?: { role?: "VIEWER" | "EDITOR" | "ADMIN" };
      };

      if (!response.ok) {
        setError(result.error ?? "Sign-in failed.");
        return;
      }

      const role = result.user?.role;
      const defaultDestination = role === "ADMIN" ? "/studio" : "/films";
      const destination = getSafeRedirectUrl(requestedRedirect, defaultDestination);

      router.push(destination);
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" action="/api/auth/login" onSubmit={submit} className="mt-8 space-y-5">
      <input type="hidden" name="redirect" value={requestedRedirect ?? ""} />
      {providerError && <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-950/30 p-3 text-sm text-amber-200">{providerError}</p>}
      <div>
        <label className="block text-sm font-medium text-slate-200">
          Email address
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-slate-200">Password</label>
          <Link
            href="/forgot-password"
            className="text-xs text-sky-300 transition hover:text-sky-200"
          >
            Forgot password?
          </Link>
        </div>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
        />
      </div>

      <div aria-live="polite" role="status" className="min-h-5 text-sm text-rose-300">
        {error}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-sky-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
