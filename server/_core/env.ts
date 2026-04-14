/**
 * Centralised environment configuration.
 * Every server-side process.env read should go through ENV.
 *
 * Call validateEnv() at server startup to fail fast if required vars
 * are missing. The ENV object itself is safe to import in tests.
 */

export const ENV = {
  // ─── Core (required in production) ───
  databaseUrl: process.env.DATABASE_URL ?? "",
  supabaseUrl: process.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY ?? "",
  veniceApiKey: process.env.VENICE_API_KEY ?? "",

  // ─── Optional ───
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  port: parseInt(process.env.PORT ?? "3000", 10),
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
};

/**
 * Validate that all required environment variables are set.
 * Call this once at server startup — NOT at import time.
 * Throws with a clear error listing every missing var.
 */
export function validateEnv(): void {
  const required: Array<[keyof typeof ENV, string]> = [
    ["databaseUrl", "DATABASE_URL"],
    ["supabaseUrl", "VITE_SUPABASE_URL"],
    ["supabaseAnonKey", "VITE_SUPABASE_ANON_KEY"],
    ["veniceApiKey", "VENICE_API_KEY"],
  ];

  const missing = required
    .filter(([key]) => !ENV[key])
    .map(([, envName]) => envName);

  if (missing.length > 0) {
    throw new Error(
      `[ENV] Missing required environment variable(s): ${missing.join(", ")}. ` +
      `Add them to your .env file or deployment config.`
    );
  }
}
