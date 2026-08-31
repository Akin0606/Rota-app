import LoadingScreen from "@/components/loading-screen";

/**
 * The staff PWA's full-screen wait.
 *
 * Every staff screen used to render a bare "Loading…" line here, which is the
 * one place the app's own rule — the wheel does every wait — wasn't being
 * followed. It can't just go inside each screen's CenteredMessage, because that
 * component also carries error and empty states, and a spinning wheel over "This
 * link isn't valid" would say the opposite of what's true.
 *
 * The `.cp-staff` wrapper is load-bearing: LoadingScreen reads --c-surface-page
 * and --c-ink-*, which resolve to the MANAGER palette unless a staff root is
 * above them.
 */
export default function StaffLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="cp-staff flex min-h-screen items-center justify-center bg-surface-page px-6">
      <LoadingScreen base={label} className="min-h-0" />
    </div>
  );
}
