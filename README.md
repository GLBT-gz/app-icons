# app-icons

软件图标库。独立于代码仓库，供各项目通过 app-kit 的 `createViteConfig`（`extraPublicDirs` 选项）接入：构建时复制到 `dist/<前缀>`，开发时由 dev server 中间件提供静态服务。

## 目录结构

```
app-icons/
├── README.md          本规范
├── index.json         图标清单（名称/分类/格式，供前端程序化读取）
└── icons/             图标目录，接入后前端路径 = /icons/<分类>/<文件名>
    ├── browsers/      浏览器
    ├── dev/           开发工具
    ├── media/         影音播放
    ├── chat/          通讯社交
    ├── office/        办公效率
    ├── tools/         实用工具
    ├── network/       网络工具
    ├── system/        系统工具
    └── archived/      历史遗留（不再维护，仅归档）
```

## 命名规范

- 文件名：全小写 + 连字符，如 `visual-studio-code.png`
- 分类归属：按用途放入对应子目录，不确定的放 `tools/`
- 禁止重名：同一软件只保留一个图标，新版本替换旧文件（保留 git 历史可追溯）

## 格式规范

- 推荐 PNG（透明背景），源图建议 128x128，前端可缩放
- 允许 SVG（矢量、可缩放场景）与 ICO（历史遗留、Windows 系统图标）
- 新收集的图标优先转 PNG；无法转的保持原格式即可

## 添加图标流程

1. 下载图标（官方来源或高质量图标站）
2. 按命名规范改名，放入对应分类目录
3. `index.json` 登记（名称、分类、文件名）
4. 提交推送

## 引用方式

各项目在 `vite.config.ts` 中通过 `extraPublicDirs` 接入本仓库的 `icons/` 目录（`src` 相对项目根目录，`prefix` 为访问前缀）：

```ts
export default createViteConfig({
  port: 5180,
  extraPublicDirs: [{ src: "../../../app-icons/icons", prefix: "/icons" }],
});
```

前端引用路径（保持 `/icons/` 前缀）：

```
/icons/browsers/chrome.png
/icons/dev/visual-studio-code.png
```

## 图标处理工具

仓库内置 `scripts/icon-tool.mjs`（依赖 `sharp`），支持格式转换、尺寸调整、以及从 exe 提取全部尺寸图标（纯 Node 解析 PE 资源节，无额外系统依赖）。先安装依赖：

```bash
pnpm install
```

### convert：格式转换 + 尺寸调整

格式由输出扩展名决定（png / jpg / webp / ico）。

```bash
# SVG 转 PNG，宽高 128
pnpm icons:convert icons/browsers/edge.svg -o out/edge.png -s 128

# PNG 转多分辨率 ICO（16/32/48/256）
pnpm icons:convert icons/dev/vscode.svg -o out/vscode.ico -s 16,32,48,256

# ICO 输入同样支持（取指定尺寸解码后输出）
pnpm icons:convert out/vscode.ico -o out/vscode-128.png -s 128
```

### extract：从 exe 提取图标

解析 PE 资源段（RT_GROUP_ICON / RT_ICON），提取 exe 内全部尺寸图标为多分辨率 `.ico`，可选输出 PNG。

```bash
# 提取全部尺寸为 ICO（默认输出到 exe 同目录）
pnpm icons:extract C:\Path\to\app.exe

# 指定输出 + 转 256px PNG
pnpm icons:extract C:\Path\to\app.exe -o out/app.ico --png --size 256
```

说明：

- exe 内图标可能是 PNG 或 DIB 存储，工具两者都能处理；DIB 支持 32/24/8 bpp（含 AND mask 透明通道）
- Win11 的 UWP stub 类 exe（如 System32 的 notepad.exe）资源里可能没有图标，需提取 Store 包内真实 exe 或其他程序
- 提取后建议用 `convert` 转 PNG 并按命名规范放入分类目录
