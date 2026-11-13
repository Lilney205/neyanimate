import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAdminAnalytics } from "@/lib/analytics";
import { getCurrentUser, roleCanAdminister } from "@/lib/auth";
import { isDatabaseConfigured } from "@/lib/db";
import { AnalyticsDashboard } from "./analytics-dashboard";

export const metadata: Metadata = {
  title: "Audience analytics | NEY ANIMATE",
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage() {
  if (!isDatabaseConfigured()) redirect("/login?next=%2Fstudio%2Fanalytics");
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fstudio%2Fanalytics");
  if (!roleCanAdminister(user.role)) redirect("/");

  const analytics = await getAdminAnalytics(30);
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10">
      <Link href="/studio" className="mb-6 inline-flex rounded-full border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-sky-400">← Back to studio</Link>
      <AnalyticsDashboard initialData={analytics} />
    </main>
  );
}
