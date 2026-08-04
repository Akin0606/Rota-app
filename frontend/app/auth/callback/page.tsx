"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    console.log("[debug] callback: 'code' param present?", code !== null, code ? `(length ${code.length})` : "");

    if (!code) {
      setErrorMessage("No sign-in code was present in the link. Please request a new one.");
      return;
    }

    console.log("[debug] cookies on callback page:", document.cookie);
    console.log("[debug] full callback URL:", window.location.href);

    const supabase = createClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: err }) => {
        console.log("[debug] exchangeCodeForSession error:", err);
        if (err) {
          setErrorMessage(err.message);
        } else {
          router.replace("/");
        }
      })
      .catch((err) => {
        // A thrown/rejected promise (as opposed to a returned error) would
        // otherwise leave the page stuck on "Signing you in…" forever.
        console.log("[debug] exchangeCodeForSession threw:", err);
        setErrorMessage(err instanceof Error ? err.message : String(err));
      });
  }, [router]);

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center px-6 py-24 text-center">
      {errorMessage ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-unavail-text">Could not sign you in</div>
          <div className="text-sm text-ink-muted">{errorMessage}</div>
          <div className="text-xs text-ink-faint">
            If this keeps happening, request a new link from the login page.
          </div>
        </div>
      ) : (
        <div className="text-sm text-ink-muted">Signing you in…</div>
      )}
    </div>
  );
}
