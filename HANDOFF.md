# 绘画（huihua）接手文档

> 写给下一个接手这个项目的人（或未来的自己）。读完这份能直接改代码、跑测试、出包、发版。
> 当前版本：**1.17.0**（versionCode `11700`），分支 `main`，远端 `https://github.com/xxwzh66-byte/huihua.git`。
> 仓库**没有本地 git tag**，所有 Release 都用 GitHub API 创建（原因见「坑」一节）。
> 端到端出图流程另见 **[docs/生成图片指南.md](docs/生成图片指南.md)**（面向用户 + 开发者两条线）。

---

## 1. 这是什么

一个 ComfyUI 的 Android 客户端（Tauri 2 + React 19），中文优先，界面纯白。

核心主张：**手机上只做「写提示词 / 调参数 / 看进度」，出图的算力全留在自己的 ComfyUI 服务器上。**

连接方式只有一种：填 ComfyUI 地址（`http://` 或 `https://`）。没有 PC 伴侣端、没有配对文件、没有证书导入——这些是 v0.x 的遗留，v1.0 全部删掉了。想改回那种架构前先读第 9 节「历史决策」。

### 功能面

| 页 | 干什么 |
| --- | --- |
| 工坊 `create` | 导入 API 工作流 → 改参数 → 写提示词 → 实时预览 → 生成 |
| 提示词 `prompt` | 独立页，接任意 OpenAI 兼容 API，一句描述直接出 Danbooru 标签，可复制 / 填入工坊 |
| 图库 `gallery` | 服务器输出图，收藏、删除（本地隐藏）、批量下载 |
| 素材库 `glossary`（v1.15 改名，id 未变） | 服装 / 场景 / 姿势 / 表情四货架，标签来自 Comfyui-Anima-Wardrobe（8048 条，离线） |
| 设置 `connect` | 服务器地址、生成 API、服务器资源、语言 / 外观 / 更新 |

---

## 2. 30 秒上手

```powershell
cd D:\demo\Paint-v1
npm install
npm run dev                 # http://127.0.0.1:1420
npx tsc -b                  # 类型检查（必须无输出）
npx vitest run              # 12 文件 / 55 测试
npx vite build              # 前端产物到 dist/
```

注意 `npm run dev` 走的是 Vite；**没有 Tauri 宿主时 `native()` 会 POST `/__native`**（见 `src/api.ts:63`），所以纯浏览器里只能看 UI 骨架，连不了 ComfyUI。真实联调要跑 `npm run tauri android dev`（需要第 5 节的环境）。

---

## 3. 目录与文件地图

### 3.1 前端 `src/`（97 个文件）

**入口**
- `src/main.tsx` — 挂载 `AppLock > App`，CSS 引入顺序：`styles.css → experience.css → refinements.css → polish.css → mochi.css → mobile.css`。**顺序有意义**，后面的覆盖前面的。
- `src/App.tsx`（1589 行，最大的文件）— 全局状态 + 各页渲染 + 生成流程。

**App.tsx 关键锚点**（改代码前先看这些行号，会随编辑漂移，按函数名 grep）

| 行 | 内容 |
| --- | --- |
| 61-63 | `lazy()` 懒加载 Glossary / Viewer / PromptStudio |
| 98-102 | `loadSet` / `saveSet` — 按服务器隔离的 localStorage Set |
| 108-124 | 引导流程状态；监听 `paint-setup` 事件重开引导 |
| 141-187 | 全部 UI/数据状态 |
| 210 | `hydrate(url, initial, version)` — 拉 `/api/system_stats` + `/api/object_info` |
| 295 | `connect(url)` — `native("connect_server")` 后 hydrate |
| 317 | `disconnect(already)` |
| 322-390 | **`generate()`** — 唯一生成入口 |
| 391 | `cancel()` |
| 417 | `loadGallery()` |
| 483 | `favorite(item, value)` |
| 578 | `reuse(item, url, version)` |
| 609 | `importFile(file, "image" \| "workflow")` |
| 654 | `views(items)` — GalleryItem → ViewItem |
| 707 | `renderPage(tab, active)` — 所有页面都从这里出 |
| 830-919 | 工坊：`.studio-pc`(830) / `.configuration-slot`(855) / `#studio-workflow`(919) |
| 954 | `<WorkflowShelf>` |
| 1034 | `<PromptSection>` |
| 1069 | `#studio-render` 实时预览 |
| 1209 | `.generate-bar` |
| 1455 | 底部导航数组（**加页面要同时改这里和 PageNavigation.ts**） |

**生成流程（最该先读懂的一条链）**

```
PromptSection 写提示词 → settings.positive
        ↓
generate():
  if (!custom) throw "Importez et validez un workflow API."
  workflow = resolveGraph(custom, settings)      // ① 占位符替换
  checkWorkflow(workflow, info)                  // ② 节点存在性校验
  api("/api/prompt", { prompt: workflow, client_id, extra_data })   // ③ 提交
        ↓
useGenerationSession 轮询 /api/queue + /api/history/{id}
        ↓
results / preview → #studio-render
```

- ① `resolveGraph` 在 `src/workflowBindings.ts`。**任何新的发送路径都必须先过它**，否则工作流里会残留 `{{prompt}}` 字面量，ComfyUI 那边直接报错或出垃圾图。
- ② `checkWorkflow` 在 `src/workflow.ts`，比对 `/api/object_info` 的节点清单，缺节点会抛 `Nœuds absents du PC : …`。
- ③ `client_id` 来自 `src/sessionStorage.ts` 的 `getClientId()`（localStorage `clientId` + `crypto.randomUUID()`）。

**工作流三件套**

- `src/workflow.ts` — `Settings` 类型 + 默认值 + `buildWorkflow`（**v1.1.3 后已无调用方**，保留是因为 `checkWorkflow` / `parseWorkflow` / `normalizeSettings` 还在用）+ `MAX_SEED`。
- `src/workflowGraph.ts`（286 行）— 图操作原语：`nodeFields` / `setField` / `coerceField` / `nodeTitle` / `isPromptField` / `isLink`。字段 kind ∈ `link | select | number | text | longtext | toggle | json`。`layoutGraph` 已无调用方（旧绝对定位画布留下的）。
- `src/workflowBindings.ts`（301 行）— **占位符层，v1.2+ 扩展注入逻辑就改这里**：
  - 语法 `{{key}}`，整值 `WHOLE = /^\s*\{\{\s*([a-z_]+)\s*\}\}\s*$/`，文本内 `ANY`（可混写）。
  - `BINDINGS` 13 项：`prompt / negative / model / vae / steps / cfg / width / height / seed / batch / clip_skip / sampler / scheduler`，每项有 `value(settings)` 和可选的 `apply(settings, raw)`（1.1.3 加的，让画布里的可编辑字段能反向写回设置）。
  - `resolveGraph(graph, settings)` — 发送前替换，整值占位符保留原始类型（number 仍是 number）。
  - `autoBind(graph)` — 导入时把节点字段改写成占位符。**这是「正面提示词如何注入」的答案**：先从匹配 `/sampler/i` 的节点读 `positive`/`negative` 的 link 得到正负集合，再把第一个非负向的 encode 节点写成 `{{prompt}}`，其余写 `{{negative}}`，然后按 class_type 正则写死其余参数。

**其它核心模块**

