import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { defaultServiceProfile } from "@/lib/domain/service-profile";

export const metadata: Metadata = {
  title: "Arkzen — find people already asking for what you sell",
  description:
    "Arkzen watches public places for people describing a problem you can fix, shows you exactly what they said, and helps you reach out.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f3" },
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html
        lang="en"
        className={`${GeistSans.variable} ${GeistMono.variable}`}
        data-scroll-behavior="smooth"
        suppressHydrationWarning
      >
        <head>
          {/* Applies the stored theme before first paint so there is no flash. */}
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body>
          <ThemeProvider>
            <TooltipProvider delayDuration={200}>
              <AppShell profileName={defaultServiceProfile.name}>{children}</AppShell>
            </TooltipProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
