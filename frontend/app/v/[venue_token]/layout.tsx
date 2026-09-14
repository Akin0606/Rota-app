import DemoStubGate from "./demo-stub-gate";

// Staff routes normally have no layout — this one exists solely so the Device
// Lab's /v/demo/* preview can mount a fetch-stub + plant the demo PIN before any
// staff page runs. For every real venue token (and in production) it is a pure
// pass-through that adds no markup.
export default async function VenueTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venue_token: string }>;
}) {
  // Next 15: params is a Promise.
  const { venue_token } = await params;
  if (process.env.NODE_ENV !== "production" && venue_token === "demo") {
    return <DemoStubGate>{children}</DemoStubGate>;
  }
  return <>{children}</>;
}
