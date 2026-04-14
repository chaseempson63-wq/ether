/**
 * Centralised environment configuration.
 * Every server-side process.env read should go through ENV.
 * Fails fast at startup if required vars are missing.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[ENV] Missing required environment variable: ${name}. ` +
      `Add it to your .env file or deployment config.`
    );
  }
  return value;
}

function optional(name: string, fallback: string = ""): string {
  return process.env[name] ?? fallback;
}

export const ENV = {
  // ─── Required ───
  databaseUrl: required("DATABASE_URL"),
  supabaseUrl: required("VITE_SUPABASE_URL"),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY"),
  veniceApiKey: required("VENICE_API_KEY"),

  // ─── Optional (have sensible defaults or are only needed in specific contexts) ───
  appId: optional("VITE_APP_ID"),
  cookieSecret: optional("JWT_SECRET"),
  oAuthServerUrl: optional("OAUTH_SERVER_URL"),
  ownerOpenId: optional("OWNER_OPEN_ID"),
  port: parseInt(optional("PORT", "3000"), 10),
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
};
