import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Forgot Password — NEY ANIMATE",
  description: "Reset your NEY ANIMATE account password.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="glass-panel rounded-3xl p-8 shadow-[0_0_80px_rgba(56,189,248,0.1)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">NEY ANIMATE</p>
        <h1 className="mt-3 text-3xl font-black text-white">Reset password</h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter your registered email address and we will send you a secure link to reset your password.
        </p>

        <ForgotPasswordForm />

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-sm text-slate-400 sm:flex-row">
          <span>Remember your password?</span>
          <Link href="/login" className="font-semibold text-sky-300 transition hover:text-sky-200">
            Sign in →
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="inline-flex text-xs text-slate-400 transition hover:text-slate-300">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
