"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { WorkspaceTopbar } from "@/components/shell/topbar";
import { ToastProvider } from "@/components/ui/toast";

export function AppShell({
  profileName,
  children,
}: {
  profileName: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Sign-in, sign-up, and onboarding stand on their own — no sidebar, no topbar.
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding")
  ) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    <ToastProvider>
      <div className="flex h-dvh overflow-hidden bg-canvas">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <MobileNav open={navOpen} onOpenChange={setNavOpen} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceTopbar profileName={profileName} onOpenNav={() => setNavOpen(true)} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="px-5 py-5 pb-8">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
