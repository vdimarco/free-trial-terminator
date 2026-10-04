import { existsSync, readFileSync } from "node:fs";

export type AppConfig = {
  port: number;
  demoMode: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  gmailRefreshToken: string;
  openAiApiKey: string;
  openAiModel: string;
};

export function loadEnvFile(path = ".env"): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env.PORT ?? 47231);
  const safePort = Number.isFinite(port) && port > 0 ? port : 47231;
  return {
    port: safePort,
    demoMode: env.DEMO_MODE !== "false",
    googleClientId: env.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    googleRedirectUri:
      env.GOOGLE_REDIRECT_URI ?? `http://127.0.0.1:${safePort}/auth/google/callback`,
    gmailRefreshToken: env.GMAIL_REFRESH_TOKEN ?? "",
    openAiApiKey: env.OPENAI_API_KEY ?? "",
    openAiModel: env.OPENAI_MODEL ?? "gpt-4o-mini",
  };
}

export function googleConfigured(config: AppConfig): boolean {
  return Boolean(config.googleClientId && config.googleClientSecret);
}
