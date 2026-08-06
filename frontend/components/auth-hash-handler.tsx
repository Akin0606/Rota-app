"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase";

// Magic-link logins (and the admin "Support login" link) send the user back to
// the app with the session in the URL hash (#access_token=...&refresh_token=...).
// Nothing was capturing that, so the session was silently lost. This handler
// runs on every page: if it sees those tokens it establishes the session and
// forwards to the dashboard. Uses the implicit tokens directly (no PKCE
// verifier), so it works in mobile in-app browsers too.
export default function AuthHashHandler() {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");

  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash.includes("access_token=")) return;

    setStatus("working");
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    // Strip the tokens from the address bar straight away.
    const cleanUrl = window.location.pathname + window.location.search;

    (async () => {
      if (!accessToken || !refreshToken) {
        setStatus("error");
        return;
      }
      try {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        window.history.replaceState(null, "", cleanUrl);
        if (error) {
          setStatus("error");
          return;
        }
        // Full navigation so the server layout re-reads the new session cookie.
        window.location.assign("/dashboard");
      } catch {
        window.history.replaceState(null, "", cleanUrl);
        setStatus("error");
      }
    })();
  }, []);

  if (status === "idle") return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-page px-6 text-center">
      <div className="text-sm text-ink-muted">
        {status === "error"
          ? "This login link is invalid or has expired. Please request a new one."
          : "Signing you in…"}
      </div>
    </div>
  );
}
