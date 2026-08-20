import type { Metadata } from "next";
import {
  EB_Garamond,
  Inter,
  Noto_Sans_Arabic,
  Noto_Sans_Ethiopic,
  Noto_Sans_SC,
  Noto_Sans_Devanagari,
  Roboto_Mono,
} from "next/font/google";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { localeDirection } from "@opendoor/shared";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { getRequestWorld } from "@/lib/i18n/resolve-request";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
const ebGaramond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});
const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const notoEthiopic = Noto_Sans_Ethiopic({
  variable: "--font-ethiopic",
  subsets: ["ethiopic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const notoSc = Noto_Sans_SC({
  variable: "--font-cjk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenDoor — LLM Gateway",
  description: "Multi-region LLM API Gateway",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const world = await getRequestWorld();
  return (
    <html
      lang={world.locale}
      dir={localeDirection(world.locale)}
      className={`${inter.variable} ${ebGaramond.variable} ${robotoMono.variable} ${notoArabic.variable} ${notoEthiopic.variable} ${notoSc.variable} ${notoDevanagari.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-inter antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <I18nProvider locale={world.locale} messages={world.messages} preference={world.preference}>
            <AuthKitProvider>{children}</AuthKitProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
