"use client";

import { createContext, useContext } from "react";
import DashboardSidebar from "@/components/ui/dashboard-sidebar";
import DashboardTools from "@/components/DashboardTopBar";
import { PageTransition } from "@/components/PageTransition";
import { MobileBottomNav } from "@/components/dashboard/MobileBottomNav";
import { DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS } from "@/lib/dashboard-sidebar";
import { cn } from "@/lib/utils";

type Profile = {
  email: string;
  displayName: string;
  workspaceName: string;
  planLabel: string;
  enterpriseLocked: boolean;
  protectedChild: boolean;
};

const DashboardProfileContext = createContext<Profile>({
  email: "",
  displayName: "",
  workspaceName: "",
  planLabel: "",
  enterpriseLocked: false,
  protectedChild: false,
});

export function useDashboardProfile() {
  return useContext(DashboardProfileContext);
}

export function DashboardFrame({
  profile,
  impersonation,
  children,
}: {
  profile: Profile;
  impersonation?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DashboardProfileContext.Provider value={profile}>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardSidebar
          email={profile.email}
          displayName={profile.displayName}
          workspaceName={profile.workspaceName}
          planLabel={profile.planLabel}
          enterpriseLocked={profile.enterpriseLocked}
          protectedChild={profile.protectedChild}
        />
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-hidden md:ml-12",
            DASHBOARD_SIDEBAR_CONTENT_OFFSET_CLASS,
          )}
        >
          {impersonation}
          <DashboardTools />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <MobileBottomNav
          email={profile.email}
          displayName={profile.displayName}
          enterpriseLocked={profile.enterpriseLocked}
          protectedChild={profile.protectedChild}
        />
      </div>
    </DashboardProfileContext.Provider>
  );
}
