import type { NextConfig } from "next";

// Served under gyraq.com/products/erp/<name> via a Vercel rewrite (see ../how-to-crm-website-add.md).
// Locally NEXT_PUBLIC_BASE_PATH is unset and the app runs at /.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