| 文件 | 职责 |
| --- | --- |
| `api.ts` | `native()` 唯一原生通道 / `api()` HTTP 封装 / `imageUrl` / `galleryPath` / `historyImages` / `choices` / `modelChoices` |
| `useGenerationSession.ts`（208 行） | 轮询队列与历史，产出 `queue/jobs/progress/phase/preview/results` |
| `PageNavigation.ts`（220 行） | 页面滑动切换；`pages` 数组在这；`usePageNavigation()` 返回 `{tab,setTab,setInitialTab,handlers,trackRef}` |
| `i18n.ts`（39 行） | `Locale = "fr" \| "en" \| "zh-CN"`，**默认 `zh-CN`**，key `mochi-language`；`t(source, values)` 替换 `{0}` |
| `WorkflowCanvas.tsx`（约 470 行） | **v1.14 重写**：图标节点 + 贝塞尔连线，点节点才展开参数面板（`.canvas-detail`）；缩放条中间是「适应宽度」按钮 |
| `WorkflowShelf.tsx` | 本地工作流库的 UI 外壳：`select.shelf-picker`（选择）+ 命名输入 + 保存/导出 + 弹窗列表。名称与 id 状态由 `App.tsx` 持有（`workflowName` / `workflowId`） |
| `workflowGraph.ts` | `nodeFields` / `setField` / `coerceField` / `nodeTitle` + `layoutGraph`（v1.14 重新被画布调用，按 depth 分列输出 `nodes`/`edges`） |
| `workflowLibrary.ts`（97 行） | 库的存储层，key `workflow-library-v1`，上限 60 |
| `PromptSection.tsx`（约 80 行） | 工坊的「文字成就图像」卡，打开 `PromptEditor`；「打开素材库」按钮 |
| `PromptEditor.tsx`（约 387 行） | 提示词编辑器。**v1.15 起只留**：文本/区块、翻译、历史、可复用区块、权重、撤销重做（语音助手、自动补全、Danbooru 联想、检查页全部移除） |
| `Glossary.tsx`（约 290 行，组件名 `Wardrobe`） | **v1.15 重写为素材库**：服装/场景/姿势/表情四货架，读 `src/data/wardrobe.json`。v1.16 加 `onDescribe`：选中整套后可「发送到画面描述」 |
| `ImageDetails.tsx`（约 180 行） | **v1.16 新增**：读图片的 `comfy_pocket` 元数据，列出正/负提示词与全部参数，两段各带复制。由 `Viewer.tsx` 的第五个动作按钮打开 |
| `imageBytes.ts` | `dataUrlBytes(url)`：base64 data URL → `Uint8Array` |
| `thumbnails.ts` | **v1.16 新增**：`createImageBitmap` + `OffscreenCanvas` 把网格图缩到长边 256（webp q=0.72），独立 8 MB 缓存 |
| `comfySocket.ts`（约 210 行） | **v1.16 新增**：直连 ComfyUI `/ws?clientId=`，解析实时进度、执行节点与二进制预览帧，断线指数退避重连 |
| `PromptStudio.tsx`（459 行） | 独立「提示词」页 |
| `InstructionEditor.tsx`（174 行） | 「注入模板可查看可修改」实体 |
| `promptTemplates.ts`（271 行） | 模板 CRUD + skill 文件夹导入 + `defaultSystem()` |
| `llm.ts` / `llmAdapter.ts` / `promptOptimizer.ts` | OpenAI 兼容调用 / 适配器 / 提案校验 |
| `serverInventory.ts`（108 行） | 从 `object_info` 里抽模型 / 文本编码器 / VAE / LoRA |
| `LlmSettings.tsx`（316 行） | 生成 API 设置块 |
| `ServerResources.tsx`（126 行） | 服务器资源面板 |
| `Connections.tsx`（369 行） | 设置页外壳，4 个 `<details class="settings-group">` |
| `AppUpdater.tsx`（320 行） | 应用内更新 + 发布说明渲染 + `mochi-update-auto` 开关 |
| `GalleryGrid.tsx` / `Viewer.tsx` / `Picture.tsx` | 图库三件套 |
| `AppLock.tsx` | 生物识别锁（`LockSettings` 已从设置页摘掉，但组件还在） |
| `presets.tsx` / `Presets.tsx` / `presetStore.ts` | 预设，`InferencePreset.mode` 保留 `"simple" \| "workflow"` 仅为兼容旧数据 |

**CSS**：`styles.css`(27K) `mochi.css`(38K) `experience.css`(18K) `mobile.css`(12K) 是主样式；其余是按需引入的局部样式（`llm-settings.css` / `server-resources.css` / `workflow-canvas.css` / `workflow-shelf.css` / `prompt-studio.css` / `prompt-section.css` / `settings-hub.css` …）。
设计变量在 `styles.css` 顶部：`--ink:#1b1b1b; --muted:#6d6d6d; --accent:#1b1b1b; --line:#e4e4e4; --panel:#ffffff;` + `--safe-top/--safe-bottom`（env insets）。**纯白风格靠这套 token，别引入新颜色。**

**i18n**：`src/locales/zh-CN.json` 与 `en.json` 各 **934 个键**，源码里的字符串是**法语原文**（历史原因），`t()` 拿法语原文当 key 查表。`src/testLocale.ts` 在单测里把 locale 钉在 `fr`，所以断言写的是法语串。

### 3.2 后端 `src-tauri/`

- `src/main.rs` — 10 行，调 `huihua_lib::run()`。
- `src/lib.rs`（9.3K）— 状态与命令注册。`AppState(Mutex<Option<Session>>, tokio::sync::Mutex<()>)`；配置写 `app_config_dir/server.json`（原子写 `server.tmp` + rename）。
- `src/transport.rs`（7.3K）— HTTP 层。**关键约束**：`request_url()` 只放行以 `/api/` 开头的路径，且拒绝 `\` 和 `#`；`normalize_url()` 允许 http/https、去掉末尾斜杠、支持反代子路径；`IMAGE_LIMIT = 64MB`、`JSON_LIMIT = 32MB`；redirect 策略 `none`；超时 120s / 连接 10s。
- `src/llm.rs`（12K）— OpenAI 兼容客户端，写 `app_config_dir/llm.json`，key 从不回传（只回 `has_key`）。
- `src/biometrics.rs` / `mobile_services.rs` / `translation.rs` — 锁、Kotlin 桥、翻译。

**已注册的 Tauri 命令**（`src-tauri/src/lib.rs:184-203`）

```
mobile_services::update_action / voice_action
llm::llm_get / llm_save / llm_models / llm_chat
translation::translate_text / set_app_language
lock_status / unlock / lock_session / set_biometric_lock / set_lock_options
restore / disconnect / connect_server / api / image / save_image
```

**Cargo feature 陷阱**：`src-tauri/Cargo.toml` 末尾的 `custom-protocol = ["tauri/custom-protocol"]` **生产构建必须开**。关掉后前端资源不会嵌进 `.so`，装到手机上就是白屏（1.0.0 踩过，见第 10 节）。

### 3.3 Android `src-tauri/pocket-plugin/android/…/fr/azk/pocket/`

- `PocketPlugin.kt`（13K）— `@Command` 入口，锁定时一律 reject `"Application locked"`。
- `AppUpdates.kt`（9.8K）— **应用内更新的全部逻辑**：
  - `REPO = "xxwzh66-byte/huihua"`，读 `releases?per_page=20`，只认 `v\d+\.\d+\.\d+` 且**非 draft 非 prerelease**。
  - asset 名必须精确等于 `huihua-${tag去掉v}-arm64.apk`，且 `browser_download_url` 必须等于 `https://github.com/$REPO/releases/download/$tag/$expected`。
  - `digest` 必须匹配 `[0-9a-f]{64}`（去掉 `sha256:` 前缀）；size 1..250,000,000。
  - `status()` 返回的 `release` 已带 `notes / title / published / page`。
  - `verify()` 校验 size + sha256 + 包名 + 更高 versionCode + versionName 匹配 + **签名证书一致**。
- `RemoteFiles.kt` / `UpdateProvider.kt` / `VoiceRecorder.kt` — 存图、FileProvider、录音。

---

## 4. 数据契约（localStorage）

改存储层前对一遍，避免和旧版本数据打架。

| key | 内容 | 位置 |
| --- | --- | --- |
| `settings` / `settings:<server>` | 工坊设置（`Settings`） | `useSettingsPersistence.ts`（300ms 防抖） |
| `clientId` | ComfyUI client_id | `sessionStorage.ts` |
| `mochi-language` | `fr` / `en` / `zh-CN` | `i18n.ts` |
| `onboarding-done` / `onboarding-step` | **v1.15 起不再读写**（引导步骤已删，残值无副作用） | — |
| `quick-menu` / `left-handed` / `auto-save` | 界面偏好 + **默认保存开关**（v1.14，默认 `true`） | `App.tsx:141-146` / `App.tsx` |
| `gallery-columns` | 2/3/4 | `App.tsx:162` |
| `favorites:<server>` / `removed:<server>` | 收藏 / 隐藏（**不是真删**） | `App.tsx:98-102` |
| `results:<server>` / `seed:<server>` / `tasks:<server>` | 上次结果 / 种子 / 队列 | `App.tsx` |
| `active` | 上次连的服务器 | `App.tsx:241` |
| `workflow-library-v1` | 工作流库（≤60） | `workflowLibrary.ts` |
| `prompt-templates-v1` | skill 模板（≤100） | `promptTemplates.ts` |
| `prompt-default-system-v1` | 全局默认 system 指令 | `promptTemplates.ts` |
| `prompt-studio-history-v1` | 提示词页历史（≤30） | `PromptStudio.tsx` |
| `prompt-history-v1` / `prompt-blocks-v1` | 编辑器历史 / 可复用块 | `promptLibrary.ts` |
| `mochi-voice-draft-v1` | 助手草稿（**v1.15 起无写入方**） | 原 `PromptAssistant.tsx` |
| `mochi-update-auto` / `mochi-update-check` | 自动检查更新开关 / 上次检查时间 | `AppUpdater.tsx` |
| `inference-presets-v1` | 预设 | `presetStore.ts` |
| `model-favorites-v1` | 模型收藏（**读写方 `StudioModels.tsx` / `ModelPicker.tsx` 都已是死代码，实际不再写入**） | `StudioModels.tsx` / `ModelPicker.tsx` |
| `autocomplete-enabled` / `biometric-auto-prompt` / `size-presets` | 杂项（`autocomplete-enabled` **v1.15 起无写方**） | 各处 |

---

## 5. 构建 Android APK（唯一可用的链路）

工具链全部在 `D:\demo\toolchain` 和 `D:\demo\android-sdk`，**不在系统 PATH**。

```
D:\demo\toolchain\
  rustup\   cargo\   mingw64\   jdk17\jdk-17.0.20.1+1\   android-ndk-r27c\
D:\demo\android-sdk\  (build-tools 34/35/36, platform-tools, platforms)
```

### 四步

