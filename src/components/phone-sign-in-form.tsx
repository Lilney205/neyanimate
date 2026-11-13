"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type PhoneSignInFormProps = { enabled: boolean };

export function PhoneSignInForm({ enabled }: PhoneSignInFormProps) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      setError("Enter your full phone number with country code, for example +14155552671.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Enter a name with at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not send a verification code.");
        return;
      }
      setCodeSent(true);
    } catch {
      setError("Phone verification is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim(), code: code.trim() }),
      });
      const result = await response.json() as { error?: string; user?: { role?: string } };
      if (!response.ok) {
        setError(result.error ?? "Phone verification failed.");
        return;
      }
      const destination = result.user?.role === "ADMIN" ? "/studio" : "/films";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Phone sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Phone number</p>
        <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-center text-sm text-slate-500">
          Phone sign-in needs Twilio Verify credentials. See <code>docs/authentication.md</code>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Continue with phone</p>
      <form onSubmit={codeSent ? verifyCode : requestCode} className="mt-3 space-y-3">
        <label className="block text-sm font-medium text-slate-200">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </label>
        <label className="block text-sm font-medium text-slate-200">
          Phone number
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+14155552671"
            maxLength={16}
            required
            readOnly={codeSent}
            className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 read-only:text-slate-400"
          />
        </label>
        {codeSent && (
          <label className="block text-sm font-medium text-slate-200">
            SMS verification code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{4,10}"
              maxLength={10}
              required
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
            />
          </label>
        )}
        <div aria-live="polite" role="status" className="min-h-5 text-sm text-rose-300">{error}</div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full border border-slate-600 bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-400 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Please wait…" : codeSent ? "Verify code and continue" : "Send SMS code"}
        </button>
        {codeSent && <button type="button" onClick={() => { setCodeSent(false); setCode(""); setError(""); }} className="w-full text-xs text-sky-300 hover:text-sky-200">Use a different phone number</button>}
      </form>
    </div>
  );
}
