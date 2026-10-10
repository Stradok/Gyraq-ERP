const env = process.env;
export const config = {
  databaseUrl: env.DATABASE_URL ?? "postgres://meridian:meridian@localhost:5433/meridian",
  port: Number(env.PORT ?? 4000),
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret-change-me",
  demoPassword: env.DEMO_PASSWORD ?? "meridian-demo",
  corsOrigin: (env.CORS_ORIGIN ?? "*").split(",").map((s) => s.trim()),
  tokenHours: 8,
};
if (config.jwtSecret === "dev-only-secret-change-me" && env.NODE_ENV === "production") throw new Error("Set JWT_SECRET before running in production.");
