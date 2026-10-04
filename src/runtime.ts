import { loadConfig, type AppConfig } from "./config.js";
import { createDesk, type TrialDesk } from "./desk.js";
import { GmailClient, TokenStore, type GmailGateway } from "./gmail.js";
import { createCompositeExtractor, createLlmExtractor } from "./parser/index.js";

export type AppRuntime = {
  config: AppConfig;
  desk: TrialDesk;
  gmail: GmailGateway;
  tokens: TokenStore;
  now: () => Date;
};

export function createRuntime(overrides?: {
  config?: AppConfig;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): AppRuntime {
  const config = overrides?.config ?? loadConfig();
  const fetchImpl = overrides?.fetchImpl ?? fetch;
  const tokens = new TokenStore({
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    refreshToken: config.gmailRefreshToken,
  });
  const llm = config.openAiApiKey
    ? createLlmExtractor({
        apiKey: config.openAiApiKey,
        model: config.openAiModel,
        fetchImpl,
      })
    : null;
  return {
    config,
    desk: createDesk(createCompositeExtractor({ llm })),
    gmail: new GmailClient(tokens, fetchImpl),
    tokens,
    now: overrides?.now ?? (() => new Date()),
  };
}
