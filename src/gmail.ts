import type { EmailInput } from "./types.js";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const GMAIL_TRIAL_QUERY =
  '("free trial" OR "trial ends" OR "trial will end" OR "your trial" OR "after your trial" OR "trial period") newer_than:120d';

export class GmailNotConnectedError extends Error {
  constructor() {
    super("Gmail is not connected.");
    this.name = "GmailNotConnectedError";
  }
}

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type TokenGrant = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export class TokenStore {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;
  private email: string | null = null;

  constructor(private readonly config: { clientId: string; clientSecret: string; refreshToken?: string }) {
    if (config.refreshToken) this.refreshToken = config.refreshToken;
  }

  connected(): boolean {
    return Boolean(this.accessToken || this.refreshToken);
  }

  accountEmail(): string | null {
    return this.email;
  }

  setAccountEmail(email: string): void {
    this.email = email;
  }

  applyGrant(grant: TokenGrant): void {
    if (grant.access_token) this.accessToken = grant.access_token;
    if (grant.refresh_token) this.refreshToken = grant.refresh_token;
    const seconds = grant.expires_in ?? 3600;
    this.expiresAt = Date.now() + seconds * 1000;
  }

  async getAccessToken(fetchImpl: typeof fetch): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return this.accessToken;
    if (!this.refreshToken) throw new GmailNotConnectedError();
    const grant = await refreshAccessToken(
      {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        refreshToken: this.refreshToken,
      },
      fetchImpl,
    );
    this.applyGrant(grant);
    if (!this.accessToken) throw new GmailNotConnectedError();
    return this.accessToken;
  }
}

export function buildAuthUrl(config: OAuthConfig, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postToken(body: URLSearchParams, fetchImpl: typeof fetch): Promise<TokenGrant> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google token request failed with HTTP ${response.status}.`);
  }
  return (await response.json()) as TokenGrant;
}

export async function exchangeAuthCode(
  config: OAuthConfig,
  code: string,
  fetchImpl: typeof fetch,
): Promise<TokenGrant> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    fetchImpl,
  );
}

export async function refreshAccessToken(
  config: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch,
): Promise<TokenGrant> {
  return postToken(
    new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
    fetchImpl,
  );
}

export function decodeBase64Url(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(base64, "base64").toString("utf8");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};
export type GmailMessage = {
  id?: string;
  snippet?: string;
  payload?: GmailPart;
};

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function collectBodies(part: GmailPart | undefined, into: { plain: string[]; html: string[] }): void {
  if (!part) return;
  const data = part.body?.data;
  if (data && part.mimeType === "text/plain") into.plain.push(decodeBase64Url(data));
  if (data && part.mimeType === "text/html") into.html.push(decodeBase64Url(data));
  for (const child of part.parts ?? []) collectBodies(child, into);
}

export function parseGmailMessage(message: GmailMessage): EmailInput {
  const headers = message.payload?.headers;
  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(message.payload, bodies);
  const plain = bodies.plain.join("\n").trim();
  const html = bodies.html.join("\n");
  const text = (plain || htmlToText(html)).slice(0, 4000);
  const dateHeader = headerValue(headers, "Date");
  const parsedDate = new Date(dateHeader);
  const receivedAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  return {
    messageId: message.id ?? "unknown",
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject"),
    snippet: message.snippet ?? "",
    receivedAt,
    plainText: text || undefined,
  };
}

export interface GmailGateway {
  connected(): boolean;
  accountEmail(): string | null;
  listTrialEmails(max: number): Promise<{ emails: EmailInput[]; skipped: number }>;
  fetchAccountEmail?(): Promise<string | null>;
}

export class GmailClient implements GmailGateway {
  constructor(
    private readonly tokens: TokenStore,
    private readonly fetchImpl: typeof fetch,
  ) {}

  connected(): boolean {
    return this.tokens.connected();
  }

  accountEmail(): string | null {
    return this.tokens.accountEmail();
  }

  async fetchAccountEmail(): Promise<string | null> {
    try {
      const token = await this.tokens.getAccessToken(this.fetchImpl);
      const profile = await this.getJson(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        token,
      );
      const email = typeof profile.emailAddress === "string" ? profile.emailAddress : null;
      if (email) this.tokens.setAccountEmail(email);
      return email;
    } catch {
      return null;
    }
  }

  async listTrialEmails(max: number): Promise<{ emails: EmailInput[]; skipped: number }> {
    const token = await this.tokens.getAccessToken(this.fetchImpl);
    const capped = Math.min(Math.max(Math.floor(max) || 15, 1), 30);
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", GMAIL_TRIAL_QUERY);
    listUrl.searchParams.set("maxResults", String(capped));
    const list = await this.getJson(listUrl.toString(), token);
    const ids = Array.isArray(list.messages)
      ? list.messages
          .map((item) => (item && typeof item === "object" && "id" in item ? String(item.id) : ""))
          .filter(Boolean)
      : [];
    const emails: EmailInput[] = [];
    let skipped = 0;
    for (const id of ids) {
      try {
        const message = await this.getJson(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
          token,
        );
        emails.push(parseGmailMessage(message as GmailMessage));
      } catch {
        skipped += 1;
      }
    }
    return { emails, skipped };
  }

  private async getJson(url: string, token: string): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Gmail request failed with HTTP ${response.status}.`);
    }
    return (await response.json()) as Record<string, unknown>;
  }
}
