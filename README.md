# 绘画 1.1.3

绘画（huihua）是一个 ComfyUI 的 Android 客户端：在手机上写提示词、调参数、看实时进度，把出图的算力留给你的 ComfyUI 服务器。

连接方式只有一种：**填写 ComfyUI 的地址**。不需要 PC 伴侣端、不需要配对文件、不需要证书导入。

## 特性

- **直连 ComfyUI**：输入 `http://` 或 `https://` 的 ComfyUI 地址即可，走 ComfyUI 原生 `/api/*` 接口。
- **实时进度**：轮询队列与历史，显示每一步的进度、预览图和耗时。
- **提示词助手**：Danbooru 标签联想、权重编辑、中英互译、本地词库搜索。
- **提示词独立成页**：底部导航自带「提示词」按钮。在「设置 → 生成 API」里填入任意 OpenAI 兼容接口（OpenAI / DeepSeek / Ollama / SiliconFlow 或自建），写一句描述就能直接出标签，结果一键复制，或一键填入工坊的正 / 负向提示词。
- **注入模板可查看可改**：每次请求真正发给 API 的 system 指令可以展开查看、就地修改、保存到本机，编辑区实时预览 `system:` 与 `user:` 两段实际内容。
- **skill 模板**：把带 `SKILL.md` + `data/*.csv` 的 skill 文件夹拖进设置页，CSV 的第一列自动变成可选参数，模板会被注入到生成提示词的系统提示里。
- **可视化工作流**：导入 ComfyUI 的 API 格式 JSON，用一张从上到下的紧凑流水线卡片看节点，参数字段直接改；保存到本机的工作流库随时再载入。
- **占位符联动**：模型 / 提示词 / 尺寸 / 采样器 / 种子等参数可以换成 `{{prompt}}`、`{{sampler}}` 这样的占位符，生成时自动用工坊设置里的值替换。被绑定的字段在可视化视图里可以直接编辑，改完立刻回写到工坊。
- **服务器资源**：连上服务器后直接读出可用的模型、文本编码器、VAE 与 LoRA，并标出当前工作流正在用的那一个。
- **术语表**：离线 Danbooru 标签分类，中英对照，可按分类浏览与搜索。
- **作品集**：从服务器历史读取输出图，支持收藏、批量下载到本机、放大查看、复用参数。
- **应用内更新**：启动时自动检查 GitHub Release，弹窗展示新版本号与更新内容，一键下载安装；可在设置里关闭自动检查。
- **三种语言**：简体中文（默认）、English、Français。
- **纯白外观**：默认浅色纯白主题，圆角与留白，移动端优先。

## 下载

已编译的安装包在 Releases 页：

| 版本 | 架构 | 大小 | 链接 |
| --- | --- | --- | --- |
| 1.1.3 | arm64-v8a | 73.6 MB | [huihua-1.1.3-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.3/huihua-1.1.3-arm64.apk) |
| 1.1.2 | arm64-v8a | 73.6 MB | [huihua-1.1.2-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.2/huihua-1.1.2-arm64.apk) |
| 1.1.1 | arm64-v8a | 73.6 MB | [huihua-1.1.1-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.1/huihua-1.1.1-arm64.apk) |
| 1.1.0 | arm64-v8a | 73.6 MB | [huihua-1.1.0-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.0/huihua-1.1.0-arm64.apk) |
| 1.0.0 | arm64-v8a | 71.0 MB | [huihua-1.0.0-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.0.0/huihua-1.0.0-arm64.apk) |

```bash
adb install huihua-1.1.3-arm64.apk
```

安装包使用本地自签名证书（`CN=HuiHua Local Build`），首次安装需在系统里允许「安装未知来源应用」。1.0.0 / 1.1.0 / 1.1.1 / 1.1.2 / 1.1.3 使用同一签名证书，可以直接覆盖升级。

## 更新内容

### 1.1.3

- 工坊只保留三块：API 工作流、文字成就图像、实时预览，从上到下一路走完。
- 删除自动模式：不再有「自动 / Workflow API」切换，也不再维护两套参数；生成一律走导入的工作流。
- 可视化视图里被占位符绑定的字段改成可编辑输入框，改「正向提示词」就等于改工坊里的提示词，同一份数据。
- 设置面板里的自动参数整块移除，预设只记录工作流。

### 1.1.2

