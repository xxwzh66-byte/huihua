# 绘画（huihua）接手文档

> 写给下一个接手这个项目的人（或未来的自己）。读完这份能直接改代码、跑测试、出包、发版。
> 当前版本：**1.1.3**，HEAD `961c3be`，分支 `main`，远端 `https://github.com/xxwzh66-byte/huihua.git`。
> 仓库**没有本地 git tag**，所有 Release 都用 GitHub API 创建（原因见「坑」一节）。

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
| 术语表 `glossary` | Danbooru 词库 + 中英对照 |
| 设置 `connect` | 服务器地址、生成 API、服务器资源、语言 / 外观 / 更新 |

---

## 2. 30 秒上手

```powershell
cd D:\demo\Paint-v1
npm install
npm run dev                 # http://127.0.0.1:1420
npx tsc -b                  # 类型检查（必须无输出）
npx vitest run              # 12 文件 / 51 测试
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
| `WorkflowCanvas.tsx`（533 行） | 竖向流水线卡片视图，字段就地编辑，占位符 chip → 绑定弹窗 |
| `WorkflowShelf.tsx`（169 行） | 本地工作流库（保存 / 载入 / 删除 / 导出 JSON） |
| `workflowLibrary.ts`（97 行） | 库的存储层，key `workflow-library-v1`，上限 60 |
| `PromptSection.tsx`（107 行） | 工坊的「文字成就图像」卡，打开 `PromptEditor` |
| `PromptEditor.tsx` | 提示词编辑器（分块 / 权重 / 历史 / 翻译 / 助手） |
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
| `onboarding-done` / `onboarding-step` | 引导状态 | `App.tsx:108-124` |
| `quick-menu` / `left-handed` | 界面偏好 | `App.tsx:141-146` |
| `gallery-columns` | 2/3/4 | `App.tsx:162` |
| `favorites:<server>` / `removed:<server>` | 收藏 / 隐藏（**不是真删**） | `App.tsx:98-102` |
| `results:<server>` / `seed:<server>` / `tasks:<server>` | 上次结果 / 种子 / 队列 | `App.tsx` |
| `active` | 上次连的服务器 | `App.tsx:241` |
| `workflow-library-v1` | 工作流库（≤60） | `workflowLibrary.ts` |
| `prompt-templates-v1` | skill 模板（≤100） | `promptTemplates.ts` |
| `prompt-default-system-v1` | 全局默认 system 指令 | `promptTemplates.ts` |
| `prompt-studio-history-v1` | 提示词页历史（≤30） | `PromptStudio.tsx` |
| `prompt-history-v1` / `prompt-blocks-v1` | 编辑器历史 / 可复用块 | `promptLibrary.ts` |
| `mochi-voice-draft-v1` | 助手草稿 | `PromptAssistant.tsx` |
| `mochi-update-auto` / `mochi-update-check` | 自动检查更新开关 / 上次检查时间 | `AppUpdater.tsx` |
| `inference-presets-v1` | 预设 | `presetStore.ts` |
| `model-favorites-v1` | 模型收藏（**读写方 `StudioModels.tsx` / `ModelPicker.tsx` 都已是死代码，实际不再写入**） | `StudioModels.tsx` / `ModelPicker.tsx` |
| `autocomplete-enabled` / `biometric-auto-prompt` / `size-presets` | 杂项 | 各处 |

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

写一个 `_build/bump-<VER>.mjs`（照抄 `_build/bump-1.1.3.mjs`）：

```
package.json                        "version": "X.Y.Z"
src-tauri/tauri.conf.json           "version": "X.Y.Z"
src-tauri/Cargo.toml                version = "X.Y.Z"
src-tauri/gen/android/app/tauri.properties
    tauri.android.versionName=X.Y.Z
    tauri.android.versionCode=<10000 + minor*100 + patch>   # 1.1.3 → 10103
```

versionCode 必须单调递增，否则 `AppUpdates.verify()` 会拒绝安装。

### 6.2 补 i18n 键

```powershell
node _build\find-missing-strings.mjs      # 扫 src/*.ts(x) 的 t()/tr() 字面量，列出缺的键
# 用 add-strings.mjs / add-v113-strings.mjs 的写法（表格 [source, zh, en]）补齐
node _build\find-missing-strings.mjs      # 期望 missing 0
```

`add-strings.mjs` 会 JSON 解析 → 加键 → 按 key 排序 → 2 空格缩进重写，两个 locale 同时改。中文源串的 zh 填 `""` 时回退成 source 本身。

### 6.3 测试 + 构建

```powershell
npx tsc -b          # 无输出
npx vitest run      # 12 files / 51 tests
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

