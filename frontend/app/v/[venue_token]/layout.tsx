import DemoStubGate from "./demo-stub-gate";

// Staff routes normally have no layout — this one exists solely so the Device
// Lab's /v/demo/* preview can mount a fetch-stub + plant the demo PIN before any
// staff page runs. For every real venue token (and in production) it is a pure
// pass-through that adds no markup.
export default function VenueTokenLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { venue_token: string };
}) {
  if (process.env.NODE_ENV !== "production" && params.venue_token === "demo") {
    return <DemoStubGate>{children}</DemoStubGate>;
  }
  return <>{children}</>;
}
