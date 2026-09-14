// Security response headers applied to every route. HSTS is deliberately not
// set here — it's already emitted at the edge (Vercel) and duplicating it risks
// a conflicting max-age. These are the four the launch audit found missing:
//   • X-Frame-Options SAMEORIGIN — anti-clickjacking. SAMEORIGIN (not DENY) so
//     the dev-only /devlab phone harness, which iframes our own routes
//     same-origin, keeps working; cross-origin framing is still blocked.
//   • X-Content-Type-Options nosniff — stop MIME-type sniffing.
//   • Referrer-Policy — send only the origin cross-site, never the full path.
//   • Permissions-Policy — we use no camera/mic/geolocation, so deny them.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve the standalone onboarding walkthrough (public/tour.html) at the clean
  // /tour URL. It's a self-contained cinematic page, deliberately outside the
  // React tree, so a rewrite is the right tool rather than an app route.
  async rewrites() {
    return [{ source: "/tour", destination: "/tour.html" }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
