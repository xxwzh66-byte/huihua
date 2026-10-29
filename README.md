# 绘画 1.0

绘画（huihua）是一个 ComfyUI 的 Android 客户端：在手机上写提示词、调参数、看实时进度，把出图的算力留给你的 ComfyUI 服务器。

连接方式只有一种：**填写 ComfyUI 的地址**。不需要 PC 伴侣端、不需要配对文件、不需要证书导入。

## 特性

- **直连 ComfyUI**：输入 `http://` 或 `https://` 的 ComfyUI 地址即可，走 ComfyUI 原生 `/api/*` 接口。
- **实时进度**：轮询队列与历史，显示每一步的进度、预览图和耗时。
- **提示词助手**：Danbooru 标签联想、权重编辑、中英互译、本地词库搜索。
- **术语表**：离线 Danbooru 标签分类，中英对照，可按分类浏览与搜索。
- **作品集**：从服务器历史读取输出图，支持收藏、批量下载到本机、放大查看、复用参数。
- **三种语言**：简体中文（默认）、English、Français。
- **纯白外观**：默认浅色纯白主题，圆角与留白，移动端优先。

## 下载

已编译的安装包在 Releases 页：

| 版本 | 架构 | 大小 | 链接 |
| --- | --- | --- | --- |
| 1.0.0 | arm64-v8a | 71.0 MB | [huihua-1.0.0-arm64.apk](https://github.com/xxwzh66-byte/huihua/releases/download/v1.0.0/huihua-1.0.0-arm64.apk) |

```bash
adb install huihua-1.0.0-arm64.apk
```

安装包使用本地自签名证书（`CN=HuiHua Local Build`），首次安装需在系统里允许「安装未知来源应用」。

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

## 目录

```
src/                  React 19 + TypeScript 界面
  locales/            界面词典（fr 键 → en / zh-CN）
  data/               离线标签索引与术语表
src-tauri/            Rust 后端（HTTP 传输、生物识别锁、保存图片）
  gen/android/        Android 工程
assets/               品牌与欢迎页素材
scripts/              构建与素材脚本
tests/                Playwright 端到端用例
```

## 技术栈

Tauri 2 · React 19 · TypeScript 5.9 · Vite 8 · Rust（reqwest）· Vitest

## 许可

界面文案与素材来自 ComfyPocket（Mochi）项目，按原项目许可使用。