```powershell
cd D:\demo\Paint-v1

# 1. Rust → arm64 .so（先按第 6.1 节 bump 版本号，否则 .so 里嵌的版本号是旧的）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File _build\cargo_android.ps1
#    期望：Compiling huihua v1.1.x / cargo exit=0

# 2. .so 拷进 jniLibs 并 strip
powershell.exe -NoProfile -ExecutionPolicy Bypass -File _build\copy_so.ps1
#    期望：libhuihua_lib.so ≈ 10,08x,xxx 字节

# 3. Gradle assembleRelease
powershell.exe -NoProfile -ExecutionPolicy Bypass -File _build\gradle_assemble.ps1
#    期望：BUILD SUCCESSFUL，app-release-unsigned.apk ≈ 77,11x,xxx 字节

# 4. 签名
D:\demo\android-sdk\build-tools\35.0.0\apksigner.bat sign `
  --ks _build\huihua-release.jks --ks-key-alias huihua `
  --ks-pass pass:huihua2026 --key-pass pass:huihua2026 `
  --out dist-apk\huihua-<VER>-arm64.apk `
  src-tauri\gen\android\app\build\outputs\apk\release\app-release-unsigned.apk
```

> **必须用 `powershell.exe -File` 启动脚本**，不能直接 `pwsh .\script.ps1`（裸 `pwsh` 不在 PATH，且这些脚本依赖 Windows PowerShell 的环境变量继承行为）。

### 签名身份（不要换！）

- keystore：`_build/huihua-release.jks`，**PKCS12**，storepass `huihua2026`，key alias `huihua`，keypass 同 storepass。
- 证书：`CN=HuiHua Local Build`，SHA-256 `9fe3dac1f8807221bb66b8526b24684caa952a014d1e3fb219b831f40432bf9f`。
- 1.0.0 / 1.1.0 / 1.1.1 / 1.1.2 / 1.1.3 **全部同一证书**，所以能原地覆盖升级。换 keystore = 用户必须卸载重装，别做。
- `*.jks` 在 `.gitignore` 里，**备份它**。
- 老别名 `comfypocket` + 密码 `mochi2026` 会报 `UnrecoverableKeyException ... BadPaddingException`，别试。

### 验证三件套

```powershell
D:\demo\android-sdk\build-tools\35.0.0\apksigner.bat verify --print-certs dist-apk\huihua-<VER>-arm64.apk
D:\demo\android-sdk\build-tools\35.0.0\aapt2.exe dump badging dist-apk\huihua-<VER>-arm64.apk
Get-FileHash dist-apk\huihua-<VER>-arm64.apk -Algorithm SHA256
```

`aapt2` 期望：`package='app.huihua.paint' versionCode='10<minor><patch>' versionName='1.1.x'`、`application-label:'绘画'`。

### 验证前端真的被嵌进去了（唯一可靠方法）

APK 里 `.so` 的文本是 **brotli 压缩**的，grep 不到中文 UI 文案。只能对比 dist 产物 hash：

```powershell
# 解出 .so，用 Latin-1 读（UTF-8 解码会抛错）
$so = "...\lib\arm64-v8a\libhuihua_lib.so"
$text = [System.IO.File]::ReadAllText($so, [System.Text.Encoding]::GetEncoding(28591))
$text.Contains("index-XXXXXXXX.js")   # 必须 True
```

`index-XXXX.js` / `index-XXXX.css` 的 hash 来自 `dist/assets/` 的实际文件名。**第一次构建出的 .so 常常含着上一次的 hash**（增量编译没重跑前端嵌入），对不上就重跑第 1、2、3 步。

### 不要用的脚本

`scripts/build-android.ps1` 是 v0.x 遗留：引用了 `libcomfy_pocket_lib.so`、`Mochi-*.apk`、alias `comfypocket`，跑不通。UI 上保留它只是为了不删历史文件，实际构建走 `_build/` 那四个脚本。

---

## 6. 发版流程（每次迭代都走一遍）

### 6.1 bump 四个地方

写一个 `_build/bump-<VER>.mjs`（照抄 `_build/bump-1.14.0.mjs`）：

```
package.json                        "version": "X.Y.Z"
src-tauri/tauri.conf.json           "version": "X.Y.Z"
src-tauri/Cargo.toml                version = "X.Y.Z"
src-tauri/gen/android/app/tauri.properties
    tauri.android.versionName=X.Y.Z
    tauri.android.versionCode=<10000 + minor*100 + patch>   # 1.1.3 → 10103；1.14.0 → 11400
```

versionCode 必须单调递增，否则 `AppUpdates.verify()` 会拒绝安装。注意 **1.14 走的是 minor=14**，所以 versionCode 是 `11400` 而不是 `10104`——规则里的 `minor` 是整段 minor 数字，不是它的个位数。

### 6.2 补 i18n 键

```powershell
node _build\find-missing-strings.mjs      # 扫 src/*.ts(x) 的 t()/tr() 字面量，列出缺的键
# 用 add-strings.mjs / add-v113-strings.mjs / add-v114-strings.mjs 的写法（表格 [source, zh, en]）补齐
node _build\v114-audit-strings.mjs         # 只核对某批 key 是否两个 locale 都有
node _build\find-missing-strings.mjs       # 期望 missing 0
```

`add-strings.mjs` 会 JSON 解析 → 加键 → 按 key 排序 → 2 空格缩进重写，两个 locale 同时改。中文源串的 zh 填 `""` 时回退成 source 本身。v1.14 起两个 locale 各 **950 键**。

### 6.3 测试 + 构建

```powershell
npx tsc -b          # 无输出
npx vitest run      # 12 files / 55 tests
npx vite build      # 记下 dist/assets/index-XXXX.js 和 .css 的 hash
```

### 6.4 出 APK（第 5 节），然后发布

写 `_build/publish-<VER>.cjs`（照抄 `publish-1.1.3.cjs`）：

1. `execSync('git credential fill', {input:"protocol=https\nhost=github.com\n\n"})` 拿 40 字符 PAT。
2. `GET /repos/xxwzh66-byte/huihua/releases/tags/v<VER>`；404 就 `POST /releases`（`tag_name` / `name: 绘画 v<VER>` / `body` / `draft:false`），否则 `PATCH`。
3. 删同名旧 asset，再 `POST https://uploads.github.com/repos/.../releases/{id}/assets?name=huihua-<VER>-arm64.apk`，`Content-Type: application/vnd.android.package-archive`。
4. 复查 `digest === "sha256:<你的 hash>"`。

发布说明写成 `_build/release-<VER>.md`：

- **不要**在正文开头写 `## 绘画 X.Y.Z`——弹窗里已经有 `h3 = 绘画 X.Y.Z` 和 `release.title`，会重复。
- 用 `# 小节标题` 和 `- 条目`；`AppUpdater.releaseLines()` 按 `#`→标题、`-`/`*`→条目解析，最多 160 行。

### 6.5 验证更新能被检测到

```powershell
node _build\updater-sim.cjs      # 复刻 AppUpdates.check()，对 live GitHub API 跑
```

期望：installed = 当前版本 → no update；installed = 任意旧版本 → 检出最新版 + url/sha256/page/notes 全对。

再跑 Playwright `_build/updatecheck.mjs` 看弹窗文案，`_build/togglecheck.mjs` 验设置里能关掉自动检查。

### 6.6 提交推送

```powershell
git add -A
git commit -m "feat(vX.Y.Z): ..."
node _build\push-retry.cjs        # 循环重试版 git push（github.com:443 常被阻断）
```

**github.com:443 打不通时**（2026-10-31 实测就是这种环境，只有 api.github.com 通）：放弃 `git push`，改用 Git Data API 发版——脚本已经把「本地改动 → blob → tree → commit → fast-forward main → tag + Release」全做完：

```powershell
$env:GITHUB_TOKEN = "ghp_xxx"     # repo scope 的 PAT，本机没存过
node _build\probe-upstream.cjs    # 只读：看上游 main 在哪、tag 是否已存在
node _build\diff-vs-upstream.cjs  # 只读：确认没有会覆盖上游改动的冲突项
node _build\publish-1.17.0.cjs --dry-run   # 打印将要提交的 23 个文件
node _build\publish-1.17.0.cjs             # 真发
```

顺带把 `README.md` 的标题、下载表、`adb install` 行、`### X.Y.Z` 更新内容节一起更新。

---

## 7. 测试

### 7.1 单测（vitest）

`vitest.config.ts`：`include: ["src/**/*.test.ts"]`，`setupFiles: ["src/testLocale.ts"]`（把 locale 钉在 `fr`，所以断言里是法语串）。

现有 14 个测试文件 / **68 个用例**，覆盖：`asyncPool` / `workflow` / `promptDocument` / `promptLibrary` / `promptWeights` / `promptRobustness` / `imageCache` / `metadata` / `importValidation` / `modelCompatibility` / `translation` / `experience` / `thumbnails`（v1.16）/ `comfySocket`（v1.16）。

**没有覆盖**：`workflowBindings`（占位符替换！）、`workflowGraph`、`workflowLibrary`、`promptTemplates`、`serverInventory`、`llm`。这几个是最该补单测的地方，尤其 `resolveGraph` / `autoBind`——它们是唯一决定「发出去的图对不对」的逻辑。

