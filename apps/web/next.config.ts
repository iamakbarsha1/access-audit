import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@access-audit/db"],
};

export default nextConfig;
