/**
 * app-icons 图标处理脚本
 *
 * 命令：
 *   convert <输入> -o <输出> [-s 尺寸[,尺寸,...]]
 *     - 格式由输出扩展名决定（png/jpg/webp/ico）
 *     - 输出 .ico 且指定多个尺寸时，合成多分辨率 ICO
 *     - 例：node scripts/icon-tool.mjs convert a.svg -o a.png -s 128
 *           node scripts/icon-tool.mjs convert a.png -o a.ico -s 16,32,48,256
 *
 *   extract <exe> [-o 输出.ico] [--png [--size 尺寸]]
 *     - 解析 PE 资源节，提取 exe 内全部尺寸图标，组装为 .ico
 *     - 加 --png 时再用转换器输出 PNG（默认最大尺寸）
 *     - 例：node scripts/icon-tool.mjs extract app.exe -o app.ico --png --size 256
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import sharp from "sharp";

// ═══════════════════ 基础工具 ═══════════════════

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

function getOption(names) {
  for (let i = 0; i < rest.length; i++) {
    if (names.includes(rest[i])) return rest[i + 1];
  }
  return undefined;
}

function getSizes() {
  const v = getOption(["-s", "--size"]);
  if (!v) return [];
  return v
    .split(",")
    .map(Number)
    .filter((n) => n > 0 && n <= 1024);
}

function usage() {
  console.log(`用法：
  node scripts/icon-tool.mjs convert <输入> -o <输出> [-s 尺寸[,尺寸,...]]
      格式由输出扩展名决定（png/jpg/webp/ico）；输出 ico 且多尺寸时合成多分辨率 ICO
  node scripts/icon-tool.mjs extract <exe> [-o 输出.ico] [--png [--size 尺寸]]
      提取 exe 全部尺寸图标（PE 资源 RT_GROUP_ICON / RT_ICON），--png 额外输出 PNG`);
  process.exit(1);
}

// ═══════════════════ ICO 组装（PNG-in-ICO，Vista+ 兼容） ═══════════════════

function buildIco(entries) {
  // entries: [{ size, data }]，data 为 PNG 字节
  const dirs = [];
  const datas = [];
  let offset = 6 + 16 * entries.length;
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    d.writeUInt8(0, 2); // 调色板数
    d.writeUInt16LE(1, 4); // planes
    d.writeUInt16LE(32, 6); // bit count
    d.writeUInt32LE(e.data.length, 8);
    d.writeUInt32LE(offset, 12);
    dirs.push(d);
    datas.push(e.data);
    offset += e.data.length;
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  return Buffer.concat([header, ...dirs, ...datas]);
}

// ═══════════════════ ICO 解码（PNG 条目直接提取 / DIB 条目解析为 RGBA） ═══════════════════

function dibToRgba(data) {
  const width = data.readInt32LE(4);
  const heightRaw = data.readInt32LE(8);
  const bitCount = data.readUInt16LE(14);
  const compression = data.readUInt32LE(16);
  if (compression !== 0) throw new Error(`不支持的 DIB 压缩方式: ${compression}`);
  if (bitCount !== 32 && bitCount !== 24 && bitCount !== 8) {
    throw new Error(`暂不支持 ${bitCount} bpp 的 DIB 图标（仅 32/24/8）`);
  }
  const height = Math.floor(Math.abs(heightRaw) / 2); // ICO 高度含 XOR + AND mask

  // 调色板（bitCount <= 8 时存在）
  const palette = [];
  if (bitCount <= 8) {
    const n = 1 << bitCount;
    for (let i = 0; i < n; i++) {
      const po = 40 + i * 4;
      palette.push([data[po + 2], data[po + 1], data[po], data[po + 3]]);
    }
  }

  const bytesPerRow = ((width * bitCount + 31) >> 5) * 4;
  const xorStart = 40 + palette.length * 4;
  const andRowSize = ((width + 31) >> 5) * 4;
  const andStart = xorStart + bytesPerRow * height;

  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowY = height - 1 - y; // bottom-up
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 255;
      if (bitCount === 32) {
        const idx = xorStart + rowY * bytesPerRow + x * 4;
        b = data[idx]; g = data[idx + 1]; r = data[idx + 2]; a = data[idx + 3];
      } else if (bitCount === 24) {
        const idx = xorStart + rowY * bytesPerRow + x * 3;
        b = data[idx]; g = data[idx + 1]; r = data[idx + 2];
      } else {
        const idx = xorStart + rowY * bytesPerRow + x;
        [r, g, b] = palette[data[idx]];
      }
      if (bitCount !== 32) {
        // AND mask：1 = 透明
        const byte = data[andStart + y * andRowSize + (x >> 3)];
        if ((byte >> (7 - (x & 7))) & 1) a = 0;
      }
      const o = (y * width + x) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
    }
  }
  return { rgba, width, height };
}

/** 从 ICO 取指定尺寸（不传取最大）的 PNG 缓冲 */
async function icoToPng(icoPath, size) {
  const buf = readFileSync(icoPath);
  const count = buf.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const w = buf.readUInt8(o) || 256;
    const dataOff = buf.readUInt32LE(o + 12);
    const dataSize = buf.readUInt32LE(o + 8);
    entries.push({ w, data: buf.subarray(dataOff, dataOff + dataSize) });
  }
  // 选最大；指定尺寸时选 >= 它的最小，否则退回最大
  let best = entries.reduce((a, b) => (b.w > a.w ? b : a), entries[0]);
  if (size) {
    const ge = entries.filter((e) => e.w >= size);
    if (ge.length) best = ge.reduce((a, b) => (b.w < a.w ? b : a), ge[0]);
  }
  const d = best.data;
  let src;
  if (d.length >= 8 && d.readUInt32LE(0) === 0x474e5089) {
    src = Buffer.from(d); // PNG 条目
  } else {
    const { rgba, width, height } = dibToRgba(d);
    src = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  }
  return size ? await sharp(src).resize(size, size).png().toBuffer() : src;
}