### 7.2 E2E（Playwright）——部分过期

`playwright.config.ts`：`testDir: "tests"`，端口 `PAINT_TEST_PORT || 14420`，`webServer: npm run dev`（`reuseExistingServer: false`，**跑之前先杀掉占用 14420 的进程**），viewport 390×844。

**v1.14 新增并通过的**：`tests/v114.spec.ts`（4 用例）+ `tests/v114-harness.tsx`（内联 7 节点 fixture，KSampler 的 `sampler_name`/`scheduler` 故意留空）。覆盖：图标节点与 9 条连线、未选中时无参数面板、点节点才展开 6 个可编辑字段 + 4 条 `.node-link`、空 select 的占位 option、缩放按钮、工作流命名保存与覆盖保存。

**v1.15 新增并通过的**：`tests/v115.spec.ts`（4 用例）。覆盖：新装直落工坊且无引导步骤、导航第五项文案、素材库四货架 + 搜索 + 选中写进提示词、编辑器只剩文本/区块/翻译/权重（无语音入口、无补全开关、无联想气泡）、导入工作流不改原字段。

**v1.16 新增并通过的**：`tests/v116.spec.ts`（2 用例）。覆盖：素材库选中整套 → 点「发送到画面描述」→ 落到提示词页的画面描述框；图库打开看图 → 「查看详细提示词」→ 弹层列出正/负提示词、模型、LoRA。**e2e 里的假 PNG 必须自己算 CRC32 并带 `IHDR`+`IDAT`**，只塞 `tEXt` 的图会让 `createImageBitmap` 解码失败，缩略图永远停在「加载中」、`.image-button` 不渲染。

**仍然过期的**：`tests/app.spec.ts`（25 处 `activate_profile` / `list_profiles` / `/bridge/*`，这些在 v1.0 就删了）、`tests/studio-settings.spec.ts`（断言「Reprendre la configuration」按钮，v1.14 已删除）、`tests/catalog.spec.ts`（import `../src/ModelImports`，该文件不存在）、`tests/onboarding.spec.ts`（**v1.15 起整页 Onboarding 已删，这个 spec 可以整份删掉**）。

v1.14 顺手修好的：`tests/connections.spec.ts:218` 的启动用例，原来断言 `dialog[name="Démarrage"]` + `.startup-splash`，现改为断言开屏不存在、锁屏 dialog 直接出现。另 3 条 `connections.spec.ts` 用例仍因为依赖已删除的 profile API 而红。

现在真正在用的验证方式是 `_build/` 下一堆手写 Playwright 脚本（`v114-shot.mjs` / `v114-debug.mjs` / `v113check.mjs` / `instructioncheck.mjs` …）。它们的共同套路见第 8 节。

---

## 8. Playwright 手动验证套路（`_build/*.mjs`）

想快速肉眼确认 UI 有没有崩，抄这套：

```js
// 关键 mock：native() 走的是 POST /__native {command, args} → {value}
await page.route("**/__native", async (route) => {
  const { command, args } = JSON.parse(route.request().postData() || "{}");
  const value = await answer(command, args);   // 按 command 分派
  await route.fulfill({ contentType: "application/json", body: JSON.stringify({ value }) });
});
```

必须 mock 的 command 与最小返回：

| command | 返回 |
| --- | --- |
| `lock_status` | `{supported:false, available:false, enabled:false, unlocked:true}` — 否则 `AppLock` 渲染锁屏 dialog，看起来就是白屏 |
| `restore` | `"http://127.0.0.1:8188"`（想直接进工坊）或 `null` |
| `api` + `path=/api/system_stats` | 必须含 `devices: []`（至少是数组），否则 `connect` 的 probe 失败 |
| `api` + `path=/api/object_info` | 必须含工作流用到的**每个**节点（含 `VAEDecode` / `SaveImage`），否则报 `PC 中缺失的节点：…` |
| `api` + `path=/api/queue` | `{queue_running: [], queue_pending: []}` |
| `api` + `path=/api/history/*` | `{}` |
| `update_action` | `{supported:false, phase:"idle", available:false}` |
| `llm_get` | `{base_url:"", model:"", temperature:0.7, has_key:false}` |

页面准备：

```js
await page.addInitScript(() => {
  localStorage.setItem("mochi-language", "zh-CN");
  // v1.15 起没有引导步骤了，onboarding-done 不再需要；想测「全新安装」直接
  // localStorage.clear() 也一样落到工坊。
});
await page.goto(URL, { waitUntil: "domcontentloaded" });   // 不要 networkidle，轮询永不 idle
await page.waitForTimeout(2500);                            // v1.14 起没有开屏动画，等首屏数据就够
```

几个固定的坑：

