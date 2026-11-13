import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Set New Password — NEY ANIMATE",
  description: "Set a new secure password for your NEY ANIMATE account.",
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="glass-panel rounded-3xl p-8 shadow-[0_0_80px_rgba(56,189,248,0.1)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">NEY ANIMATE</p>
        <h1 className="mt-3 text-3xl font-black text-white">Create new password</h1>
        <p className="mt-2 text-sm text-slate-300">
          Choose a strong password with at least 14 characters to secure your account.
        </p>

        <Suspense fallback={<div className="mt-8 text-center text-sm text-slate-400">Loading form…</div>}>
          <ResetPasswordForm />
        </Suspense>

        <div className="mt-6 border-t border-slate-800 pt-6 text-center text-sm text-slate-400">
          <Link href="/login" className="text-xs text-slate-400 transition hover:text-slate-300">
            ← Return to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
