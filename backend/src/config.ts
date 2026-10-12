const env = process.env;
export const config = {
  databaseUrl: env.DATABASE_URL ?? "postgres://meridian:meridian@localhost:5433/meridian",
  port: Number(env.PORT ?? 4000),
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret-change-me",
  demoPassword: env.DEMO_PASSWORD ?? "meridian-demo",
  corsOrigin: (env.CORS_ORIGIN ?? "*").split(",").map((s) => s.trim()),
  tokenHours: 8,
  // demo = seeded sample company. empty = a real company that starts blank (one Owner account from OWNER_*).
  companyMode: (env.COMPANY_MODE === "empty" ? "empty" : "demo") as "demo" | "empty",
  ownerEmail: env.OWNER_EMAIL ?? "",
  ownerName: env.OWNER_NAME ?? "Owner",
  ownerPassword: env.OWNER_PASSWORD ?? "",
};
// Refuse to start in production with unsafe defaults.
if (env.NODE_ENV === "production") {
  if (config.jwtSecret === "dev-only-secret-change-me" || config.jwtSecret.length < 32) throw new Error("Set JWT_SECRET to a random string of at least 32 characters (openssl rand -hex 32).");
  if (config.corsOrigin.includes("*")) throw new Error("Set CORS_ORIGIN to your web address (for example https://erp.customer.com); '*' is not allowed in production.");
}
export const trustProxy = env.TRUST_PROXY === "1"; // only behind a reverse proxy that sets X-Forwarded-For itself
