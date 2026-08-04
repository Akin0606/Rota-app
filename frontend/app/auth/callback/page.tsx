"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setError(true);
      return;
    }

    console.log("[debug] cookies on callback page:", document.cookie);
    console.log("[debug] full callback URL:", window.location.href);

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error: err }) => {
      console.log("[debug] exchangeCodeForSession error:", err);
      if (err) {
        setError(true);
      } else {
        router.replace("/");
      }
    });
  }, [router]);

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center px-6 py-24 text-center">
      <div className="text-sm text-ink-muted">
        {error ? "That link has expired or is invalid. Please request a new one." : "Signing you in…"}
      </div>
    </div>
  );
}
