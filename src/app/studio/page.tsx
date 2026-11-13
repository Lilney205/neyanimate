import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, roleCanManageFilms } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { FilmDraftForm } from "./studio-forms";
import { StudioLibrary } from "./studio-library";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = isDatabaseConfigured() ? await getCurrentUser() : null;
  if (!user) redirect("/login?next=%2Fstudio");
  if (!roleCanManageFilms(user.role)) redirect("/");

  const [total, drafts, published] = await Promise.all([
    prisma.film.count(),
    prisma.film.count({ where: { status: "DRAFT" } }),
    prisma.film.count({ where: { status: "PUBLISHED" } }),
  ]);
  const initialFilms = await prisma.film.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: { videoAssets: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-300">NEY Studio</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">Studio dashboard</h1>
      <p className="mt-3 text-slate-300">Signed in as {user.name} · {user.role}</p>
      <Link href="/studio/analytics" className="mt-5 inline-flex rounded-full border border-sky-400/50 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-400/20">Open audience analytics →</Link>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[{ label: "All films", value: total }, { label: "Drafts", value: drafts }, { label: "Published", value: published }].map((item) => (
          <div key={item.label} className="glass-panel rounded-2xl p-5"><p className="text-sm text-slate-400">{item.label}</p><p className="mt-2 text-3xl font-black">{item.value}</p></div>
        ))}
      </div>
      <section className="glass-panel mt-8 rounded-2xl p-6">
        <h2 className="text-xl font-bold">Create a film draft</h2>
        <p className="mt-2 text-sm text-slate-300">New records start as drafts. Add metadata, upload the feature, wait for processing, then publish.</p>
        <FilmDraftForm />
      </section>
        <StudioLibrary initialFilms={initialFilms} />
      <Link href="/films" className="mt-8 inline-flex rounded-full border border-slate-600 px-5 py-3 text-sm font-semibold text-white hover:border-sky-400">Return to catalogue</Link>
    </main>
  );
}
