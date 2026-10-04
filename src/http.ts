import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { googleConfigured } from "./config.js";
import { buildDemoEmails } from "./demo-mail.js";
import { dispatchTool, isToolName } from "./dispatch.js";
import {
  buildAuthUrl,
  exchangeAuthCode,
  GMAIL_READONLY_SCOPE,
} from "./gmail.js";
import { createMcpServer } from "./mcp.js";
import type { AppRuntime } from "./runtime.js";

const MCP_PATH = "/mcp";
const oauthStates = new Map<string, number>();

function publicPath(name: string): string {
  return fileURLToPath(new URL(`../public/${name}`, import.meta.url));
}

function readPublic(name: string): string {
  return readFileSync(publicPath(name), "utf8");
}

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

const STATIC_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

function publicFile(rel: string): string | null {
  const cleaned = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const root = PUBLIC_DIR.endsWith(sep) ? PUBLIC_DIR : `${PUBLIC_DIR}${sep}`;
  const file = resolve(root, cleaned);
  if (file !== root.slice(0, -1) && !file.startsWith(root)) return null;
  try {
    if (!statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return file;
}

function isLoopback(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? "").split(":")[0]?.replace(/^\[|\]$/g, "") ?? "";
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type: string,
): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function issueState(): string {
  const state = randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  return state;
}

function takeState(state: string): boolean {
  const expires = oauthStates.get(state);
  oauthStates.delete(state);
  return Boolean(expires && expires > Date.now());
}

function homePage(runtime: AppRuntime): string {
  const port = runtime.config.port;
  const connected = runtime.gmail.connected();
  const google = googleConfigured(runtime.config);
  const gmailLine = connected
    ? "Connected with read-only access."
    : google
      ? `<a href="/auth/google">Connect read-only Gmail</a>`
      : "Not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to use a real inbox.";
  const modeLine = runtime.config.demoMode
    ? "Demo mode is on. Scans use example emails unless a tool asks for source gmail."
    : "Demo mode is off. Scans use Gmail when it is connected, and fall back to example emails when it is not.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FreeTrial Terminator</title>
  <link rel="icon" href="/assets/icon-b-64.png" type="image/png" sizes="64x64" />
  <link rel="icon" href="/assets/icon-b-192.png" type="image/png" sizes="192x192" />
  <link rel="apple-touch-icon" href="/assets/icon-b-192.png" />
  <style>
    body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; background: #f3ecdf; color: #1a1714; }
    main { max-width: 640px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-family: Palatino, Georgia, serif; font-weight: 600; font-size: 32px; margin: 0 0 8px; }
    p { line-height: 1.45; }
    a { color: #7c2d12; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 10px 16px; }
    dt { font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #6f675e; }
    dd { margin: 0; }
    code { font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>FreeTrial Terminator</h1>
    <p>Free, no account needed.</p>
    <p>Local MCP server for the ChatGPT app. The widget preview uses the same tools as ChatGPT.</p>
    <dl>
      <dt>MCP</dt>
      <dd><code>http://127.0.0.1:${port}/mcp</code></dd>
      <dt>Widget</dt>
      <dd><a href="/preview">Open the widget preview</a></dd>
      <dt>Data</dt>
      <dd>${modeLine}</dd>
      <dt>Gmail</dt>
      <dd>${gmailLine} Scope: ${GMAIL_READONLY_SCOPE}</dd>
      <dt>Tracked</dt>
      <dd>${runtime.desk.list().length} trials in memory</dd>
    </dl>
  </main>
</body>
</html>`;
}

function authResultPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: "Avenir Next", "Segoe UI", sans-serif; background: #f3ecdf; color: #1a1714; }
    main { max-width: 560px; margin: 0 auto; padding: 48px 20px; }
    h1 { font-family: Palatino, Georgia, serif; font-size: 28px; }
    a { color: #7c2d12; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="/">Back to the server status</a></p>
  </main>
</body>
</html>`;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, runtime: AppRuntime): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  const server = createMcpServer(runtime, readPublic("widget.html"));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

export function createHttpServer(runtime: AppRuntime) {
  return createServer(async (req, res) => {
    try {
      if (!req.url || !req.method) {
        send(res, 400, "Missing request", "text/plain; charset=utf-8");
        return;
      }
      const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname !== "/" && url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;

      if (req.method === "OPTIONS" && pathname === MCP_PATH) {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "content-type, mcp-session-id, accept",
          "Access-Control-Expose-Headers": "Mcp-Session-Id",
        });
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/") {
        send(res, 200, homePage(runtime), "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && pathname === "/widget.html") {
        send(res, 200, readPublic("widget.html"), "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && pathname === "/preview") {
        send(res, 200, readPublic("preview.html"), "text/html; charset=utf-8");
        return;
      }

      if (
        req.method === "GET" &&
        (pathname.startsWith("/assets/") || pathname === "/manifest.webmanifest")
      ) {
        const rel = pathname.slice(1);
        const file = publicFile(rel);
        const type = STATIC_TYPES[extname(pathname).toLowerCase()];
        if (!file || !type) {
          send(res, 404, "Not found", "text/plain; charset=utf-8");
          return;
        }
        const body = readFileSync(file);
        res.writeHead(200, {
          "content-type": type,
          "cache-control": "public, max-age=86400",
          "x-content-type-options": "nosniff",
        });
        res.end(body);
        return;
      }

      if (req.method === "GET" && pathname === "/auth/status") {
        sendJson(res, 200, {
          connected: runtime.gmail.connected(),
          demoMode: runtime.config.demoMode,
          scope: GMAIL_READONLY_SCOPE,
          googleConfigured: googleConfigured(runtime.config),
        });
        return;
      }

      if (req.method === "GET" && pathname === "/auth/google") {
        if (!googleConfigured(runtime.config)) {
          send(
            res,
            400,
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before connecting Gmail.",
            "text/plain; charset=utf-8",
          );
          return;
        }
        const state = issueState();
        res.writeHead(302, {
          location: buildAuthUrl(
            {
              clientId: runtime.config.googleClientId,
              clientSecret: runtime.config.googleClientSecret,
              redirectUri: runtime.config.googleRedirectUri,
            },
            state,
          ),
        });
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/auth/google/callback") {
        const error = url.searchParams.get("error");
        if (error) {
          send(res, 400, authResultPage("Gmail was not connected", "Google did not grant access."), "text/html; charset=utf-8");
          return;
        }
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        if (!takeState(state) || !code) {
          send(
            res,
            400,
            authResultPage("Sign-in link expired", "Start again from the connect link on the status page."),
            "text/html; charset=utf-8",
          );
          return;
        }
        const grant = await exchangeAuthCode(
          {
            clientId: runtime.config.googleClientId,
            clientSecret: runtime.config.googleClientSecret,
            redirectUri: runtime.config.googleRedirectUri,
          },
          code,
          fetch,
        );
        runtime.tokens.applyGrant(grant);
        if (runtime.gmail.fetchAccountEmail) await runtime.gmail.fetchAccountEmail();
        const extra = runtime.config.demoMode
          ? " Demo mode is still the default. Ask for a Gmail scan, or set DEMO_MODE=false."
          : "";
        send(
          res,
          200,
          authResultPage(
            "Gmail connected",
            `Read-only access is on. You can close this tab and scan from ChatGPT.${extra}`,
          ),
          "text/html; charset=utf-8",
        );
        return;
      }

      if (pathname === "/api/call" && req.method === "POST") {
        if (!isLoopback(req)) {
          sendJson(res, 403, { error: "The preview API is only available on localhost." });
          return;
        }
        const body = (await readJson(req)) as { name?: string; arguments?: unknown };
        if (!body.name || !isToolName(body.name)) {
          sendJson(res, 400, { error: "Unknown tool." });
          return;
        }
        const result = await dispatchTool(body.name, body.arguments ?? {}, runtime);
        sendJson(res, 200, result);
        return;
      }

      if (pathname === "/api/preview/fixture" && req.method === "POST") {
        if (!isLoopback(req)) {
          sendJson(res, 403, { error: "The preview API is only available on localhost." });
          return;
        }
        const body = (await readJson(req)) as { name?: string };
        const now = runtime.now();
        runtime.desk.clear();
        if (body.name !== "empty") await runtime.desk.ingest(buildDemoEmails(now), "demo", now);
        sendJson(res, 200, runtime.desk.dashboard(now));
        return;
      }

      if (pathname === MCP_PATH && req.method && ["POST", "GET", "DELETE"].includes(req.method)) {
        await handleMcp(req, res, runtime);
        return;
      }

      send(res, 404, "Not found", "text/plain; charset=utf-8");
    } catch (error) {
      console.error("request failed", error instanceof Error ? error.name : "error");
      if (!res.headersSent) {
        send(res, 500, "Internal server error", "text/plain; charset=utf-8");
      }
    }
  });
}