- 底部导航新增「提示词」页：独立输入框，写一句描述就能让配好的 AI 接口直接返回 Danbooru 标签。
- 生成结果支持一键复制（带失败降级），并保留最近 30 条历史，可单条删除或整清空。
- 结果可直接「填入工坊正向提示词」或「填入负向提示词」，点完自动跳回工坊。
- 新增「查看 / 修改注入模板」：能看到每次请求真正发给 API 的 system 指令，可编辑并保存到本机，没选模板时改的是全局默认指令。
- 编辑区实时预览 `system:` 与 `user:` 两段实际发送内容，并带「填入默认指令」「恢复默认」。
- 修正作品集日期：历史记录没有时间戳时不再显示 1970/1/1，改为显示所在文件夹（空文件夹显示「输出」）。
- 提示词页与工作流占位符共用同一份模板存储，导入的 skill 模板可以直接选。

### 1.1.1

- 工作流可视化改成从上到下的紧凑流水线：节点卡片按依赖顺序竖排，手机上不再需要缩放拖拽也能看清。
- 新增占位符：模型、正向/负向提示词、VAE、步数、CFG、宽高、种子、批量、采样器、调度器都能换成 `{{key}}`，点字段右上角的 chip 选择绑定，生成前自动替换成自动设置里的值。
- 新增「联动到自动设置」：把工作流里当前的模型、尺寸、采样器、步数等真实值反向写回自动模式，导入别人的工作流后不用再手抄参数。
- 新增工作流库：编辑后的 API 工作流可以命名保存到本机，随时重新载入，也能导出 JSON。
- 提示词助手新增「直接生成」：一个输入框写描述，输出一段纯提示词，并带一键复制（复制失败时自动降级）。
- 工坊的实时预览会跟随工作流里的 PreviewImage / SaveImage 节点显示最新出图。
- 设置里关闭了「安全」板块；界面文案与分组进一步统一到纯白风格。

### 1.1.0

- 新增「生成 API」设置：任意 OpenAI 兼容接口，支持获取模型列表、连通性测试、温度调节，密钥只保存在本机。
- 新增 skill 模板导入：读取 `SKILL.md` 与 `data/*.csv`，生成可选的参数下拉，最多 100 个模板。
- 新增可视化工作流画布：节点卡片、连线、缩放，模型 / 提示词 / 尺寸 / 采样器都能就地修改，提示词可直接打开编辑器。
- 新增「服务器资源」面板：模型、文本编码器、VAE、LoRA 一览，标出工作流当前引用的文件和缺失项。
- 新增应用内更新：自动检测新版本，弹窗显示版本号、大小与更新说明，可跳转完整发布页；设置里可关闭自动检查。
- 优化：设置页分组重排，工作流工具栏、发布说明、资源列表三套样式统一到纯白风格。

### 1.0.0

- 首个版本：直连 ComfyUI 服务器地址，无需 PC 配对；简体中文界面；纯白默认外观；arm64-v8a 单架构 APK。

## 运行环境

- ComfyUI 服务器地址（本机或局域网、也可公网），例如 `http://192.168.1.10:8188`
- Android 10（API 29）及以上
- 服务器需允许来自手机的访问；公网使用时建议置于反向代理与鉴权之后

## 构建

前端：

```bash
npm install
npm run build      # tsc -b && vite build
```

Android（Tauri 2）：

```bash
npm run tauri android build
```

Rust 侧需要 `aarch64-linux-android` 目标与 Android NDK；Android SDK 通过 `src-tauri/gen/android/local.properties` 的 `sdk.dir` 指定。仓库的 `scripts/build-android.ps1` 是 Windows 下的构建脚本示例。

发布新版本时，把 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 与 `src-tauri/gen/android/app/tauri.properties`（`versionName` / `versionCode`）一起改版本号，打 `vX.Y.Z` tag，Release 附件必须命名为 `huihua-X.Y.Z-arm64.apk`，附带说明会显示在应用的更新弹窗里。

## 目录

```
src/                  React 19 + TypeScript 界面
  locales/            界面词典（fr 键 → en / zh-CN）
  data/               离线标签索引与术语表
src-tauri/            Rust 后端（HTTP 传输、LLM 调用、生物识别锁、保存图片）
  src/llm.rs          OpenAI 兼容接口客户端
  gen/android/        Android 工程
assets/               品牌与欢迎页素材
scripts/              构建与素材脚本
tests/                Playwright 端到端用例
```

## 技术栈

Tauri 2 · React 19 · TypeScript 5.9 · Vite 8 · Rust（reqwest）· Kotlin · Vitest

## 许可

界面文案与素材来自 ComfyPocket（Mochi）项目，按原项目许可使用。
