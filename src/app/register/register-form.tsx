"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const name = form.get("name")?.toString().trim() ?? "";
    const email = form.get("email")?.toString().trim() ?? "";
    const password = form.get("password")?.toString() ?? "";
    const confirmPassword = form.get("confirmPassword")?.toString() ?? "";

    if (!name || name.length < 2) {
      setError("Please provide a name of at least 2 characters.");
      setBusy(false);
      return;
    }

    if (!email) {
      setError("Please enter a valid email address.");
      setBusy(false);
      return;
    }

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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Registration could not be completed.");
        return;
      }

      setSuccess(true);
      router.push("/films");
      router.refresh();
    } catch {
      setError("Registration service is temporarily unavailable. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-200">
          Full Name
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            placeholder="Aoi Takahashi"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-200">
          Email address
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

      <div>
        <label className="block text-sm font-medium text-slate-200">
          Password
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
          Confirm Password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={14}
            maxLength={72}
            placeholder="Re-enter your password"
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </label>
      </div>

      <div aria-live="polite" role="status" className="min-h-5 text-sm">
        {error && <p className="text-rose-300">{error}</p>}
        {success && <p className="text-emerald-300">Account created successfully! Redirecting…</p>}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-sky-400 px-5 py-3 font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create viewer account"}
      </button>
    </form>
  );
}
