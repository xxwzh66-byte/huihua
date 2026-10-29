# 绘画 1.1

绘画（huihua）是一个 ComfyUI 的 Android 客户端：在手机上写提示词、调参数、看实时进度，把出图的算力留给你的 ComfyUI 服务器。

连接方式只有一种：**填写 ComfyUI 的地址**。不需要 PC 伴侣端、不需要配对文件、不需要证书导入。

## 特性

- **直连 ComfyUI**：输入 `http://` 或 `https://` 的 ComfyUI 地址即可，走 ComfyUI 原生 `/api/*` 接口。
- **实时进度**：轮询队列与历史，显示每一步的进度、预览图和耗时。
- **提示词助手**：Danbooru 标签联想、权重编辑、中英互译、本地词库搜索。
- **AI 生成提示词**：在「设置 → 生成 API」里填入任意 OpenAI 兼容接口（OpenAI / DeepSeek / Ollama / SiliconFlow 或自建），描述一句话即可生成待确认的标签块。
- **skill 模板**：把带 `SKILL.md` + `data/*.csv` 的 skill 文件夹拖进设置页，CSV 的第一列自动变成可选参数，模板会被注入到生成提示词的系统提示里。
- **可视化工作流**：导入 ComfyUI 的 API 格式 JSON，用卡片式画布改节点参数（模型、提示词、尺寸、采样器），也可以切回 JSON 直接编辑。
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
| 1.1.0 | arm64-v8a | 73.6 MB | [huihua-1.1.0-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.1.0/huihua-1.1.0-arm64.apk) |
| 1.0.0 | arm64-v8a | 71.0 MB | [huihua-1.0.0-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.0.0/huihua-1.0.0-arm64.apk) |

```bash
adb install huihua-1.1.0-arm64.apk
```

安装包使用本地自签名证书（`CN=HuiHua Local Build`），首次安装需在系统里允许「安装未知来源应用」。1.0.0 与 1.1.0 使用同一签名证书，可以直接覆盖升级。

## 更新内容

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
