import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: [
    "deepromeo.rominur.com",
    "openromeo.rominur.com",
    "localhost:3000",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
