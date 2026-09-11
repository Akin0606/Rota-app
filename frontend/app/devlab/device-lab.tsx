"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Device Lab — a shared phone harness for the Browser pane. Iframes any app
// route inside a switchable device bezel so a designer (and an agent driving
// the pane) look at, and click, the SAME phone. Chromium/Blink, so it is a
// faithful proxy for Android-Chrome rendering; iOS-Safari-only quirks
// (real env() safe-area insets, device-pixel-ratio) still want a real device.
// Self-contained: plain inline styles, no app imports, no app-scope classes —
// toggling the app's theme inside the iframe never restyles this chrome.

type Platform = "ios" | "android";
type Device = { key: string; name: string; w: number; h: number; dpr: number; platform: Platform };

const DEVICES: Device[] = [
  { key: "se", name: "iPhone SE", w: 375, h: 667, dpr: 2, platform: "ios" },
  { key: "15", name: "iPhone 15", w: 393, h: 852, dpr: 3, platform: "ios" },
  { key: "max", name: "iPhone 15 Pro Max", w: 430, h: 932, dpr: 3, platform: "ios" },
  { key: "pixel", name: "Pixel 7 (Android)", w: 412, h: 915, dpr: 2.625, platform: "android" },
  { key: "galaxy", name: "Galaxy S (Android)", w: 360, h: 800, dpr: 3, platform: "android" },
];

// One-tap routes, grouped. Staff routes are the real /v/demo/* pages (a dev-only
// layout stubs fetch + plants the demo PIN, so the bottom nav works natively);
// manager routes are hosted previews (the real (manager) layout is a server auth
// gate that would redirect before any client stub could run).
const QUICK: { group: string; items: { label: string; path: string }[] }[] = [
  {
    group: "Public",
    items: [
      { label: "Landing", path: "/" },
      { label: "Walkthrough", path: "/walkthrough" },
      { label: "Login", path: "/login" },
      { label: "Onboarding", path: "/onboarding" },
    ],
  },
  {
    group: "Staff",
    items: [
      { label: "Hub", path: "/v/demo/hub" },
      { label: "My shifts", path: "/v/demo/rota" },
      { label: "Availability", path: "/v/demo/availability" },
      { label: "Hours", path: "/v/demo/hours" },
      { label: "Time off", path: "/v/demo/leave" },
      { label: "Swap", path: "/v/demo/drop" },
    ],
  },
  {
    group: "Manager",
    items: [
      { label: "Dashboard", path: "/devlab/manager/dashboard" },
      { label: "Rota", path: "/devlab/manager/rota" },
      { label: "Scheduler", path: "/devlab/manager/scheduler" },
      { label: "Team", path: "/devlab/manager/team" },
      { label: "Settings", path: "/devlab/manager/settings" },
      { label: "Leave", path: "/devlab/manager/leave" },
      { label: "Shift editor", path: "/devlab/preview" },
    ],
  },
];

const CHROME = "#0d0d0e";
const PANEL = "#161618";
const LINE = "#2a2a2d";
const INK = "#e9e9e7";
const DIM = "#8a8a88";
const ACCENT = "#5b8cff";