- 工作流卡是 `CollapsibleCard`，**未展开时内部元素 rect 是 0×0**。先点 `.collapsible-card h2 button`。
- 文件选择器有多个，skll 文件夹那个是最后一个（`webkitdirectory`）。工作流要用 `input[accept*="json"]`。
- 点开 `PromptEditor` 的 dialog 会拦截后续点击，测完 `page.keyboard.press("Escape")`。
- `.node-bound textarea.bound-editor` 才是可编辑文本框；`.node-bound input` 首个可能是别的字段。
- 截图路径**必须绝对**（相对路径按 CWD 解析，会写到 `D:\demo\_build\`）。
- `vite preview` 要先起服务：`Start-Process node node_modules/vite/bin/vite.js preview --port <PORT> --strictPort -WindowStyle Hidden`，`Start-Sleep 5` 再跑。

---

## 9. 历史决策（改架构前必读）

| 决策 | 为什么 |
| --- | --- |
| **删掉 PC 配对，只留 URL 连接** | v0.x 有 PC 伴侣端 + 配对文件 + 证书导入，三套东西维护成本高且容易过期。ComfyUI 本身就是 HTTP 服务，直接连就够了。`api.ts` 的 `parsePairing` / 证书逻辑、Rust 侧的 `profiles.json` / `pairing.json` 全部移除。 |
| **改名 Mochi → 绘画** | 产品面向中文用户。品牌资源 `assets/brand/expressions/*.webp` 做了灰度中和（`sharp().grayscale()`）——因为原图是彩色 emoji 风格，和纯白 UI 冲突。 |
| **纯白主题** | 只有一个 accent（`#1b1b1b` 黑），其余全是白 + 灰线 + 圆角卡片。不要引入彩色。 |
| **删掉「自动模式」，工坊只留工作流** | v1.1.3 之前工坊有 `mode: "simple" \| "workflow"` 双轨：simple 走 `buildWorkflow()` 造图，workflow 走导入的 JSON。两套参数维护两份、用户也困惑。现在**只有工作流**，`SettingsPanel.tsx`（704 行）整份删除。占位符层接替了「自动参数」的职责。`buildWorkflow` 保留但无调用方。 |
| **可视化画布从绝对定位改成竖向流水线** | 原方案是左右分栏 + 缩放拖拽，手机上节点挤成一团根本看不清。现在按依赖深度拓扑排序竖排卡片，一屏一个节点。`layoutGraph` 因此失去调用方。 |
| **（v1.14 反悔）画布回到图标节点 + 连线** | 竖排卡片的问题是「一屏只有一两个节点，看不出拓扑」。v1.14 改成真正的图：`layoutGraph` 按 depth 分列、节点缩成 132×78 的图标块（loader/prompt/sample/latent/output 五种底色）、连线用贝塞尔 `<path>`、**参数收进「点选某节点才出现的面板」**。首次进入自动 `fitZoom` 到适应宽度（<0.6 时回落到 0.8，避免图标小到看不清），选中节点会把画布平滑滚到它。`flowOrder` 随之删除。 |
| **占位符 `{{key}}` 而不是直接写值** | 让一份工作流能反复用不同参数。`autoBind` 在导入时改写节点，`resolveGraph` 在发送前替换。 |
| **贴图用 base64 data URL** | `lib.rs` 的 `image` 命令把图读成 base64 返回前端。简单但有内存代价（`IMAGE_LIMIT = 64MB`），大图会卡。改进方向见第 11 节。 |
| **Release 用 API 建，不打本地 tag** | github.com:443 在这台机器上经常被阻断，`git push` 反而要重试很多次；api.github.com 通畅。所以先用 API 建 release/打 tag ref，再单独重试 push 代码。 |
| **隐藏「安全」板块** | 生物识别锁的 UI 入口从设置页摘掉（用户要求），`AppLock.tsx` 的组件与 Rust 侧命令都还在，`LockSettings` 仍可用，只是暂时没入口。 |

---

## 9.5 v1.14 变更清单（本轮迭代）

一次集中改版，七件事，都已完成并通过 `tsc -b` / `vitest` / `vite build` / `tests/v114.spec.ts`。

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 设置新增「默认保存」 | `Connections.tsx` Application 分组 + `App.tsx` (`autoSave`/`autoSaveRef`) + `useGenerationSession.ts` (`persist`) | key `auto-save`，默认 `true`。开关在「Application → 默认保存」。`persist()` 逐个 `imageUrl` → `native("save_image", …)`，失败静默（相册权限、磁盘满都不该打断生成） |
| 2 | 删开屏动画 | `MochiMascot.tsx` / `AppLock.tsx` / `mobile.css` | `StartupSplash` 整函数删除；`launching`/`finishLaunch`/`shielded = locked \|\| launching` 一并去掉；`.startup-splash`、`.startup-progress`、`@keyframes mochi-*` 全部清理 |
| 3 | 删「继续设置」/「重新设置」 | `App.tsx`（原 `setupDone` + `setup-mobile-resume` 按钮）/ `Connections.tsx` | 两个重复入口都删。引导仍由 `setupOpen`（首次 `onboarding-done !== true`）驱动。**`paint-setup` 事件已无 dispatch 方**，监听留着 |
| 4 | 删「自定义配置」 | `Presets.tsx` `.preset-current` | `<strong>` 从「JSON 深比较 → 否则显示 Configuration personnalisée」改成 `current?.name ?? tr("Choisir un preset")`，不再出现「自定义配置」字样 |
| 5 | 可视化工作流重构 | `WorkflowCanvas.tsx`（重写）/ `workflow-canvas.css`（重写） | 图标节点 + 贝塞尔连线 + 点选参数面板。见第 9 节最后一条 |
| 6 | 工坊工作流选择 + 命名 | `WorkflowShelf.tsx` / `workflow-shelf.css` / `App.tsx` | 新增 `select.shelf-picker` 下拉；命名输入受控于 `App.tsx` 的 `workflowName`；`.generate-bar` 左侧显示当前工作流名 |
| 7 | 生图报错修复 | `workflow.ts` / `App.tsx` | 新增 `invalidChoices` / `sanitizeSettings`，`checkWorkflow` 增加 COMBO 值校验，`hydrate` / `reuse` / `generate` 三处调用 `sanitizeSettings` |
| 8 | 出图说明文档 | `docs/生成图片指南.md` | 用户五步流程 + 报错对照表 + 生成链时序 + 硬约束 |

**v1.14 修的那个报错**（用户实测）：

```
[ERROR] * KSampler 16:
[ERROR]   - Value not in list: scheduler: '' not in ['simple', 'sgm_uniform', ...]
[ERROR]   - Value not in list: sampler_name: '' not in (list of length 64)
```

根因是五条链路都能把空串写进 `settings`，而没人校验：`normalizeSettings` 只查 `typeof`（`""` 合法）→ `hydrate()` 只纠正 `model` 和 `sampler`，不碰 `scheduler` → `resolveGraph` 把 `""` 原样写进图 → `checkWorkflow` 只查缺节点和 `LatentUpscale.bicubic` → ComfyUI 只在服务端报 `prompt_outputs_failed_validation`，且**没有**定位信息。

现在三层兜住：`sanitizeSettings`（连接/导入/生成前用 `/api/object_info` 的候选列表纠正，空值或不在列表 → 回落 `defaults` → 回落候选首项）、`invalidChoices`（`checkWorkflow` 里拦住任何非法 COMBO 值并给出 `KSampler 16.scheduler=（空）` 这种可读定位）、画布 select 对陈旧值额外渲染 `<option>{value} · 不可用</option>`。

配套修了候选列表的解析：COMBO 在 `/api/object_info` 里有两种外形——新版本 `["COMBO", { options: [...] }]`，老版本 `[[...值], {...}]`。原来两处各自写着「`definition[0] === "COMBO"` 才读 options，否则把 `definition[0]` 当数组」，老式裸数组能过、另一种就成了空列表，而**空列表会让所有校验静默跳过**（`if (!allowed.length) continue`）。现在统一走 `src/api.ts` 的 `optionList(definition)`，`choices()` / `invalidChoices()` / `workflowGraph.ts` 的 `optionsOf()` 都用它。

v1.14.0 的 APK 已构建并签名：`dist-apk/huihua-1.14.0-arm64.apk`（77 186 815 字节，versionCode `11400`，证书 SHA-256 `9fe3dac1…bf9f`，与 1.1.3 同指纹，可直接覆盖升级）。发行说明草稿在 `_build/release-1.14.0.md`。

**构建顺序有一个坑**：`cargo build`（不是 `tauri build`）不会跑 `beforeBuildCommand`，但 `build.rs` 仍会在**编译时**把 `../dist` 烘进 `.so`。所以必须 `npx vite build` → 再 `cargo_android.ps1`。顺序反了会打进旧前端（UI 看起来没变，或直接白屏）。跑 `node _build\v114-verify-apk.mjs` 可以自检：它读当前 `dist/assets` 的 `index-*.js|css` 哈希文件名，检查是否出现在 `libhuihua_lib.so` 里，不匹配就 `STALE` 退出。

---

## 9.6 v1.15 变更清单（本轮迭代）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 导入工作流不再自动联动 | `App.tsx` `importFile()` | 删掉 `autoBind(w)`：导入只做 `parseWorkflow` + `checkWorkflow`，字段原样保留，提示改为「工作流已导入。」。「联动到自动设置」按钮（JSON 视图）仍保留，成为唯一的显式联动入口 |
| 2 | 删进 APK 的引导步骤 | 删 `Onboarding.tsx` + `Onboarding.css`；`App.tsx` 删 `setupStep`/`setupOpen`/`paint-setup` 监听/`return <Onboarding …>` 分支 | 首次启动直接进工坊（无 server 则落设置页）。`Welcome.tsx` 保留（它只是「还没连服务器」的空态，不是步骤引导），但文案里的 Danbooru/术语表改成素材库 |
| 3 | 修生图后卡死 | `useGenerationSession.ts` | 见下 |
| 4 | 术语表 → 素材库 | `Glossary.tsx` 全量重写 + `src/data/wardrobe.json`（164 KB，新）+ 删 `src/data/glossary.json`；`App.tsx` 标题/副标题/导航 label；`PromptSection.tsx` 按钮；`experience.test.ts` 第 4 个用例 | 四货架：服装 17 组 558 套 5434 标签、场景 7 组 45 套 190、姿势 24 组 500 套 2219、表情 5 组 32 套 205。数据由 `D:\demo\_anima_build.mjs` 从 Comfyui-Anima-Wardrobe 的 `anima_presets.json` 生成（MIT，lingdongbudong） |
| 5 | 提示词编辑器瘦身 | `PromptEditor.tsx` / `PromptTools.tsx` / `PromptSection.tsx`；删 `usePromptSuggestions.ts`、`tags.worker.ts`、`caret.ts`、`PromptAssistant.tsx` | 去掉语音助手入口与弹层、自动补全开关、Danbooru 联想气泡、`Vérifier`（检查）页与 `.prompt-conflict` 行。剩下：文本/区块分段、翻译、历史、可复用区块、权重、撤销重做 |
| 6 | 版本 + i18n | `_build/bump-1.15.0.mjs` / `_build/add-v115-strings.mjs` | 1.15.0 / versionCode `11500`；locale 950 → **967** 键 |

**「生图后卡死」的根因**（`src/useGenerationSession.ts`）：

轮询 effect 的依赖数组里带着 `onOnline` 和 `onError`，而这两个是 `App.tsx` 里每次渲染都新建的内联箭头函数。于是**任何**一次 `setState`（进度、phase、preview、results…）都会让 effect 拆除再重建：`stopped` 翻 true → `clearTimeout` → 新 effect 里 `void poll()` 立刻再发一轮 `/api/queue` + `/api/history`。生成过程中本来每 1.5 s 一轮，这下变成「每次渲染一轮」，请求量随渲染次数平方级上涨，UI 线程被 promise 回调占满——表现就是出图后界面卡住不动。

修法三条：
1. `onOnline` / `onError` 存进 `onlineRef` / `errorRef`（每次渲染同步赋值），effect 依赖里去掉它们；
2. 新增模块级 `busy` 锁：`poll()` 开头 `if (busy.current …) return`，`finally` 释放。被拆掉的旧循环若还有请求在飞，新循环不会叠上去；
3. `savedImages` 集合去重，避免重叠轮询把同一张图重复交给 `persist()` 写两遍相册。

**回归用例**：`tests/v115.spec.ts`（4 个，全绿）覆盖「新装首启无引导」「素材库四货架 + 选中写进提示词」「编辑器无语音/无补全/无气泡/两按钮」「导入不改字段」。

**构建产物**：`dist-apk/huihua-1.15.0-arm64.apk`（75 204 351 字节，versionCode `11500`，SHA-256 `9b86385a6838c3f30a5fdde3c4bca9754ad58517cd7d0a76167f99aa4102554b`，签名证书 SHA-256 `9fe3dac1…bf9f`，与 1.1.2 / 1.1.3 / 1.14.0 同指纹可覆盖升级）。发行说明在 `_build/release-1.15.0.md`。

**v1.15 顺手做的 CSS 清理**（6 个文件，40 余行死规则）：`.suggestion-bubble` / `.suggestion-dock` / `.suggestion-heading` / `.tag-option` / `.tag-suggestions` / `.tag-dot` / `.category-*` / `.autocomplete-setting` / `.editor-hint` / `.voice-entry` / `.prompt-conflict` / `.prompt-issues` / `.prompt-check-description`。另外 `src/experience.css` 的 `.editor-paper textarea { padding-bottom: 175px }` 改回 `23px`（那 175px 原本是给联想气泡让位）。清理脚本：`_build/clean-v115-css*.mjs`（5 个，按行/按块两套手法）。

---

## 9.7 v1.16 变更清单（本轮迭代）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 缩略图真缩 | 新增 `src/thumbnails.ts`；`Picture.tsx`、`components.tsx`、`App.tsx` `resetSession()`；新增 `src/thumbnails.test.ts` | 原来拼 `?thumb=1`，ComfyUI 不认这个参数、照样回原图，24 MB LRU 两三张就满。现在 `createImageBitmap` + `OffscreenCanvas` 在本地缩到长边 256（webp q=0.72），独立 8 MB 缓存。`fitSize`/`shrink`/`thumbnailImage`/`clearThumbnailCache` |
| 2 | 实时进度（WebSocket） | 新增 `src/comfySocket.ts`；`useGenerationSession.ts` 加独立 effect；`tauri.conf.json` CSP `connect-src` 加 `ws: wss:`；新增 `src/comfySocket.test.ts` | 之前进度是假的（`setProgress` 只在 0/100 两处调用），预览靠轮询 `/api/history` 里的 temp 图。现在直连 `/ws?clientId=`，解析 `progress`/`progress_state`/`executing`/`execution_start`/`execution_error`，二进制帧取 `PREVIEW_EVENT=1` 的预览（8 字节头 + PNG/JPEG/WEBP）。socket 有真帧时轮询不许覆盖（`socketPreview` ref）。重连退避 1s→15s |
| 3 | 素材库发送到画面描述 | `Glossary.tsx` 加 `onDescribe` + `chosen` state + `describe()`；`App.tsx` `describeDraft`；`PromptStudio.tsx` `draft` prop | 选中整套后多一个「发送到画面描述」按钮，把条目的中文 label 用「，」拼成一句话，跳到提示词页填进「画面描述」框。`id: Date.now()` 保证同样内容连发两次也能触发 |
| 4 | 看图可查详细提示词 | 新增 `src/ImageDetails.tsx`、`src/imageBytes.ts`；`Viewer.tsx` 加第五个动作按钮 | 按钮在每个图的查看器里，读 PNG 的 `comfy_pocket` tEXt chunk，列出正/负提示词 + 模型/尺寸/步数/CFG/采样器/调度器/种子/LoRA/VAE/来源，两段提示词各带一键复制。**注意 Viewer 的 return 改成 fragment**：`<dialog>` 不能可靠地嵌套 `showModal()`，弹层必须挂在 Viewer 的 Modal 旁边而不是里面 |
| 5 | 版本 + i18n | `_build/bump-1.16.0.mjs` / `_build/add-v116-strings.mjs` | 1.16.0 / versionCode `11600`；locale 968 → **983** 键 |

**顺手修的 i18n/样式**：`.glossary-selection .describe-send`（选中条第三个按钮）；`.image-details` 整套（弹层 `min(560px, 100%-24px)`、`.detail-text` `max-height:32vh`、`.detail-rows` 用 1px gap 做分隔线）。

**回归用例**：`tests/v116.spec.ts`（2 个，全绿）覆盖「素材库选中 → 发到画面描述 → 提示词页收到」「图库打开看图 → 详细提示词弹层显示银色头发/模型/LoRA」。e2e 里生成 PNG 必须自己算 CRC32 且带 `IHDR`+`IDAT`，只塞 `tEXt` 的假 PNG 会让 `createImageBitmap` 解码失败、缩略图永远停在「加载中」、`.image-button` 不渲染。

**还没在真机验证的**：CSP 加了 `ws:` 只在重新构建 APK 后生效，真 ComfyUI 上的 ws 进度与预览也还没实测。

**构建与发布**：`dist-apk/huihua-1.16.0-arm64.apk`（75 204 351 字节，versionCode `11600`，SHA-256 `1717561e846eadb2173d5d96ee22b1cc7e693164212273291be39ef9ad0478d9`，签名证书与前几版同指纹）。构建顺序仍是 `npx vite build` → `_build/cargo_android.ps1` → `copy_so.ps1` → `gradle_assemble.ps1` → `apksigner`；嵌入校验：`dist/assets` 下 15 个文件全部出现在 `libhuihua_lib.so` 里。
提交 `1843a8c`（feat(v1.16)…）+ `9e7ef75`（chore(release)），tag `v1.16.0` 指向 `1843a8c`，Release id `428033193`。

---

## 9.8 v1.17 变更清单（本轮迭代）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 素材库全中文 | 新增 `src/wardrobeNames.ts`、`src/data/wardrobe.{a,b,c,d}.*.json`（7 个中文名分片）、`src/wardrobeNames.test.ts`；`Glossary.tsx` 全部渲染点走 `display()` | 8048 条标签全部有中文名，**英文原值保持不动**：生成提示词仍然发英文 label。`display()` 只影响渲染层，`hitFor()`/`describe()` 里的 `prompt` 始终是英文 |
| 2 | 中英日三路搜索 | `src/wardrobeNames.ts` 的 `searchText()`；`Glossary.tsx` 的 `matches()` | 同时匹配中文名、英文原名、罗马音别名（`sailor dress` / `sailor` / `seifuku` 都能命中） |
| 3 | 整套双路发送 | `Glossary.tsx` 的 `describe()`；`PromptStudio.tsx` 的 `insertDraft()` + 新按钮；`App.tsx` `describeDraft` 类型改成 `{ text, prompt }` | 「发送到画面描述」给中文句子（`text`）+ 英文标签草稿（`prompt`）；「按英文标签填入正向提示词」直接把英文标签写进正向提示词。两条路互不覆盖 |
| 4 | 分类/分组中文化 | `Glossary.tsx` 面包屑与 `.theme-choices` 分组条 | 都走 `groupLabel()`/中文映射，缺中文名回退英文原名 |
| 5 | 版本 + i18n | `_build/bump-1.17.0.mjs`、`_build/check-i18n-1.17.0.cjs` | 1.17.0 / versionCode `11700`；locale 983 → **986** 键（中英法三语对齐，`t()` 引用 0 缺失） |

**校验**：`node node_modules/typescript/bin/tsc -b` 无输出；`vitest run` 15 文件 / **75 测试**全绿（新增 `src/wardrobeNames.test.ts` 20 条）；`vite build` 通过；`_build/check-i18n-1.17.0.cjs` 输出 en 986 / zh 986 / 缺失 0。

**网络环境实测（2026-10-31，这台机器）**：
- `github.com:443` **连不上**（`curl` 21s 超时，`git push` 走不通），`git` 还会先报 `schannel: CRYPT_E_REVOCATION_OFFLINE (0x80092013)`——想绕过就用 `git config --global http.schannelCheckRevoke false` 或 `curl --ssl-no-revoke`。
- `api.github.com`、`codeload.github.com`、`objects.githubusercontent.com`、`ssh.github.com:443` **都通**。
- 所以发版**不要走 `git push`**，走 `_build/publish-1.17.0.cjs`：它用 Git Data API 直接建 blob → tree → commit → fast-forward `main` → 建 tag + Release。这条路只需要 api.github.com。
- 写权限 token 靠**设备码登录**拿（本机没有 `gh`，`github.com/login/device/code` 偶尔抖动，脚本里带 8 次重试）：`node _build/gh-login-and-publish.cjs` 打印 `user_code`，浏览器打开 <https://github.com/login/device> 输入授权 GitHub CLI，token 落到 `_build/.ghtoken`（已 gitignore，40 字符，`gho_` 前缀），随后自动发版。要换账号就删掉这个文件重跑。

**1.17.0 发布结果**：上游 `main` 从 `a6dbaff` 前进到 **`699fcb0`**（`389144c` 首发 → `50fac62` 补 Release 正文 → `c1bf164` / `699fcb0` 补发版脚本与 tag 平移），tag `v1.17.0` → `699fcb0`，Release id **`429714462`**，`draft=false / prerelease=true`（原因见下），无 APK 资产。页面：<https://github.com/xxwzh66-byte/huihua/releases/tag/v1.17.0>。`_build/verify-release.cjs` 可复核 tag 与 main 指向、`package.json` = `1.17.0`、`src/wardrobeNames.ts` 4708 字节在位；`_build/show-release-body.cjs` 抓回 Release 正文。
- `publish-1.17.0.cjs` 已幂等：树和上游一致就跳过提交，且会把已存在的 tag `force` 平移到最新提交（Release PATCH 不会移动 tag）。连跑两次第二次只打印「跳过提交」。
- 为什么是 `prerelease` 而不是 `draft`：`AppUpdates.kt:89` 同时跳过 `draft` 和 `prerelease`，两者都不会被应用内更新推给用户；但 `draft` 在 Releases 页不显示，`prerelease` 显示。第一次发成 `draft`（id `429713828`）已删除。
- **本地 sha 与上游不同**：上游那两个提交是 Git Data API 直接造的，本地工作副本还是 `331516f` / `52ec453` / `f87f746`，树内容一致但 sha 不同。`github.com` 不通没法 `git fetch` 对齐，下一轮用 `_build/diff-vs-upstream.cjs` 按 blob sha 比对即可，不用担心「本地落后」。
- `_build/probe-upstream.cjs` 只读探测上游状态；`_build/diff-vs-upstream.cjs` 对比本地 HEAD 与上游 main 的 blob sha，确认没有「上游已改过、本地要覆盖」的冲突（1.17.0 结果：`changed=23 identical-to-upstream=0 upstream-moved=0`）。

**没做成的**：本机没有 Android 工具链（`D:\demo\toolchain`、`D:\demo\android-sdk` 均不存在）、没有 `_build/huihua-release.jks` 签名，因此 1.17.0 **只到源码 + 前端产物**，没有 APK 资产，Release 会发成 draft。出包要在原开发机（`D:\demo\Paint-v1`）按第 5 节四步跑完，再把 `huihua-1.17.0-arm64.apk` 放到 `dist-apk/` 重跑发布脚本，脚本会自动上传并把 Release 转正。

---

## 10. 已知的坑（都踩过）


### 10.1 控制台编码

- `pwsh` 是 **GBK 控制台**。`Get-Content` 读 UTF-8 文件会把中文/法语解成乱码（`茅` / `鈥?` / `缁樼敾`）。**这不代表文件损坏**。要看真内容用 `[System.IO.File]::ReadAllText($path)`。
- `node -e "..."` 里带中文或嵌套引号必定炸。**一切补丁脚本写到 `_build\*.mjs` 再用 `node` 跑**。
- Playwright 选择器里写字面量中文/法语会被编码破坏（`Unexpected token "" while parsing css selector`）。用位置选择器 `.nth(1)` 或 class 选择器。
- `write` 工具写文件后，`[System.IO.File]::ReadAllText('相对路径')` 按 **PowerShell 的 CWD** 解析，不是工具的 workdir。一律绝对路径。

### 10.2 构建

- `D:\demo\package.json` 出现过 **0 字节**文件（某次 Playwright 以 `D:\demo` 为 CWD 跑出来的），导致 `vite build` 报 `Failed to load PostCSS config ... Unexpected end of JSON input`。**构建突然报 PostCSS/JSON 错误，先查这个文件。**
- `Get-ChildItem -Path src -Recurse -Include *.ts` 需要 `\*` 通配符或写成 `src\**\*.ts`，否则静默返回空。
- `git add -A` 会把解包 APK 出来的上千个文件加进索引。`.gitignore` 已有 `_build/so*/`，验证完记得 `Remove-Item -Recurse`。
- `Expand-Archive` 的相对路径按 PowerShell CWD 解析，脚本里必须绝对路径。

### 10.3 网络

- `git push` 到 github.com:443 频繁失败：`send-pack: unexpected disconnect while reading sideband packet` / `Failed to connect ... port 443 after 21s` / `Recv failure: Connection was reset`。**解决方式是等 + 重试**（循环 6 次、每次间隔 20s，通常第 3-4 次成功）。诊断口诀：`Invoke-WebRequest https://github.com` 超时但 `https://api.github.com` 200 → 不是网络全断，是 github.com 被间歇阻断。
- v1.15 实测有效的组合：`git config http.version HTTP/1.1` + `git config http.postBuffer 524288000`，然后重试。HTTP/2 下大包更容易在 `Recv failure` 直接断，降到 1.1 后一次过。
- **push 成功后别只信 `git status -sb`**：`git ls-remote` 同样走 github.com，也会失败。用 API 核对远端 HEAD 才靠谱：`GET /repos/{repo}/commits/main` 看 `sha` 是否等于本地 `git rev-parse HEAD`。
- **release 的 tag ref 会指向建 release 那一刻的 main**：先建 release 再 push 代码，tag 就落在旧 commit 上。补法：`PATCH /repos/{repo}/git/refs/tags/{tag}` 带 `{sha: <新 commit>, force: true}`，release 页面会自动跟着更新。
- Node 侧 `fetch` 到 api.github.com 报 `unable to verify the first certificate`，设 `$env:NODE_TLS_REJECT_UNAUTHORIZED='0'` 可绕过。
- `GET /releases/tags/{tag}` 返回的 `draft` 字段不可靠，改用 `/releases?per_page=20` 查列表再判断。

