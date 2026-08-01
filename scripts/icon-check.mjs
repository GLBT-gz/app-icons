#!/usr/bin/env node
/**
 * 图标库体检脚本
 *
 * 纯 Node 实现，无第三方依赖：
 *  - 校验 icons/ 下所有文件的格式与尺寸（PNG/ICO/SVG/JPEG）
 *  - 对照 index.json 找出：登记了但缺文件 / 有文件但未登记
 *  - 标记可疑项（非法文件、无尺寸、尺寸过小）
 *
 * 用法：
 *   node scripts/icon-check.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = resolve(ROOT, "icons");
const INDEX = JSON.parse(readFileSync(resolve(ROOT, "index.json"), "utf8"));

const EXT_FORMAT = {
  ".png": "PNG",
  ".ico": "ICO",
  ".svg": "SVG",
  ".jpg": "JPEG",
  ".jpeg": "JPEG",
  ".webp": "WEBP",
  ".gif": "GIF",
};

function parsePng(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { format: "PNG", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseIco(buf) {
  if (buf.length < 6) return null;
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    if (off + 16 > buf.length) break;
    let w = buf.readUInt8(off);
    let h = buf.readUInt8(off + 1);
    if (w === 0) w = 256;
    if (h === 0) h = 256;
    sizes.push(`${w}x${h}`);
  }
  return { format: "ICO", count, sizes };
}

function parseSvg(buf) {
  const text = buf.toString("utf8", 0, Math.min(buf.length, 8192));
  if (!/<svg[\s>]/i.test(text)) return null;
  const w = text.match(/width=["']\s*([\d.]+)\s*(?:px)?["']/i);
  const h = text.match(/height=["']\s*([\d.]+)\s*(?:px)?["']/i);
  const vb = text.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  return {
    format: "SVG",
    width: w ? w[1] : vb ? vb[1] : undefined,
    height: h ? h[1] : vb ? vb[2] : undefined,
    hasViewBox: !!vb,
  };
}

function parseJpeg(buf) {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf.readUInt16BE(off) !== 0xffff) {
      off++;
      continue;
    }
    const marker = buf.readUInt8(off + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { format: "JPEG", width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
    }
    const len = buf.readUInt16BE(off + 3);
    if (len < 2) break;
    off += 2 + len;
  }
  return { format: "JPEG", width: undefined, height: undefined };
}

function parseFile(buf) {
  if (parsePng(buf)) return parsePng(buf);
  if (parseIco(buf)) return parseIco(buf);
  const jpeg = parseJpeg(buf);
  if (jpeg) return jpeg;
  if (parseSvg(buf)) return parseSvg(buf);
  return null;
}

const registered = new Map(INDEX.icons.map((i) => [`${i.category}/${i.file}`, i]));
const diskFiles = [];
for (const dir of readdirSync(ICONS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name === "archived") continue;
  for (const f of readdirSync(resolve(ICONS_DIR, dir.name))) {
    diskFiles.push(`${dir.name}/${f}`);
  }
}

const missing = INDEX.icons
  .map((i) => `${i.category}/${i.file}`)
  .filter((k) => !existsSync(resolve(ICONS_DIR, k)));

const unregistered = diskFiles.filter((k) => !registered.has(k));

const suspicious = [];
const detail = [];
for (const [k, entry] of registered) {
  const abs = resolve(ICONS_DIR, k);
  if (!existsSync(abs)) continue;
  const buf = readFileSync(abs);
  const info = parseFile(buf);
  const stat = statSync(abs);
  const expectedExt = Object.entries(EXT_FORMAT).find(([e]) => k.toLowerCase().endsWith(e));
  let flag = null;

  if (!info) {
    flag = `非法文件（无法解析，${buf.length} 字节）`;
  } else if (expectedExt && info.format !== expectedExt[1]) {
    flag = `扩展名与内容不符（.${k.split(".").pop()} 实为 ${info.format}）`;
  } else if (info.format === "SVG") {
    if (!info.hasViewBox && (!info.width || !info.height)) {
      flag = `SVG 无 viewBox/尺寸，缩放可能异常`;
    }
  } else if (info.format === "ICO") {
    const maxW = Math.max(...info.sizes.map((s) => Number(s.split("x")[0])));
    const maxH = Math.max(...info.sizes.map((s) => Number(s.split("x")[1])));
    if (info.count && info.count < 2) {
      flag = `ICO 仅 ${info.count} 个尺寸（${info.sizes.join(",")}）`;
    } else if (info.sizes.some((s) => s.split("x")[0] !== s.split("x")[1])) {
      flag = `ICO 存在非方形尺寸（${info.sizes.join(",")}，注意：DIB 存储的 AND mask 会把高度翻倍，如 32x64 实为 32x32）`;
    } else if (Math.min(maxW, maxH) < 128) {
      flag = `最大尺寸过小 ${maxW}x${maxH}`;
    }
  } else if (info.width && info.height) {
    const min = Math.min(Number(info.width), Number(info.height));
    if (min < 32) {
      flag = `尺寸过小 ${info.width}x${info.height}`;
    }
  } else {
    flag = `无法确定尺寸`;
  }

  const name = entry.name;

  if (flag) suspicious.push({ key: k, flag });
  detail.push({ key: k, name: entry.name, info: info ? (info.format === "ICO" ? `${info.format}[${info.sizes.join("/")}]` : info.format) : "?", size: `${stat.size} B` });
}

console.log("═══ 图标库体检报告 ═══\n");
console.log(`登记条目: ${INDEX.icons.length}  |  磁盘文件: ${diskFiles.length}\n`);

console.log("◆ 登记但缺文件（缺失）:");
console.log(missing.length ? missing.map((k) => `  - ${k}`).join("\n") : "  （无）\n");

console.log("\n◆ 有文件但未登记 index.json:");
console.log(unregistered.length ? unregistered.map((k) => `  - ${k}`).join("\n") : "  （无）\n");

console.log("\n◆ 可疑项:");
console.log(suspicious.length ? suspicious.map((s) => `  - ${s.key}: ${s.flag}`).join("\n") : "  （无）\n");

console.log("\n◆ 全量明细（format/尺寸）:");
for (const d of detail.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${d.key.padEnd(45)} ${d.info.padEnd(28)} ${d.size}`);
}
