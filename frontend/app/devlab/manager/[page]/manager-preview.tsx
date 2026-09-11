"use client";

import { Suspense } from "react";

import ManagerNav from "@/components/manager/nav";
import { installStub } from "@/app/devlab/_stub/install";

import DashboardPage from "@/app/(manager)/dashboard/page";
import LeavePage from "@/app/(manager)/leave/page";
import RotaPage from "@/app/(manager)/rota/page";
import SchedulerPage from "@/app/(manager)/scheduler/page";
import SettingsPage from "@/app/(manager)/settings/page";
import TeamPage from "@/app/(manager)/team/page";

// Install on module load so window.fetch is stubbed before any imported manager
// page's mount effect fires.
installStub();

const PAGES: Record<string, React.ComponentType> = {
  dashboard: DashboardPage,
  rota: RotaPage,
  scheduler: SchedulerPage,
  settings: SettingsPage,
  team: TeamPage,
  leave: LeavePage,
};

export default function ManagerPreview({ page }: { page: string }) {
  installStub();
  const Page = PAGES[page];

  if (!Page) {
    return (
      <div className="cp-manager flex min-h-screen items-center justify-center bg-surface-page p-8 text-center text-ink">
        <div>
          <div className="mb-2 text-lg font-medium">Unknown preview page</div>
          <div className="text-sm text-ink-muted">
            No manager preview for &ldquo;{page}&rdquo;. Try dashboard, rota, scheduler, team, settings or leave.
          </div>
        </div>
      </div>
    );
  }

  // Mirror the real (manager)/layout.tsx wrapper (minus its server auth gate) so
  // the pages' scope class, palette and responsive column all resolve as they do
  // in production.
  return (
    <div className="cp-manager min-h-screen bg-surface-page text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col md:max-w-[1120px]">
        <ManagerNav />
        <div className="flex-1">
          <Suspense fallback={null}>
            <Page />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
