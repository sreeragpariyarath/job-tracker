import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: { "/api/tailored-drafts/pdf": ["./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"] },
};

export default nextConfig;
