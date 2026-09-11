/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serve the standalone onboarding walkthrough (public/tour.html) at the clean
  // /tour URL. It's a self-contained cinematic page, deliberately outside the
  // React tree, so a rewrite is the right tool rather than an app route.
  async rewrites() {
    return [{ source: "/tour", destination: "/tour.html" }];
  },
};

export default nextConfig;
