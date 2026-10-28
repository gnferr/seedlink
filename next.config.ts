import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The dev badge's default bottom-left spot sits on the phone controls.
  devIndicators: { position: "top-right" },
  cacheComponents: true,
  partialPrefetching: true,
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
