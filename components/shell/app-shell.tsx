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

  // Sign-in and sign-up stand on their own — no sidebar, no topbar.
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  return (
    // The toast host wraps the whole shell so any screen — including the error
    // boundary — can report the result of an action without its own plumbing.
    <ToastProvider>
      <div className="flex min-h-dvh gap-3 p-3">
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <MobileNav open={navOpen} onOpenChange={setNavOpen} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <WorkspaceTopbar profileName={profileName} onOpenNav={() => setNavOpen(true)} />
          <main className="min-w-0 flex-1 pb-2">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
