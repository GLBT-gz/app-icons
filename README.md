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