export default function DeviceLab() {
  const [deviceKey, setDeviceKey] = useState("15");
  const [landscape, setLandscape] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [input, setInput] = useState("/");
  const [path, setPath] = useState("/");
  const [reloadKey, setReloadKey] = useState(0);
  const [scale, setScale] = useState(1);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const device = DEVICES.find((d) => d.key === deviceKey)!;
  const w = landscape ? device.h : device.w;
  const h = landscape ? device.w : device.h;
  const bezel = 12;
  const frameW = w + bezel * 2;
  const frameH = h + bezel * 2;

  // Scale the whole device down to fit the available stage.
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const availW = el.clientWidth - 32;
      const availH = el.clientHeight - 32;
      setScale(Math.min(1, availW / frameW, availH / frameH));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [frameW, frameH]);

  // Force the app's theme inside the iframe (same-origin, so reachable), and
  // re-apply on every (re)load so a navigation inside the frame keeps it.
  const applyTheme = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentWindow?.document;
      if (doc) doc.documentElement.setAttribute("data-theme", theme);
    } catch {
      /* cross-origin or not ready — ignore */
    }
  }, [theme]);
  useEffect(applyTheme, [applyTheme, path, reloadKey]);

  const go = (p: string) => {
    const clean = p.startsWith("/") ? p : `/${p}`;
    setInput(clean);
    setPath(clean);
    setReloadKey((k) => k + 1);
  };

  const btn = (active?: boolean): React.CSSProperties => ({
    padding: "6px 11px",
    borderRadius: 8,
    border: `1px solid ${active ? ACCENT : LINE}`,
    background: active ? "rgba(91,140,255,0.14)" : "transparent",
    color: active ? ACCENT : INK,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: CHROME, color: INK, display: "flex", flexDirection: "column", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Control bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${LINE}`, background: PANEL }}>
        <strong style={{ fontSize: 13, letterSpacing: "-0.01em" }}>Device Lab</strong>

        <select value={deviceKey} onChange={(e) => setDeviceKey(e.target.value)} style={{ ...btn(), appearance: "auto" }}>
          {DEVICES.map((d) => (
            <option key={d.key} value={d.key}>{d.name} · {d.w}×{d.h}</option>
          ))}
        </select>

        <button style={btn(landscape)} onClick={() => setLandscape((v) => !v)} title="Rotate">⟳ {landscape ? "Landscape" : "Portrait"}</button>

        <div style={{ display: "flex", gap: 4 }}>
          <button style={btn(theme === "light")} onClick={() => setTheme("light")}>☀ Light</button>
          <button style={btn(theme === "dark")} onClick={() => setTheme("dark")}>☾ Dark</button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); go(input); }} style={{ display: "flex", gap: 6, flex: 1, minWidth: 220 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="/some/route"
            style={{ flex: 1, minWidth: 0, padding: "6px 10px", borderRadius: 8, border: `1px solid ${LINE}`, background: CHROME, color: INK, fontSize: 13, fontFamily: "ui-monospace, monospace" }}
          />
          <button type="submit" style={btn()}>Go</button>
          <button type="button" style={btn()} onClick={() => setReloadKey((k) => k + 1)} title="Reload">↻</button>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", width: "100%" }}>
          {QUICK.map((grp) => (
            <div key={grp.group} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", color: DIM, paddingRight: 2 }}>{grp.group}</span>
              {grp.items.map((q) => (
                <button key={q.path} style={btn(path === q.path)} onClick={() => go(q.path)}>{q.label}</button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div ref={stageRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 16, background: "radial-gradient(circle at 50% 30%, #1a1a1d, #0d0d0e 70%)" }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "center" }}>
          {/* Bezel */}
          <div style={{ width: frameW, height: frameH, borderRadius: device.platform === "ios" ? 52 : 34, background: "#000", padding: bezel, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8), 0 0 0 1px #2c2c2f", position: "relative" }}>
            {/* Screen */}
            <div style={{ position: "relative", width: w, height: h, borderRadius: device.platform === "ios" ? 42 : 24, overflow: "hidden", background: "#fff" }}>
              <iframe
                key={reloadKey}
                ref={iframeRef}
                src={path}
                onLoad={applyTheme}
                title="app"
                style={{ width: w, height: h, border: "none", display: "block" }}
              />
              {/* iOS notch / dynamic island (visual only — does not set env() insets) */}
              {device.platform === "ios" && !landscape && (
                <>
                  <div style={{ position: "absolute", top: 9, left: "50%", transform: "translateX(-50%)", width: 112, height: 30, borderRadius: 16, background: "#000", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", bottom: 7, left: "50%", transform: "translateX(-50%)", width: 128, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />
                </>
              )}
              {device.platform === "android" && !landscape && (
                <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 9, height: 9, borderRadius: "50%", background: "#000", pointerEvents: "none" }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${LINE}`, background: PANEL, fontSize: 11.5, color: DIM }}>
        {device.name} · {w}×{h} · dpr {device.dpr} (label only) · Chromium/Blink — faithful for Android Chrome; iOS Safari env() insets &amp; dpr still need a real device.
      </div>
    </div>
  );
}