顺带把 `README.md` 的标题、下载表、`adb install` 行、`### X.Y.Z` 更新内容节一起更新。

---

## 7. 测试

### 7.1 单测（vitest）

`vitest.config.ts`：`include: ["src/**/*.test.ts"]`，`setupFiles: ["src/testLocale.ts"]`（把 locale 钉在 `fr`，所以断言里是法语串）。

现有 12 个测试文件，覆盖：`asyncPool` / `workflow` / `promptDocument` / `promptLibrary` / `promptWeights` / `promptRobustness` / `imageCache` / `metadata` / `importValidation` / `modelCompatibility` / `translation` / `experience`。

**没有覆盖**：`workflowBindings`（占位符替换！）、`workflowGraph`、`workflowLibrary`、`promptTemplates`、`serverInventory`、`llm`。这几个是最该补单测的地方，尤其 `resolveGraph` / `autoBind`——它们是唯一决定「发出去的图对不对」的逻辑。

### 7.2 E2E（Playwright）——目前是坏的

`playwright.config.ts`：`testDir: "tests"`，端口 `PAINT_TEST_PORT || 14420`，`webServer: npm run dev`，viewport 390×844。

**`tests/app.spec.ts` 已全面过期**：25 处引用 `activate_profile` / `list_profiles` / `/bridge/*`，这些在 v1.0 就删了。`catalog.spec.ts`(5) / `connections.spec.ts`(6) / `v14.spec.ts`(2) 也各自残留 bridge 引用。跑 `npm run test:e2e` 会红一片，属于已知状态，不是回归。

现在真正在用的验证方式是 `_build/` 下一堆手写 Playwright 脚本（`v113check.mjs` / `v113gen.mjs` / `instructioncheck.mjs` / `updatecheck.mjs` …）。它们的共同套路见第 8 节。

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
  localStorage.setItem("onboarding-done", "true");
  localStorage.setItem("mochi-language", "zh-CN");
});
await page.goto(URL, { waitUntil: "domcontentloaded" });   // 不要 networkidle，轮询永不 idle
await page.waitForTimeout(4000);                            // 跳过 ~2.6s 启动闪屏
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
| **占位符 `{{key}}` 而不是直接写值** | 让一份工作流能反复用不同参数。`autoBind` 在导入时改写节点，`resolveGraph` 在发送前替换。 |
| **贴图用 base64 data URL** | `lib.rs` 的 `image` 命令把图读成 base64 返回前端。简单但有内存代价（`IMAGE_LIMIT = 64MB`），大图会卡。改进方向见第 11 节。 |
| **Release 用 API 建，不打本地 tag** | github.com:443 在这台机器上经常被阻断，`git push` 反而要重试很多次；api.github.com 通畅。所以先用 API 建 release/打 tag ref，再单独重试 push 代码。 |
| **隐藏「安全」板块** | 生物识别锁的 UI 入口从设置页摘掉（用户要求），`AppLock.tsx` 的组件与 Rust 侧命令都还在，`LockSettings` 仍可用，只是暂时没入口。 |

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
- Node 侧 `fetch` 到 api.github.com 报 `unable to verify the first certificate`，设 `$env:NODE_TLS_REJECT_UNAUTHORIZED='0'` 可绕过。
- `GET /releases/tags/{tag}` 返回的 `draft` 字段不可靠，改用 `/releases?per_page=20` 查列表再判断。

### 10.4 应用自身的坑

- **`LlmSettings` 的 mock 崩溃**：`llmGet().then(data => data.base_url.trim())` 在 `data = {}` 时抛 `Cannot read properties of undefined (reading 'trim')`，React 整个树崩掉 → 整页白屏。已修成 `String(data?.base_url ?? "")`，别改回去。
- **`AppLock` 的锁屏假白屏**：没有 mock `lock_status` 时渲染 `<dialog class="lock-screen">`，body 是空的，看起来就是白屏。
- **启动闪屏 ~2.6s**，截图/断言前要等。
- `waitUntil: "networkidle"` 在这个应用里永不返回（队列轮询）。
- React StrictMode 双挂载，`useEffect` 里的原生调用会跑两次。

---

## 11. 现在缺什么（按优先级）

### P0 — 功能上真的缺

