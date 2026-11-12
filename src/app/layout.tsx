import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/onest";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { LogoMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://benchdesk.net"),
  title: {
    default: "Benchdesk — independent VPS benchmarks",
    template: "%s · Benchdesk",
  },
  description:
    "Independent, repeatable VPS benchmarks. Every plan runs the same script for 48 hours, and the raw results are public.",
};

// Applies a saved theme before first paint so dark-mode users don't see a flash.
const themeScript = `try{var t=localStorage.getItem("benchdesk-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <header className="in top">
          <Link className="logo" href="/">
            <LogoMark />
            Benchdesk
          </Link>
          <nav aria-label="Main menu">
            <Link href="/#rankings">Rankings</Link>
            <Link href="/methodology">How we test</Link>
          </nav>
          <ThemeToggle />
        </header>

        {children}

        <footer className="in foot">
          <span>Benchdesk · independent VPS benchmarks</span>
          <nav aria-label="Footer menu">
            <Link href="/methodology">Methodology</Link>
            <a href="mailto:hello@benchdesk.net">Contact</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
