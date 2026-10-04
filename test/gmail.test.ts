import { describe, expect, it } from "vitest";
import {
  buildAuthUrl,
  decodeBase64Url,
  GMAIL_READONLY_SCOPE,
  GMAIL_TRIAL_QUERY,
  GmailClient,
  htmlToText,
  parseGmailMessage,
  TokenStore,
} from "../src/gmail.js";

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("gmail read-only client", () => {
  it("requests only the readonly scope", () => {
    const url = buildAuthUrl(
      {
        clientId: "client",
        clientSecret: "secret",
        redirectUri: "http://127.0.0.1:47231/auth/google/callback",
      },
      "state-token",
    );
    expect(url).toContain(encodeURIComponent(GMAIL_READONLY_SCOPE));
    expect(url).not.toContain("gmail.send");
    expect(url).not.toContain("gmail.modify");
    expect(url).not.toContain("mail.google.com");
    expect(url).toContain("include_granted_scopes=false");
    expect(GMAIL_TRIAL_QUERY).toContain("free trial");
  });

  it("strips html and decodes the plain part without keeping it as a stored field name", () => {
    expect(htmlToText("<style>p{}</style><script>alert(1)</script><p>Your free trial ends tomorrow.</p>")).toBe(
      "Your free trial ends tomorrow.",
    );
    const message = parseGmailMessage({
      id: "abc123",
      snippet: "SNIPPET_SECRET",
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "Calm <hello@calm.com>" },
          { name: "Subject", value: "Your Calm free trial" },
          { name: "Date", value: "Thu, 01 Oct 2026 12:00:00 +0000" },
        ],
        parts: [
          {
            mimeType: "text/plain",
            body: {
              data: encode(
                "Your free trial ends on October 20, 2026. Then $69.99/year unless you cancel. SECRET_BODY",
              ),
            },
          },
        ],
      },
    });
    expect(message.messageId).toBe("abc123");
    expect(message.from).toContain("calm.com");
    expect(message.plainText).toContain("SECRET_BODY");
    expect(message.snippet).toBe("SNIPPET_SECRET");
    expect(decodeBase64Url(encode("ok"))).toBe("ok");
  });

  it("lists messages with the trial query and a bearer token", async () => {
    const seen: Array<{ url: string; authorization: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      seen.push({ url, authorization: headers.get("authorization") ?? "" });
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), { status: 200 });
      }
      if (url.includes("/messages?")) {
        return new Response(JSON.stringify({ messages: [{ id: "m1" }] }), { status: 200 });
      }
      if (url.includes("/messages/m1")) {
        return new Response(
          JSON.stringify({
            id: "m1",
            snippet: "Your free trial ends tomorrow.",
            payload: {
              headers: [
                { name: "From", value: "Canva <no-reply@canva.com>" },
                { name: "Subject", value: "Your Canva free trial" },
                { name: "Date", value: "Sat, 03 Oct 2026 12:00:00 +0000" },
              ],
              mimeType: "text/html",
              body: {
                data: encode("<p>Your free trial ends tomorrow. After your trial, you will be billed $14.99/month.</p>"),
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 404 });
    };

    const tokens = new TokenStore({
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh-token",
    });
    const client = new GmailClient(tokens, fetchImpl);
    const listed = await client.listTrialEmails(10);
    expect(listed.emails).toHaveLength(1);
    expect(listed.emails[0]?.plainText).toContain("$14.99/month");
    expect(listed.emails[0]?.subject).toContain("Canva");
    const listCall = seen.find((call) => call.url.includes("/messages?"));
    const query = new URL(listCall?.url ?? "http://localhost").searchParams.get("q") ?? "";
    expect(query).toContain("free trial");
    expect(listCall?.authorization).toBe("Bearer access-token");
    expect(seen.some((call) => call.url.includes("gmail.send"))).toBe(false);
  });
});