### 10.4 应用自身的坑

- **`LlmSettings` 的 mock 崩溃**：`llmGet().then(data => data.base_url.trim())` 在 `data = {}` 时抛 `Cannot read properties of undefined (reading 'trim')`，React 整个树崩掉 → 整页白屏。已修成 `String(data?.base_url ?? "")`，别改回去。
- **`AppLock` 的锁屏假白屏**：没有 mock `lock_status` 时渲染 `<dialog class="lock-screen">`，body 是空的，看起来就是白屏。
- ~~**启动闪屏 ~2.6s**，截图/断言前要等。~~ **v1.14 已删除开屏动画**（`StartupSplash` 连同 `AppLock` 的 `launching` 状态一起删掉），现在冷启动直接进锁屏或主界面，截图脚本里的 `waitForTimeout(4000)` 可以缩短。
- `waitUntil: "networkidle"` 在这个应用里永不返回（队列轮询）。
- React StrictMode 双挂载，`useEffect` 里的原生调用会跑两次。

---

## 11. 现在缺什么（v1.16 之后重核，按优先级）

> 这一节在 v1.15 发版后重新逐条核对过代码，不是沿用旧结论。标注「✅已核实」的都跑过 grep / 读过实现；标注「✅ v1.16 已做」的是本轮补掉的。

