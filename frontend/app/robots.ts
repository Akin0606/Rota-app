import type { MetadataRoute } from "next";

// Staging serves a byte-identical copy of the marketing site on its own public
// domain, so without this it competes with rotally.co.uk for the same keywords.
// Only a production Vercel deployment is crawlable; every preview and the
// staging branch return a blanket disallow.
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === "production";

  if (!isProduction) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The app itself is behind auth and has nothing to index.
      disallow: ["/admin", "/onboarding", "/v/", "/dashboard", "/rota", "/team", "/settings"],
    },
  };
}
