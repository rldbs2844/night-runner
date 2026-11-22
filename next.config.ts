import type { NextConfig } from "next";

const isGitHubPages =
  process.env.GITHUB_ACTIONS === "true" && process.env.CF_PAGES !== "1";

const nextConfig: NextConfig = {
  output: "export",
  ...(isGitHubPages ? { basePath: "/night-runner" } : {}),
  images: {
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
