import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) found.push(...filesUnder(path));
    else if (/\.(md|html|ts|mjs|sh)$/.test(entry)) found.push(path);
  }
  return found;
}

function ownedFiles(): string[] {
  const dirs = ["src", "test", "public", "scripts"].flatMap((name) => {
    const dir = join(ROOT, name);
    try {
      return statSync(dir).isDirectory() ? filesUnder(dir) : [];
    } catch {
      return [];
    }
  });
  return [...dirs, join(ROOT, "README.md"), join(ROOT, ".env.example"), join(ROOT, "start.sh")].filter((path) => {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

describe("user-facing copy", () => {
  it("says the app is free and does not sell a plan", () => {
    const widget = readFileSync(join(ROOT, "public/widget.html"), "utf8");
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const listing = readFileSync(join(ROOT, "src/mcp.ts"), "utf8");
    for (const text of [widget, readme, listing]) {
      expect(text).toContain("Free, no account needed");
      expect(text).not.toContain("$7.99");
      expect(text).not.toMatch(/paywall|upgrade prompt|plan limit/i);
    }
  });

  it("does not use em dashes or en dashes", () => {
    const offenders: string[] = [];
    for (const path of ownedFiles()) {
      const text = readFileSync(path, "utf8");
      if (text.includes("\u2014") || text.includes("\u2013")) offenders.push(path.replace(ROOT, ""));
    }
    expect(offenders).toEqual([]);
  });

  it("ships header and icon files under 200KB and inlines them for ChatGPT", () => {
    const names = [
      "header-c.webp",
      "header-c.jpg",
      "icon-b-64.png",
      "icon-b-192.png",
      "icon-b-512.png",
      "icon-b-1024.png",
      "fonts/ibm-plex-sans-latin-400.woff2",
      "fonts/ibm-plex-sans-latin-600.woff2",
      "fonts/ibm-plex-mono-latin-500.woff2",
      "fonts/cormorant-garamond-latin-600.woff2",
    ];
    for (const name of names) {
      const size = statSync(join(ROOT, "public/assets", name)).size;
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(200 * 1024);
    }
    const widget = readFileSync(join(ROOT, "public/widget.html"), "utf8");
    expect(widget).toContain("data:font/woff2;base64,");
    expect(widget).toContain("data:image/webp;base64,");
    expect(widget).toContain("data:image/jpeg;base64,");
    expect(widget).not.toContain("__ASSET_CSS__");
    expect(widget).not.toContain("__ICON64__");
  });
});
