import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "docx", "exceljs", "pptxgenjs"],
  allowedDevOrigins: [
    "deepromeo.rominur.com",
    "openromeo.rominur.com",
    "localhost:3000",
  ],
  turbopack: {
    root: process.cwd(),
  },
  agentRules: false,
  // Local/proxy buffer only — Vercel still hard-caps serverless bodies at ~4.5MB.
  experimental: {
    proxyClientMaxBodySize: "25mb",
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