// ═══════════════════ convert：格式转换 + 缩放 ═══════════════════

async function cmdConvert() {
  const input = rest[0];
  const out = getOption(["-o", "--output"]);
  if (!input || !out) usage();
  const sizes = getSizes();
  const ext = extname(out).toLowerCase();
  const isIcoInput = extname(input).toLowerCase() === ".ico";

  let base;
  if (isIcoInput) {
    base = await icoToPng(input, sizes[0]); // 输入是 ICO：先取指定尺寸（或最大）解码
  } else {
    base = await sharp(input, { density: 300 })
      .resize(sizes[0] || null, sizes[0] || null)
      .png()
      .toBuffer();
  }

  if (ext === ".ico") {
    const list = sizes.length ? sizes : [16, 32, 48, 64, 256];
    const entries = [];
    for (const s of list) {
      const png = await sharp(base).resize(s, s).png().toBuffer();
      entries.push({ size: s, data: png });
    }
    writeFileSync(out, buildIco(entries));
    console.log(`[convert] ✓ ${input} -> ${out} (${list.join("/")})`);
  } else {
    await sharp(base).toFile(out);
    console.log(`[convert] ✓ ${input} -> ${out}${sizes.length ? ` (${sizes[0]}px)` : ""}`);
  }
}

// ═══════════════════ extract：解析 PE 提取 exe 全部尺寸图标 ═══════════════════

function rvaToOffset(buf, rva, sections) {
  for (const s of sections) {
    if (rva >= s.va && rva < s.va + s.virtualSize) {
      return rva - s.va + s.rawPtr;
    }
  }
  return null;
}

function parsePe(buf) {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) {
    throw new Error("不是有效的 PE 文件（缺少 MZ 头）");
  }
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.toString("ascii", peOff, peOff + 4) !== "PE\u0000\u0000") {
    throw new Error("不是有效的 PE 文件（缺少 PE 签名）");
  }
  const coffOff = peOff + 4;
  const numSections = buf.readUInt16LE(coffOff + 2);
  const optSize = buf.readUInt16LE(coffOff + 16);
  const is64 = buf.readUInt16LE(coffOff + 20) === 0x20b;

  // DataDirectory[2]（资源目录）的位置
  const ddOff = coffOff + 20 + (is64 ? 112 : 96);
  const resRva = buf.readUInt32LE(ddOff + 16);
  const resSize = buf.readUInt32LE(ddOff + 20);
  if (!resRva) throw new Error("PE 中没有资源段");

  const sections = [];
  const sectionsOff = coffOff + 20 + optSize;
  for (let i = 0; i < numSections; i++) {
    const o = sectionsOff + i * 40;
    sections.push({
      va: buf.readUInt32LE(o + 12),
      virtualSize: buf.readUInt32LE(o + 8),
      rawSize: buf.readUInt32LE(o + 16),
      rawPtr: buf.readUInt32LE(o + 20),
    });
  }
  const toOff = (rva) => rvaToOffset(buf, rva, sections);
  return { buf, toOff, resRva, resSize };
}

