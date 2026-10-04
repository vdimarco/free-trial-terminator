import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:47231";
const outDir = new URL("../docs/screenshots/", import.meta.url).pathname;
const smallDir = new URL("../docs/screenshots-small/", import.meta.url).pathname;
const artifactDir = "/opt/cursor/artifacts/screenshots";
mkdirSync(outDir, { recursive: true });
mkdirSync(smallDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

function writeJpeg(pngPath, jpgPath) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
from PIL import Image
import os, sys
src, dest = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
limit = 200000
scale = 1.0
while True:
    w = max(1, int(im.width * scale))
    h = max(1, int(im.height * scale))
    frame = im if scale == 1 else im.resize((w, h), Image.Resampling.LANCZOS)
    frame.save(dest, "JPEG", quality=70, optimize=True)
    if os.path.getsize(dest) <= limit or scale <= 0.45:
        break
    scale = round(scale - 0.05, 2)
print(os.path.getsize(dest), scale)
`,
      pngPath,
      jpgPath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "JPEG encode failed");
  console.log(`jpeg ${jpgPath} ${result.stdout.trim()}`);
}

async function save(page, name) {
  const shot = { fullPage: true, captureBeyondViewport: true };
  const png = join(outDir, name);
  await page.screenshot({ ...shot, path: png });
  await page.screenshot({ ...shot, path: join(artifactDir, `restyle_${name}`) });
  const jpgName = name.replace(/\.png$/, ".jpg");
  writeJpeg(png, join(smallDir, jpgName));
  console.log(name);
}

async function resetDemo() {
  const response = await fetch(`${base}/api/preview/fixture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "demo" }),
  });
  if (!response.ok) throw new Error(`Fixture reset failed with HTTP ${response.status}`);
}

async function waitForFrame(page) {
  await page.waitForFunction(() => {
    const iframe = document.querySelector("iframe");
    const shell = iframe?.contentDocument?.querySelector("#shell");
    if (!iframe || !shell || shell.hidden) return false;
    return iframe.offsetHeight + 1 >= shell.offsetHeight;
  });
  const frame = page.frames().find((item) => item.url().includes("widget.html"));
  if (!frame) throw new Error("Widget frame missing");
  return frame;
}

async function openPreview(page) {
  await page.goto(`${base}/preview`, { waitUntil: "networkidle0" });
  return waitForFrame(page);
}

function contrastOf(pngBase64) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import base64, io, sys
from PIL import Image
im = Image.open(io.BytesIO(base64.b64decode(sys.stdin.read()))).convert("RGB")
pixels = list(im.getdata())
def lum(r, g, b):
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    R, G, B = ch(r), ch(g), ch(b)
    return 0.2126 * R + 0.7152 * G + 0.0722 * B
text = [p for p in pixels if lum(*p) > 0.35]
bg = [p for p in pixels if lum(*p) < 0.15]
def avg(group):
    n = max(1, len(group))
    return tuple(sum(p[i] for p in group) / n for i in range(3))
print(len(text), len(bg))
if len(text) < 8 or len(bg) < 8:
    sys.exit(2)
lt, lb = lum(*avg(text)), lum(*avg(bg))
hi, lo = max(lt, lb), min(lt, lb)
ratio = (hi + 0.05) / (lo + 0.05)
print(f"{ratio:.2f}")
print(f"text {tuple(round(v) for v in avg(text))} bg {tuple(round(v) for v in avg(bg))}")
`,
    ],
    { input: pngBase64, encoding: "utf8" },
  );
  return { status: result.status ?? 1, out: result.stdout, err: result.stderr };
}

async function auditNarrow(page, frame) {
  const widget = await frame.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      if (rect.right > doc.clientWidth + 1 || rect.left < -1) {
        const label = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
        offenders.push(label);
        if (offenders.length >= 12) break;
      }
    }
    const title = document.querySelector("h1");
    const color = title ? getComputedStyle(title).color : "";
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      offenders,
      titleColor: color,
    };
  });
  const pageBox = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log("overflow", JSON.stringify({ widget, pageBox }));
  if (widget.scrollWidth > widget.clientWidth + 1 || widget.offenders.length > 0) {
    throw new Error(`Widget overflow: ${JSON.stringify(widget)}`);
  }
  if (pageBox.scrollWidth > pageBox.clientWidth + 1) {
    throw new Error(`Preview page overflow: ${JSON.stringify(pageBox)}`);
  }

  const title = await frame.$("h1");
  const box = await title?.boundingBox();
  if (!box) throw new Error("Title box missing");
  const clip = {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
  };
  const shot = await page.screenshot({ clip, encoding: "base64" });
  writeFileSync("/tmp/header-title-clip.png", Buffer.from(shot, "base64"));
  const contrast = contrastOf(shot);
  console.log("header contrast", contrast.out.trim(), contrast.err.trim());
  if (contrast.status !== 0) throw new Error(`Header contrast check failed: ${contrast.out} ${contrast.err}`);
  const ratio = Number(contrast.out.trim().split("\n")[1]);
  if (!Number.isFinite(ratio) || ratio < 4.5) {
    throw new Error(`Header title contrast ${ratio} is below 4.5:1`);
  }
}

async function flow(width, prefix) {
  await resetDemo();
  const page = await browser.newPage();
  await page.setViewport({
    width,
    height: width < 500 ? 844 : 900,
    deviceScaleFactor: 2,
  });
  const frame = await openPreview(page);
  await frame.waitForSelector('[data-action="cancel"][data-id="canva"]');
  if (width <= 400) await auditNarrow(page, frame);
  await save(page, `${prefix}_list.png`);

  await frame.click('[data-action="cancel"][data-id="canva"]');
  await frame.waitForSelector('[data-action="approve-check"][data-id="canva"]');
  await waitForFrame(page);
  if (width <= 400) await auditNarrow(page, frame);
  await save(page, `${prefix}_approval.png`);

  await frame.click('[data-action="approve-check"][data-id="canva"]');
  await frame.waitForFunction(() => {
    const button = document.querySelector('[data-action="confirm-cancel"][data-id="canva"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await frame.click('[data-action="confirm-cancel"][data-id="canva"]');
  await frame.waitForSelector(".draft");
  await frame.waitForFunction(() => document.querySelector(".draft")?.textContent?.includes("Please cancel"));
  await waitForFrame(page);
  if (width <= 400) await auditNarrow(page, frame);
  await save(page, `${prefix}_guidance.png`);
  await page.close();
}

await flow(1280, "preview_desktop");
await flow(390, "preview_mobile");
await browser.close();
console.log("screenshots written");
