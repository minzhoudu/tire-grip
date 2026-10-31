import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // small Docker image for Coolify
  async headers() {
    return [
      {
        // Browsers must always pick up a new service worker right away.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