### P0 — 真正卡住体验的三条

1. ~~**进度是假的，也没有实时预览**~~ ✅ **v1.16 已做**
   - 现在 `src/comfySocket.ts` 直连 `/ws?clientId=`，`progress` → 真实百分比、`executing` → 「节点 N」、二进制 `PREVIEW_EVENT=1` 帧 → 预览图（`socketPreview` ref 保证不被轮询快照覆盖）。CSP 已加 `ws: wss:`。
   - 剩下要做的：真机上实测 ws 是否能连（Android WebView 明文 ws 到局域网 IP），以及重新构建 APK 才会带上新 CSP。Rust 侧 `tokio-tungstenite` 的 B 方案作为 A 失败时的备选，代码还没写。

2. **无鉴权、不能上传图片** ✅已核实
   - `src-tauri/src/lib.rs` 的 `struct ServerConfig { url: Option<String> }` —— 只有一个字段。
   - `src-tauri/src/transport.rs` 全文 grep `header|token|Authorization` **零命中**；`request()` 只有两个分支：`client.post(url).json(&value)` 和 `client.get(url)`。没有 multipart、没有自定义 header。
   - `request_url()` 硬约束：`path` 必须以 `/api/` 开头，且不能含 `\` 或 `#`。
   - 后果：连不上套了 token 的 ComfyUI 反代；做不了 img2img / inpaint / ControlNet —— 而 v1.15 刚上线的素材库里有大量「姿势」「场景」数据，配不上图生图等于只能文生图。
   - 解法分三步，可以分开发：
     - a) `ServerConfig` 加 `token: Option<String>` + 设置页多一个输入框；`request()` 在有 token 时挂 `Authorization: Bearer`。
     - b) 新增 `upload_image(app, data_url, filename)` 命令，POST `/api/upload/image` multipart（`reqwest` 要开 `multipart` feature，现在只开了 `rustls-tls, json`）。
     - c) 工坊加「参考图」区：选图 → 上传 → 把返回的 `name` 塞进工作流对应的 `LoadImage.image` 字段。

3. ~~**缩略图是假的，图库会吃内存**~~ ✅ **v1.16 已做**
   - `src/thumbnails.ts`：`createImageBitmap` + `OffscreenCanvas` 在本地缩到长边 256（webp q=0.72），独立 8 MB 缓存；`Picture.tsx` 的 `<Picture small>` 走它，Viewer 仍用原图缓存。
   - 原问题：`Picture.tsx` 拼 `?thumb=1`，ComfyUI `/api/view` 不认这个参数、返回原图；`imageCache.ts` 的 LRU 只有 24 MB，两三张原图就顶满。

### P1 — 质量债

4. **`batches` 是死字段** ✅已核实
   - `src/workflow.ts:10` 有 `batch: number; batches: number`，`buildWorkflow` 里也校验 `batches 1-20`。
   - 但 `src/App.tsx:338` 的 `builds` 数组**永远只有一项**，`for (const b of builds)` 循环只跑一次；`batch_size` 只能靠 `{{batch}}` 占位符碰到。
   - 方向二选一：要么在 UI 上接出来（多批次 = 循环 N 次发同一个 prompt，用不同 seed），要么把这字段删掉。**别留着让人以为能用。**

5. **`autoBind` 靠 class_type 正则猜，很脆**
   - `src/workflowBindings.ts` 的 `autoBind` 用 `/^ksampler/i`、`/emptylatent/i`、`/checkpointloader/i`、`/^vaeloader$/i` 匹配节点类型。不认识 `CLIPTextEncodeSDXL`（双 `text_g`/`text_l`）、`T5TextEncode`、`FluxGuidance`、`ConditioningCombine`。
   - `positiveDone` 只写第一个正向 encode，多正向节点的工作流会漏掉后面的。
   - 方向：改走「从 KSampler 的 `positive`/`negative` link 反向遍历到真正的条件节点」，而不是靠类名。v1.15 后 `autoBind` 只在用户显式点「联动到自动设置」时跑，所以这条不再是 P0，但既然还留着入口就得修对。

