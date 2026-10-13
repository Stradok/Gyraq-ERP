import type { NextConfig } from "next";

// Served under gyraq.com/products/erp/<name> via a Vercel rewrite (see ../how-to-crm-website-add.md).
// Locally NEXT_PUBLIC_BASE_PATH is unset and the app runs at /.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    // A partial CSP on purpose: inline scripts stay allowed (Next needs them), but the page cannot be framed, cannot load plugins,
    // and cannot change its base URL, which closes the common click-jacking and injection routes.
    const csp = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "Content-Security-Policy", value: csp },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ] }];
  },
  ...(process.env.BUILD_STANDALONE ? { output: "standalone" as const } : {}), // self-hosted Docker image
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
