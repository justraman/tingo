import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    // Static export + hash routing keeps IPFS gateways happy.
    typedRoutes: false,
  },
};

export default nextConfig;
