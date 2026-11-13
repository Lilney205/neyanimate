import Image from "next/image";
import Link from "next/link";
import logo from "@/app/icon.png";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser, roleCanManageFilms } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";

export async function SiteHeader() {
  const user = isDatabaseConfigured() ? await getCurrentUser() : null;
  const staff = user ? roleCanManageFilms(user.role) : false;

  return (
    <header className="sticky top-0 z-40 border-b border-sky-400/15 bg-slate-950/85 shadow-[0_8px_30px_rgba(2,8,23,0.22)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/" aria-label="NEY ANIMATE home" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300">
          <Image src={logo} alt="NEY ANIMATE logo" priority className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover shadow-[0_0_24px_rgba(56,189,248,0.15)]" />
          <span className="min-w-0 leading-none">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-300">NEY</span>
            <span className="mt-1 block text-base font-black tracking-[0.16em] text-white sm:text-lg">ANIMATE</span>
            <span className="mt-1 hidden text-[8px] uppercase tracking-[0.18em] text-slate-500 sm:block">Anime · Stories · Creativity</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="ml-auto flex shrink-0 items-center gap-2 sm:gap-5">
          <div className="hidden items-center gap-5 text-sm text-slate-300 md:flex">
            <Link href="/" className="transition hover:text-white">Home</Link>
            <Link href="/films" className="transition hover:text-white">Catalogue</Link>
          </div>

          {staff ? (
            <Link
              href="/studio"
              className="rounded-full border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20 sm:px-4 sm:text-sm"
            >
              Staff studio
            </Link>
          ) : null}

          {user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-36 truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{user.role}</p>
              </div>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-full px-3 py-2 text-xs font-semibold text-slate-200 transition hover:text-white sm:px-4 sm:text-sm">Sign in</Link>
              <Link href="/register" className="hidden rounded-full bg-sky-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-sky-300 sm:inline-flex sm:text-sm">Join</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
