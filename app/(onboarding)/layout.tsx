/**
 * Onboarding layout — renders children directly, bypassing AppShell.
 * The root layout still provides ClerkProvider, ThemeProvider, and globals.css.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
