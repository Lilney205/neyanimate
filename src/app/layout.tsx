import type { Metadata } from "next";
import { AmbientBackground } from "@/components/ambient-background";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEY ANIMATE",
  description: "An independent home for cinematic anime stories.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#060b16] font-sans text-slate-50">
        <AmbientBackground />
        <div className="site-content">
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
