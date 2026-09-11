"use client";

import { installStub } from "@/app/devlab/_stub/install";

// Install on module load (before first render) and again in the render phase —
// so the fetch patch + planted PIN are in place before the child staff page's
// mount effect reads sessionStorage and calls authenticatePin. Both calls are
// idempotent and no-op in production / on the server.
installStub();

export default function DemoStubGate({ children }: { children: React.ReactNode }) {
  installStub();
  return <>{children}</>;
}
