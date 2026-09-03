import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pramaan — AI Risk Manager",
  description:
    "Chargeback and dispute evidence auditor: a seven-stage pipeline that proposes, verifies, calibrates and routes every dispute, with measured precision, recall and false-positive cost.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <Nav />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-1 px-6 py-4 text-[11.5px] text-faint">
            <span>Pramaan · AI Risk Manager</span>
            <span>Defence-only: the pipeline scores and routes disputes, it never initiates one.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