1. **进度是假的**。`src/useGenerationSession.ts:141` 只有 `setProgress(remaining.length ? 0 : failed ? 0 : 100)`，全程只有 0 和 100。`src` 里 `WebSocket` / `/ws` 出现 **0 次**。
   → 解法：订阅 ComfyUI `/ws` 的 `progress` / `executing` / `preview` 事件。地址是 `ws(s)://<server>/ws?clientId=<clientId>`，但 `transport.rs` 目前只放行 `/api/` 且只做 JSON，**WebSocket 得新写 Rust 侧**（或让前端直连——受 CSP `connect-src` 限制，需要同时改 `tauri.conf.json`）。
2. **无鉴权、不能上传图**。`ServerConfig` 只有 `url` 一个字段；`transport.rs` 的 `request()` 不发自定义 header；`request_url()` 只放行 `/api/` 且只做 JSON body。
   → 后果：连不上需要 token 的 ComfyUI 反代；做不了 img2img / ControlNet（要 multipart 上传到 `/api/upload/image`）。
   → 解法：`ServerConfig` 加 `token: Option<String>`；`request()` 加 `Authorization`/自定义 header；新增 `upload_image` 命令走 multipart。

### P1 — 质量

3. **缩略图是假的**。`src/Picture.tsx:26` 给路径加 `?thumb=1`，但 ComfyUI `/api/view` 不认这个参数，返回的还是原图。图库几十张图会吃满内存。真解法是本地生成缩略图（Android 侧 `BitmapFactory` + `inSampleSize`，或前端 `createImageBitmap` + canvas 缩到 256px）。
4. **两个 AI 提示词入口并存**。`PromptStudio.tsx`（459 行，独立页）和 `PromptAssistant.tsx`（522 行，`PromptEditor` 里的弹窗，`PromptEditor.tsx:5/578` 仍在用）。逻辑大量重复。
   → 方向：把 `PromptAssistant` 砍成薄壳，复用 `PromptStudio` 的生成/复制逻辑，或干脆让 `PromptEditor` 的入口直接跳提示词页。
5. **`autoBind` 靠 class_type 正则猜，很脆**。不认识 `CLIPTextEncodeSDXL`（双 `text_g`/`text_l`）、`T5TextEncode`、`FluxGuidance`、`ConditioningCombine`；`positiveDone` 只写第一个正向 encode，多正向节点的工作流会漏。
   → 方向：改走「沿 KSampler 的 `positive`/`negative` link 反向遍历」确定真正的条件节点，而不是靠类名。
6. **删除只是隐藏**。`App.tsx:172` 的 `removed` 是 localStorage Set，图片还在服务器上。UI 上写的是「récupérable」，但没有任何真删接口（ComfyUI 也没有标准删图 API，得自己加）。
7. **e2e 全过期 + 无 CI**。见 7.2。补 CI（`tsc -b` + `vitest` + `vite build` 三件套就够拦大部分回归）比修那 38 处 bridge 引用更值。

### P2 — 能更好

8. `resolveGraph` / `autoBind` 没有单测——最该补的两个函数。
9. **死代码清单**（`_build/find-orphans.mjs` 扫出来的，v1.1.3 现状）：

   | 文件 | 状态 |
   | --- | --- |
   | `src/StudioModels.tsx` | **完全孤儿**——v1.1.3 删 `SettingsPanel` 后没有任何文件 import 它（它内部还调 `/bridge/model-info`、`/bridge/model-favorites`，那些接口在 v1.0 就没了，是纯死代码 + 死接口） |
   | `src/ModelPicker.tsx` | 只被 `src/components.tsx` 桶文件 re-export，`<ModelPicker>` 全项目 0 处渲染 |
   | `src/workflow.ts` 的 `buildWorkflow` | 只剩定义 + 单测，产品代码无调用方 |
   | `src/workflowGraph.ts` 的 `layoutGraph` | 只有定义，无调用方 |
   | `src/PromptAssistant.tsx` | 只被 `src/PromptEditor.tsx:5` 引用（522 行，与 `PromptStudio` 大量重复） |

   注意 `src/tags.worker.ts` 被 `new Worker(new URL(...))` 动态加载、`src/testLocale.ts` 由 `vitest.config.ts` 引用、`src/vite-env.d.ts` 是类型声明——这三个不算孤儿，别删。
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
- [ ] `npx tsc -b` 无输出、`npx vitest run` 51/51 通过
- [ ] `git status` 干净，HEAD 与 GitHub `main` 一致（`node -e` 查 `/repos/.../commits/main` 比 `git ls-remote` 可靠）