function extractExeIcons(exePath) {
  const { buf, toOff, resRva } = parsePe(readFileSync(exePath));

  const readResourceDir = (rva) => {
    const off = toOff(rva);
    if (off === null) return [];
    const numNamed = buf.readUInt16LE(off + 12);
    const numId = buf.readUInt16LE(off + 14);
    const entries = [];
    for (let i = 0; i < numNamed + numId; i++) {
      const eo = off + 16 + i * 8;
      const id = buf.readUInt32LE(eo);
      const child = buf.readUInt32LE(eo + 4);
      // OffsetToData 是相对资源节基址的偏移
      entries.push({
        id,
        isDir: (child & 0x80000000) !== 0,
        rva: resRva + (child & 0x7fffffff),
      });
    }
    return entries;
  };

  const readDataEntry = (rva) => {
    const off = toOff(rva);
    if (off === null) return null;
    const dataRva = buf.readUInt32LE(off);
    const size = buf.readUInt32LE(off + 4);
    const dataOff = toOff(dataRva);
    if (dataOff === null) return null;
    return buf.subarray(dataOff, dataOff + size);
  };

  // 沿目录向下找到第一个数据（处理命名/语言子目录）
  const leafData = (entry) => {
    if (!entry.isDir) return readDataEntry(entry.rva);
    for (const c of readResourceDir(entry.rva)) {
      if (!c.isDir) {
        const d = readDataEntry(c.rva);
        if (d) return d;
      }
      for (const s of readResourceDir(c.rva)) {
        if (!s.isDir) {
          const d = readDataEntry(s.rva);
          if (d) return d;
        }
      }
    }
    return null;
  };

  const assembleIco = (groupData, icons) => {
    // 部分 exe（如向日葵）的 RT_GROUP_ICON 声称的条目数超过实际数据长度，
    // 以可容纳的条目数为准，避免越界。
    const count = Math.min(groupData.readUInt16LE(4), Math.floor((groupData.length - 6) / 14));
    const items = [];
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 14;
      items.push({
        width: groupData.readUInt8(o) || 256,
        height: groupData.readUInt8(o + 1) || 256,
        planes: groupData.readUInt16LE(o + 4),
        bitCount: groupData.readUInt16LE(o + 6),
        resId: groupData.readUInt16LE(o + 12),
      });
    }
    const dirs = [];
    const datas = [];
    let offset = 6 + 16 * count;
    for (const it of items) {
      const data = icons.get(it.resId);
      if (!data) continue;
      const d = Buffer.alloc(16);
      d.writeUInt8(it.width >= 256 ? 0 : it.width, 0);
      d.writeUInt8(it.height >= 256 ? 0 : it.height, 1);
      d.writeUInt8(0, 2);
      d.writeUInt16LE(it.planes, 4);
      d.writeUInt16LE(it.bitCount, 6);
      d.writeUInt32LE(data.length, 8);
      d.writeUInt32LE(offset, 12);
      dirs.push(d);
      datas.push(data);
      offset += data.length;
    }
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(dirs.length, 4);
    return Buffer.concat([header, ...dirs, ...datas]);
  };

  const level1 = readResourceDir(resRva);
  const groupType = level1.find((e) => e.id === 14); // RT_GROUP_ICON
  const iconType = level1.find((e) => e.id === 3); // RT_ICON
  if (!groupType || !iconType) throw new Error("该 exe 的资源段中没有图标（RT_GROUP_ICON/RT_ICON）");

  // RT_ICON：ID -> 原始图像数据
  const icons = new Map();
  for (const e of readResourceDir(iconType.rva)) {
    const d = leafData(e);
    if (d) icons.set(e.id, Buffer.from(d));
  }

  // 每个 RT_GROUP_ICON 组装一个多尺寸 ICO（通常是 1 个主图标组）
  const result = [];
  for (const g of readResourceDir(groupType.rva)) {
    const gd = leafData(g);
    if (gd) result.push(assembleIco(gd, icons));
  }
  return result;
}

async function cmdExtract() {
  const input = rest[0];
  if (!input) usage();
  const out = getOption(["-o", "--output"]);
  const wantPng = rest.includes("--png");
  const sizes = getSizes();

  const icos = extractExeIcons(input);
  if (icos.length === 0) throw new Error("未从该 exe 提取到图标");
  const target = out || join(dirname(input), basename(input, extname(input)) + ".ico");
  writeFileSync(target, icos[0]);
  console.log(`[extract] ✓ ${input} -> ${target}（${icos.length} 个图标组，已取第 1 组）`);

  if (wantPng) {
    const pngOut = target.replace(/\.ico$/i, ".png");
    const size = sizes[0];
    const buf = await icoToPng(target, size);
    writeFileSync(pngOut, buf);
    console.log(`[extract] ✓ PNG: ${pngOut}${size ? ` (${size}px)` : ""}`);
  }
}

// ═══════════════════ 入口 ═══════════════════

try {
  if (cmd === "convert") await cmdConvert();
  else if (cmd === "extract") await cmdExtract();
  else usage();
} catch (err) {
  console.error(`[error] ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
