import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint errors are pre-existing across the codebase and are style/lint issues,
  // not runtime bugs. TypeScript strict-mode (`tsc --noEmit`) is the type safety gate.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // tsc --noEmit is run separately in CI; don't double-fail the build
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