6. **删除只是隐藏**。`App.tsx` 的 `removed` 是 localStorage Set，图片仍在服务器上；UI 文案写的是「可恢复」。ComfyUI 没有标准删图 API，要真删得自己加成 Rust 命令去动服务器文件系统 —— 跨端风险大，建议**改文案**而不是加功能。

7. **e2e 部分过期 + 无 CI** ✅已核实
   - `.github/` 目录不存在，没有 CI。
   - 仍过期的：`tests/app.spec.ts`、`tests/studio-settings.spec.ts`、`tests/catalog.spec.ts`（import 不存在的 `src/ModelImports`）、`tests/onboarding.spec.ts`（v1.15 起整个页面已删，可整份删掉）。
   - 现在绿的只有 `tests/v114.spec.ts`（4）+ `tests/v115.spec.ts`（4）。
   - 补 CI 的性价比最高：`tsc -b` + `vitest run` + `vite build` 三件套，十几行 YAML，能拦住本次这类回归（v1.14 的 COMBO 解析、v1.15 的轮询卡死都是单测能拦的）。

### P2 — 能更好

8. `resolveGraph` / `autoBind` 没有单测——最该补的两个函数。
9. **死代码清单**（`_build/find-orphans.mjs` 扫出来的，v1.1.3 现状）：

   | 文件 | 状态 |
   | --- | --- |
   | `src/StudioModels.tsx` | **完全孤儿**——v1.1.3 删 `SettingsPanel` 后没有任何文件 import 它（它内部还调 `/bridge/model-info`、`/bridge/model-favorites`，那些接口在 v1.0 就没了，是纯死代码 + 死接口） |
   | `src/ModelPicker.tsx` | 只被 `src/components.tsx` 桶文件 re-export，`<ModelPicker>` 全项目 0 处渲染 |
   | `src/workflow.ts` 的 `buildWorkflow` | 只剩定义 + 单测，产品代码无调用方 |
   | `src/workflowGraph.ts` 的 `layoutGraph` | **不是孤儿**：`WorkflowCanvas.tsx:124` 用它算节点坐标（`WorkflowCanvas.tsx:23` import） |
   | ~~`src/PromptAssistant.tsx`~~ | v1.15 已删 |
   | ~~`src/usePromptSuggestions.ts`~~ / ~~`src/tags.worker.ts`~~ / ~~`src/caret.ts`~~ | v1.15 已删（Danbooru 联想整条链） |

   注意 `src/testLocale.ts` 由 `vitest.config.ts` 引用、`src/vite-env.d.ts` 是类型声明——这两个不算孤儿，别删。`src/data/booru.tsv.gz`（**1 962 825 字节 / 234 011 行**）在 v1.15 后**已无运行时引用**：`src/tags.ts` 仍在但无人 import，只有 `experience.test.ts:9` 还在 `gunzipSync` 它断言行数。**留着这 1.9 MB 的唯一代价是打包体积**（`vite build` 会把它当 asset 拷进 `dist/`，但不进 js chunk）。下次要么连 `tags.ts` 一起删、测试改成断言 `wardrobe.json`，要么就明确「保留给未来的补全功能」。

   另：`src/StudioModels.tsx` 与 `src/ModelPicker.tsx` 这两个孤儿从 v1.1.3 挂到现在，**删它们能顺便带走 `/bridge/*` 死接口**，是目前最干净的一次清理。
10. 图片走 base64 data URL，大图吃内存；可以改成 `native` 返回本地临时文件路径 + `convertFileSrc`。
11. `Settings.hires` / `Settings.upscale` / `Settings.loras` 在 v1.1.3 后没有 UI 入口（随 `SettingsPanel` 一起删了），只有 `{{key}}` 占位符能碰到 `clip_skip`，LoRA 完全碰不到。要做 LoRA 支持得先在设计上想清楚它和工作流节点的关系。

---

## 11.5 常见改动怎么做（照抄步骤）

### A. 加一个底部导航页

1. `src/PageNavigation.ts:9` 的 `pages` 数组里插入 id（顺序 = 页面顺序 = 滑动方向）。
2. `src/App.tsx:1455` 附近的 nav 数组加一项 `{ id, label: tr("…"), icon }`（lucide 图标）。
3. `src/App.tsx:707` 的 `renderPage` 里加 `{tab === "<id>" && <你的组件/>}`；同时在 `renderPage` 开头两个内联 map 里补标题和副标题（`{ create: tr("…"), prompt: tr("…"), … }[tab]`，**漏了会让 `h1` 渲染成空**）。
4. 重组件用 `lazy(() => import("./X"))` + `<Suspense>`（参照 `PromptStudio` 的写法）。

**漏改任一处 → 导航点了没反应，或者页面渲染空白但 nav 高亮。**

### B. 加一个占位符 key

1. `src/workflowBindings.ts` 的 `BINDINGS` 数组加一项 `{key, label, kind, value: (s) => …, apply?: (s, raw) => s}`。
2. 如果这个参数在 `Settings` 里没有对应字段，先加到 `src/workflow.ts` 的 `Settings` 和 `defaults`，再在 `normalizeSettings` 里补类型守卫。
3. 加完 `boundList` / `WorkflowCanvas` 会自动出现，不用改 UI。

**别复用已有 key 名**——`BINDING_KEYS` 会直接拿去和 `{{…}}` 文本匹配。

### C. 加一个 Rust 原生命令

1. `src-tauri/src/lib.rs` 写 `#[tauri::command] async fn your_command(...) -> Result<T, String>`。
2. 加进 `lib.rs:184` 的 `tauri::generate_handler![...]` 列表（**漏了就是 `command not found`**）。
3. 前端 `native<T>("your_command", {…})`，参数名是 **camelCase**（Tauri 会自动转 snake_case）。
4. 走 ComfyUI 的请求**必须**用 `transport::request(session, path, body)`，因为 `request_url()` 只放行 `/api/`；要放行新前缀得改那个白名单 + 补 `transport.rs` 的单测。

### D. 改自动更新行为

- 版本发现逻辑在 `src-tauri/pocket-plugin/android/…/AppUpdates.kt`（Kotlin），不在 Rust 也不在 TS。
- 改 UI 文案/布局改 `src/AppUpdater.tsx`；想把「自动检查」默认关掉，改 `src/AppUpdater.tsx:32` 的 `autoCheckEnabled()`。
- 改完**一定**跑 `node _build/updater-sim.cjs`，它复刻了 Kotlin 的匹配规则，能提前发现 asset 名 / tag / digest 不匹配。

### E. 加一条发布说明

写 `_build/release-<VER>.md`，用 `# 小节` + `- 条目`；**开头不要写版本号标题**（弹窗里已有 `h3` 和 `release.title`）。`AppUpdater.releaseLines()` 只认 `#` / `-` / `*` 三种前缀，其余行当普通条目。

---

## 12. 快速排错表

| 现象 | 先查 |
| --- | --- |
| 手机上白屏 | Cargo 的 `custom-protocol` feature 开了吗？`.so` 里的 dist hash 对得上吗？ |
| 安装报「签名不一致」 | 是不是换了 keystore？必须用 `_build/huihua-release.jks` + alias `huihua` |
| 更新检测不到新版本 | asset 名是不是精确 `huihua-X.Y.Z-arm64.apk`？tag 是不是 `vX.Y.Z`？release 是不是 draft？versionCode 有没有变大？ |
| 更新下载后装不上 | `verify()` 会校验签名证书 + versionCode，任一不符就拒 |
| `vite build` 报 PostCSS/JSON | `D:\demo\package.json` 是不是 0 字节 |
| 页面整片白 | `LlmSettings` 的 `llm_get` 返回值有没有 `base_url`/`model`；`lock_status` mock 对不对 |
| 生成报「缺失的节点」 | `/api/object_info` 里有没有工作流用到的全部 class_type |
| 生成报含 `{{` 的错 | 是不是某条发送路径没走 `resolveGraph` |
| 工作流卡片看不到内容 | `CollapsibleCard` 没展开（rect 0×0） |
| `git push` 卡住 | 等 20s 重试；`api.github.com` 通就说明只是 github.com 被间歇阻断 |

---

## 13. 递交清单

接手时确认这几件事：

- [ ] `_build/huihua-release.jks` 存在且密码 `huihua2026` / alias `huihua`（丢了就再也无法覆盖升级）
- [ ] `git credential fill` 能拿到 PAT（40 字符，用户 `xxwzh66-byte`）
- [ ] `D:\demo\toolchain` 和 `D:\demo\android-sdk` 完整
- [ ] `npx tsc -b` 无输出、`npx vitest run` 55/55 通过
- [ ] `git status` 干净，HEAD 与 GitHub `main` 一致（`node -e` 查 `/repos/.../commits/main` 比 `git ls-remote` 可靠）
