import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const asset = (name) => readFileSync(join(root, "public/assets", name));
const b64 = (buf) => buf.toString("base64");

function fontFace(family, weight, file) {
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url("data:font/woff2;base64,${b64(asset(`fonts/${file}`))}") format("woff2");}`;
}

const webp = b64(asset("header-c.webp"));
const jpg = b64(asset("header-c.jpg"));
const icon64 = `data:image/png;base64,${b64(asset("icon-b-64.png"))}`;
const icon192 = `data:image/png;base64,${b64(asset("icon-b-192.png"))}`;

const across =
  "linear-gradient(90deg, rgba(4,4,10,.97) 0%, rgba(4,4,10,.94) 28%, rgba(4,4,10,.82) 48%, rgba(4,4,10,.45) 70%, rgba(4,4,10,.12) 100%)";
const down =
  "linear-gradient(180deg, rgba(4,4,10,.55) 0%, rgba(4,4,10,0) 40%, rgba(6,6,14,.9) 100%)";
const imageSet = `image-set(url("data:image/webp;base64,${webp}") type("image/webp"), url("data:image/jpeg;base64,${jpg}") type("image/jpeg"))`;

const css = [
  fontFace("IBM Plex Sans", 400, "ibm-plex-sans-latin-400.woff2"),
  fontFace("IBM Plex Sans", 600, "ibm-plex-sans-latin-600.woff2"),
  fontFace("IBM Plex Mono", 500, "ibm-plex-mono-latin-500.woff2"),
  fontFace("Cormorant Garamond", 600, "cormorant-garamond-latin-600.woff2"),
  `.hero{background-color:#04040a;background-image:${across},${down},${imageSet};background-repeat:no-repeat;background-size:cover;background-position:right center;}`,
].join("\n");

const template = readFileSync(join(root, "public/widget.template.html"), "utf8");
const html = template
  .replace("__ASSET_CSS__", css)
  .replaceAll("__ICON64__", icon64)
  .replaceAll("__ICON192__", icon192);

if (html.includes("__ASSET_CSS__") || html.includes("__ICON64__") || html.includes("__ICON192__")) {
  throw new Error("Widget template placeholders were not filled");
}

writeFileSync(join(root, "public/widget.html"), html);
console.log(`wrote public/widget.html (${html.length} chars)`);
