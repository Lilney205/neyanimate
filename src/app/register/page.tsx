import Link from "next/link";
import { RegisterForm } from "./register-form";
import { AuthOptions } from "@/app/auth-options";

export const metadata = {
  title: "Create Viewer Account — NEY ANIMATE",
  description: "Join NEY ANIMATE to explore original, independent anime films.",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="glass-panel rounded-3xl p-8 shadow-[0_0_80px_rgba(56,189,248,0.1)]">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">NEY ANIMATE</p>
        <h1 className="mt-3 text-3xl font-black text-white">Join the audience</h1>
        <p className="mt-2 text-sm text-slate-300">
          Create your viewer account to start watching original anime films.
        </p>

        <RegisterForm />
        <AuthOptions />

        <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-sm text-slate-400 sm:flex-row">
          <span>Already have an account?</span>
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
