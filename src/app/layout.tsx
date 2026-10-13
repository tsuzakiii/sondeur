import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Providers from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sondeur.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Sondeur | Understand explanations by drilling into any phrase",
    template: "%s | Sondeur",
  },
  description: "Sondeur lets learners select a confusing phrase inside an explanation and ask What or Why to build a trail of deeper answers.",
  openGraph: {
    siteName: "Sondeur",
    type: "website",
    url: "/",
    title: "Sondeur | Understand explanations by drilling into any phrase",
    description: "Select a confusing phrase inside an explanation and ask What or Why to build a trail of deeper answers.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sondeur | Understand explanations by drilling into any phrase",
    description: "Select a confusing phrase inside an explanation and ask What or Why to build a trail of deeper answers.",
  },
};

export const viewport: Viewport = {
  themeColor: "#e8ecf3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansJp.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
