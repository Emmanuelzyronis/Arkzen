import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import { getServiceProfile } from "@/lib/data/repository";
import { auth } from "@clerk/nextjs/server";

export const metadata: Metadata = {
  title: "Arkzen — find people already asking for what you sell",
  description:
    "Arkzen watches public places for people describing a problem you can fix, shows you exactly what they said, and helps you reach out.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f2f4" },
    { media: "(prefers-color-scheme: dark)", color: "#08080b" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the operator's saved profile name for the shell. Falls back to the
  // default when unauthenticated or when the DB call fails — sign-in and
  // onboarding pages will render the shell without a real name.
  let profileName = defaultServiceProfile.name;
  try {
    const { userId } = await auth();
    if (userId) {
      const saved = await getServiceProfile(userId);
      if (saved) profileName = saved.name;
    }
  } catch {
    // Non-fatal — use the default name.
  }

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
              <AppShell profileName={profileName}>{children}</AppShell>
            </TooltipProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
