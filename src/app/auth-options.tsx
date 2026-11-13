import { OAuthProvider, getOAuthProviderConfig, isTwilioVerifyConfigured } from "@/lib/oauth-auth";
import { PhoneSignInForm } from "@/components/phone-sign-in-form";
import { connection } from "next/server";

const providers: { id: OAuthProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "discord", label: "Discord" },
];

export async function AuthOptions() {
  await connection();
  return (
    <section className="mt-7 space-y-6 border-t border-slate-800 pt-6" aria-label="More sign-in options">
      <div>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Or continue with</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {providers.map(({ id, label }) => getOAuthProviderConfig(id) ? (
            <a
              key={id}
              href={`/api/auth/oauth/${id}`}
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-center text-sm font-semibold text-slate-100 transition hover:border-sky-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              {label}
            </a>
          ) : (
            <button
              key={id}
              type="button"
              disabled
              title={`Configure ${label} OAuth credentials to enable this option.`}
              className="cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-center text-sm font-semibold text-slate-500"
            >
              {label} <span className="text-xs font-normal">(setup needed)</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">
          Provider credentials and callback setup are described in <code>docs/authentication.md</code>.
        </p>
      </div>
      <PhoneSignInForm enabled={isTwilioVerifyConfigured()} />
    </section>
  );
}
