# 绘画（huihua）接手文档

> 写给下一个接手这个项目的人（或未来的自己）。读完这份能直接改代码、跑测试、出包、发版。
> 当前版本：**1.22.0**（versionCode `12200`），分支 `main`，远端 `https://github.com/xxwzh66-byte/huihua.git`。
> 仓库**没有本地 git tag**，所有 Release 都用 GitHub API 创建（原因见「坑」一节）。
> 端到端出图流程另见 **[docs/生成图片指南.md](docs/生成图片指南.md)**（面向用户 + 开发者两条线）。

---

## 1. 这是什么

一个 ComfyUI 的 Android 客户端（Tauri 2 + React 19），中文优先。默认主题是纯白（v1.19 起另有四套可切换，见「设置」页）。

核心主张：**手机上只做「写提示词 / 调参数 / 看进度」，出图的算力全留在自己的 ComfyUI 服务器上。**

连接方式只有一种：填 ComfyUI 地址（`http://` 或 `https://`）。没有 PC 伴侣端、没有配对文件、没有证书导入——这些是 v0.x 的遗留，v1.0 全部删掉了。想改回那种架构前先读第 9 节「历史决策」。

### 功能面

| 页 | 干什么 |
| --- | --- |
| 工坊 `create` | 导入 API 工作流 → 提示词装配（v1.18，固定块 / 质量标签 / 替换规则）→ 改参数 → 勾掉不要的节点 → 实时预览 → 生成 |
| 提示词 `prompt` | 独立页，接任意 OpenAI 兼容 API，一句描述直接出 Danbooru 标签，可复制 / 填入工坊 |
| 图库 `gallery` | 服务器输出图，收藏、删除（本地隐藏）、批量下载 |
| 素材库 `glossary`（v1.15 改名，id 未变） | 服装 / 场景 / 姿势 / 表情四货架，标签来自 Comfyui-Anima-Wardrobe（8048 条，离线） |
| 设置 `connect` | 服务器地址、生成 API、服务器资源、语言（固定简体中文）/ 外观（v1.19 五套主题）/ 更新 |

---

## 2. 30 秒上手

```powershell
cd D:\demo\Paint-v1
npm install
npm run dev                 # http://127.0.0.1:1420
npx tsc -b                  # 类型检查（必须无输出）
npx vitest run              # 19 文件 / 101 测试
npx vite build              # 前端产物到 dist/
```

注意 `npm run dev` 走的是 Vite；**没有 Tauri 宿主时 `native()` 会 POST `/__native`**（见 `src/api.ts:63`），所以纯浏览器里只能看 UI 骨架，连不了 ComfyUI。真实联调要跑 `npm run tauri android dev`（需要第 5 节的环境）。

---

## 3. 目录与文件地图

### 3.1 前端 `src/`（97 个文件）

**入口**
- `src/main.tsx` — 挂载 `AppLock > App`，CSS 引入顺序：`styles.css → experience.css → refinements.css → polish.css → mochi.css → mobile.css → theme.css → atelier.css`。**顺序有意义**，后面的覆盖前面的；`theme.css` 必须保持倒数第二（v1.19），`atelier.css` 必须最后（v1.22，它用 `order` 重排工坊并覆写主题表面）。
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
  - `autoBind(graph)` — 导入时把节点字段改写成占位符。**这是「正面提示词如何注入」的答案**：先从匹配 `/sampler/i` 的节点读 `positive`/`negative` 的 link 得到正负集合，再把第一个非负向的 encode 节点写成 `{{prompt}}`，其余写 `{{negative}}`，然后按 class_type 正则写死其余参数。**v1.15 起导入不再自动调用它**，只有 JSON 视图里的「联动到自动设置」按钮会调。

**提示词装配三件套（v1.18，移植自 st-chatu8 的 ComfyUI 面板）**

- `src/promptRules.ts`（243 行）— 规则引擎。
  - 规则行格式：`触发词 | 类型 | 内容`，**取最后一个 `|`** 分割；类型 ∈ `替换` / `前置前` / `前置后` / `后置前` / `后置后` / `最后置`。
  - 触发词可用 `|` 并列，`/…/` 包裹按正则（`gi`），否则字面匹配；`#` 开头是注释。
  - `applyRules(prompt, rulesText)` → `{modifiedPrompt, insertions, applied}`；`assemble(rules, assembly)` 按 `前置前 → before → 前置后 → modifiedPrompt → 后置前 → after → 后置后 → quality → 最后置` 拼接并 `dedupeTags`；`assembleNegative` 把 `qualityNegative` 提到最前。
  - `finalPrompt` / `finalNegative` 是 `generate()` 唯一入口，返回 `{text, rules}`。
  - **刻意没移植 `@if` 条件分支**（原版是 eval 级 `safeEvaluateIf`）。
- `src/promptPresets.ts`（195 行）— 三套命名集合：`prompt-fix-presets-v1`（固定块）/ `prompt-rule-presets-v1`（规则表）/ `prompt-profiles-v1`（整套 config，含 settings + workflowName），各 LIMIT 80。
- `src/PromptAssembly.tsx`（379 行）+ `src/prompt-assembly.css`（225 行）— 工坊里的「提示词装配」折叠卡，四栏文本框 + 规则表 + 三组 picker。挂在 `<PromptSection>` 之前。

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
| `PromptAssembly.tsx`（379 行，v1.18） | 工坊的「提示词装配」卡：四栏固定块 / 质量标签 + 替换规则表 + 三组预设 picker |
| `nodeSkip.ts`（157 行，v1.18） | 节点旁路：`applySkips` 剥 `_skip` 节点并重连下游、`skipStatus` 判可跳过、`graphStats` 数节点与连线 |
| `theme.ts` / `theme.css`（v1.19） | 五套主题：`pure` / `warm` / `mint` / `ink` / `night`。`theme.ts` 管 id 与 localStorage，`theme.css` 是变量 + 覆盖层（**必须倒数第二个 import**，见 `main.tsx`） |
| `atelier.css`（约 370 行，v1.22） | 工坊布局层：不改 DOM、只用 CSS Grid + `order` 重排 `.atelier-layout` 的子元素；手机单列「提示词 → 预览+生成按钮」、≥900px 两栏右栏 sticky；顺带把 `.studio-prompts` / `.render-panel` 从灰槽改成主题卡片。**必须最后一个 import** |
| `StudioNav.tsx`（约 100 行，v1.22 重写） | 画布快捷导航。修掉三个早已不存在的锚点（`studio-model` / `studio-loras` / `studio-generation`），改为 `studio-configuration` / `studio-workflow` / `studio-prompts` / `studio-render`，用 `essential` 标记决定「有工作流时是否显示」；手机端由 `atelier.css` 整体隐藏 |
| `Appearance.tsx`（59 行，v1.19） | 设置页「外观」行 + 五色选择弹层（`.theme-options[role=radiogroup]`） |
| `PromptEditor.tsx`（约 387 行） | 提示词编辑器。**v1.15 起只留**：文本/区块、翻译、历史、可复用区块、权重、撤销重做（语音助手、自动补全、Danbooru 联想、检查页全部移除） |
| `Glossary.tsx`（约 290 行，组件名 `Wardrobe`） | **v1.15 重写为素材库**：服装/场景/姿势/表情四货架，读 `src/data/wardrobe.json`。v1.16 加 `onDescribe`：选中整套后可「发送到画面描述」 |
| `ImageDetails.tsx`（约 180 行） | **v1.16 新增**：读图片的 `comfy_pocket` 元数据，列出正/负提示词与全部参数，两段各带复制。由 `Viewer.tsx` 的第五个动作按钮打开 |
| `imageBytes.ts` | `dataUrlBytes(url)`：base64 data URL → `Uint8Array` |
| `thumbnails.ts` | **v1.16 新增**：`createImageBitmap` + `OffscreenCanvas` 把网格图缩到长边 256（webp q=0.72），独立 8 MB 缓存 |
| `comfySocket.ts`（约 210 行） | **v1.16 新增**：直连 ComfyUI `/ws?clientId=`，解析实时进度、执行节点与二进制预览帧，断线指数退避重连 |
| `PromptStudio.tsx`（约 575 行） | 独立「提示词」页。v1.21 起模板区与「最近生成」都是折叠卡，画面描述与生成结果各带「翻译」入口 |
| `InstructionEditor.tsx`（174 行） | 「注入模板可查看可修改」实体 |
| `promptTemplates.ts`（约 400 行） | 模板 CRUD + skill 文件夹导入 + `defaultSystem()`。v1.21 追加 `templateName` / `newTemplate` / `duplicateTemplate` / `renameTemplate` / `exportTemplates` / `importTemplates` |
| `TemplateManager.tsx`（新，v1.21）+ `template-manager.css` | 模板管理弹层：新建 / 重命名 / 复制 / 删除 / 导出 JSON / 导入 JSON |
| `translate.ts`（新，v1.21） | API 翻译：`cleanAnswer` 去围栏与引号、`translationSystem` 明确「保留标签与权重只翻散文」、`translateWithApi` 复用 `llmChat` |
| `PromptTranslation.tsx`（约 273 行，v1.21 重写） | 翻译弹层，三档引擎 `auto`/`device`/`api`；`device` 是 Android 的 ML Kit，`api` 走 `translate.ts`，`auto` 先本机再 API |
| `llm.ts` / `promptOptimizer.ts` | OpenAI 兼容调用 / 提案校验 |
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
| `prompt-assembly` / `prompt-rules` | 提示词装配的四栏内容 / 规则表原文（v1.18） | `App.tsx` 两个 effect 直写 |
| `prompt-fix-presets-v1` / `prompt-rule-presets-v1` / `prompt-profiles-v1` | 固定块预设 / 规则预设 / 整套配置（各 ≤80） | `promptPresets.ts` |
| `prompt-templates-v1` | skill 模板（≤100，v1.21 起由 `TemplateManager.tsx` 增删改 + JSON 导入导出） | `promptTemplates.ts` |
| `prompt-default-system-v1` | 全局默认 system 指令 | `promptTemplates.ts` |
| `prompt-studio-history-v1` | 提示词页历史（≤30） | `PromptStudio.tsx` |
| `prompt-history-v1` / `prompt-blocks-v1` | 编辑器历史 / 可复用块 | `promptLibrary.ts` |
| `mochi-voice-draft-v1` | 助手草稿（**v1.15 起无写入方**） | 原 `PromptAssistant.tsx` |
| `mochi-update-auto` / `mochi-update-check` | 自动检查更新开关 / 上次检查时间 | `AppUpdater.tsx` |
| `mochi-theme` | **v1.19** 主题 id：`pure` / `warm` / `mint` / `ink` / `night`（默认 `pure`） | `theme.ts` 的 `THEME_KEY` |
| `inference-presets-v1` | 预设 | `presetStore.ts` |
| `model-favorites-v1` | 模型收藏（**v1.20 起 `StudioModels.tsx` / `ModelPicker.tsx` 已删，这一项彻底无人读写**） | — |
| `autocomplete-enabled` / `biometric-auto-prompt` / `size-presets` | 杂项（`autocomplete-enabled` **v1.15 起无写方**） | 各处 |

---

## 5. 构建 Android APK（唯一可用的链路）

工具链全部在 `D:\demo\toolchain` 和 `D:\demo\android-sdk`，**不在系统 PATH**。

```
D:\demo\toolchain\
  rustup\   cargo\   mingw64\   jdk17\jdk-17.0.20.1+1\   android-ndk-r27c\
D:\demo\android-sdk\  (build-tools 34/35/36, platform-tools, platforms)
```

### 一条命令

```powershell
cd D:\demo\Paint-v1
npx vite build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\_build\build-apk.ps1 `
  -Toolchain D:\demo\toolchain -Sdk D:\demo\android-sdk -Version <VER>
```

`build-apk.ps1` 一条龙跑完：前端产物检查 → `cargo build`（arm64 `.so`）→ `.so` 拷进 jniLibs 并 strip → `gradlew assembleRelease` → `apksigner` 签名 → 三件套校验（证书指纹 / versionCode / versionName）。任一道不符就 `Remove-Item $apk` 并 `exit 1`，脏包出不了 `dist-apk/`。

期望输出：

```
Signer #1 certificate SHA-256 digest: 9fe3dac1…bf9f
package: name='app.huihua.paint' versionCode='<10000 + minor*100 + patch>' versionName='<VER>'
APK  D:\demo\Paint-v1\dist-apk\huihua-<VER>-arm64.apk
大小 <bytes> 字节
SHA256 <64 hex>
```

> **必须用 `powershell.exe -File` 启动脚本**，不能直接 `pwsh .\script.ps1`（裸 `pwsh` 不在 PATH，且这些脚本依赖 Windows PowerShell 的环境变量继承行为）。
> 脚本末尾偶尔以 exit code 1 收尾，那只是最后一行提示走了 stderr；只要上面五行都打印出来、产物在 `dist-apk/` 里就是成功。

### 签名身份（不要换！）

- keystore：`_build/huihua-release.jks`，**PKCS12**，storepass `huihua2026`，key alias `huihua`，keypass 同 storepass。
- 证书：`CN=HuiHua Local Build`，SHA-256 `9fe3dac1f8807221bb66b8526b24684caa952a014d1e3fb219b831f40432bf9f`，SHA-1 `288a47d9be3794805970d2a6634807ba45b62115`。
- 1.0.0 / 1.1.0 / 1.1.1 / 1.1.2 / 1.1.3 / 1.14.0 / 1.15.0 / 1.16.0 / 1.17.0 **全部同一证书**，所以能原地覆盖升级。换 keystore = 用户必须卸载重装，别做。**1.17.0 第一次发布就是拿另一把密钥签的，直接翻车——详见 §9.8 的事故表。**
- `_build/build-apk.ps1` 已把「证书指纹必须等于 `$ExpectedCert`」和「versionCode 必须等于由 `package.json` 算出的 `$ExpectedCode`」做成硬性自检：不符就 `Remove-Item $apk` 再 `exit 1`，脏包出不了 `dist-apk/`。
- `*.jks` 在 `.gitignore` 里，**备份它**。别因为「这台机器上没有」就临时生成一把新的——仓库里的这一份才是唯一的合法签名身份。
- 老别名 `comfypocket` + 密码 `mochi2026` 会报 `UnrecoverableKeyException ... BadPaddingException`，别试。

### 验证三件套

```powershell
D:\demo\android-sdk\build-tools\35.0.0\apksigner.bat verify --print-certs dist-apk\huihua-<VER>-arm64.apk
D:\demo\android-sdk\build-tools\35.0.0\aapt2.exe dump badging dist-apk\huihua-<VER>-arm64.apk
Get-FileHash dist-apk\huihua-<VER>-arm64.apk -Algorithm SHA256
```

`aapt2` 期望：`package='app.huihua.paint' versionCode='<10000 + minor*100 + patch>'`（1.17.0 → `11700`）、`versionName='1.17.0'`、`application-label:'绘画'`。**签名的 DN / 证书指纹必须是上面那一串**，对不上就是这个包不能发。

### 验证前端真的被嵌进去了（唯一可靠方法）

APK 里 `.so` 的文本是 **brotli 压缩**的，grep 不到中文 UI 文案。只能对比 dist 产物 hash：

```powershell
# 解出 .so，用 Latin-1 读（UTF-8 解码会抛错）
$so = "...\lib\arm64-v8a\libhuihua_lib.so"
$text = [System.IO.File]::ReadAllText($so, [System.Text.Encoding]::GetEncoding(28591))
$text.Contains("index-XXXXXXXX.js")   # 必须 True
```

`index-XXXX.js` / `index-XXXX.css` 的 hash 来自 `dist/assets/` 的实际文件名。**第一次构建出的 .so 常常含着上一次的 hash**（增量编译没重跑前端嵌入），对不上就重跑 `build-apk.ps1`。

### 不要用的东西

`scripts/` 目录已在 v1.20 整份删除：里面 `build-android.ps1` 是 v0.x 遗留（引用 `libcomfy_pocket_lib.so`、`Mochi-*.apk`、alias `comfypocket`，跑不通），另外三个（`compile-glossary.py` / `compile-tags.py` / `whiten-css.mjs`）分别服务已删除的 `glossary.json`、`booru.tsv.gz` 和 v1.0 的纯白调色。需要构建就走 `_build/build-apk.ps1`。

---

## 6. 发版流程（每次迭代都走一遍）

### 6.1 bump 四个地方

写一个 `_build/bump-<VER>.mjs`（照抄 `_build/bump-1.19.0.mjs`）：

```
package.json                        "version": "X.Y.Z"
src-tauri/tauri.conf.json           "version": "X.Y.Z"
src-tauri/Cargo.toml                version = "X.Y.Z"
src-tauri/gen/android/app/tauri.properties
    tauri.android.versionName=X.Y.Z
    tauri.android.versionCode=<10000 + minor*100 + patch>   # 1.1.3 → 10103；1.14.0 → 11400；1.19.0 → 11900
```

versionCode 必须单调递增，否则 `AppUpdates.verify()` 会拒绝安装。注意 **1.14 走的是 minor=14**，所以 versionCode 是 `11400` 而不是 `10104`——规则里的 `minor` 是整段 minor 数字，不是它的个位数。

### 6.2 补 i18n 键

```powershell
node _build\find-orphans.mjs               # 扫源码里的孤儿导出（删文件后也可用它复查）
# 用 add-v119-strings.mjs 的写法（表格 [source, zh, en]）补齐
```

`add-*-strings.mjs` 会 JSON 解析 → 加键 → 按 key 排序 → 2 空格缩进重写，两个 locale 同时改。中文源串的 zh 填 `""` 时回退成 source 本身。v1.21 起两个 locale 各 **1081 键**。每版一个 `add-vXXX-strings.mjs`，用完就删（v1.20 清掉了 v1.13–v1.18 那七个，只留 `add-v119-strings.mjs` 作范例）。

### 6.3 测试 + 构建

```powershell
npx tsc -b          # 无输出
npx vitest run      # 17 files / 97 tests
npx vite build      # 记下 dist/assets/index-XXXX.js 和 .css 的 hash
```

### 6.4 出 APK（第 5 节），然后发布

写 `_build/publish-<VER>.cjs`（照抄 `publish-1.19.0.cjs`）：

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

（`_build/updatecheck.mjs` / `_build/togglecheck.mjs` 这两个 Playwright 脚本从来不在仓库里，弹窗文案靠 `tests/v119.spec.ts` 之外的手动截图确认。）

### 6.6 提交推送

```powershell
git add -A
git commit -m "feat(vX.Y.Z): ..."
git push origin main               # github.com:443 常被阻断，见下
```

push 失败的典型输出是 `fatal: unable to access ...: Failed to connect to github.com port 443 after 21072 ms` 或 `Recv failure: Connection was reset`。此时 `https://api.github.com` 通常还是通的（所以发布能走 API）。对策：

- `git config http.version HTTP/1.1` + `git config http.postBuffer 524288000`（已设），能解决大部分情况。
- 还不行就挂后台循环重试：`for ($i=1; $i -le 20; $i++) { git push origin main; if ($LASTEXITCODE -eq 0) { "pushed at try $i"; break }; Start-Sleep 30 }`，实测通常前三次内成功。
- 验证远端是否真收到：`GET https://api.github.com/repos/xxwzh66-byte/huihua/commits/main`（注意 API 可能滞后几秒，`git branch -vv` 显示前进后再查一次）。

**github.com:443 打不通时**（2026-10-31 实测就是这种环境，只有 api.github.com 通）：放弃 `git push`，改用 Git Data API 发版——脚本已经把「本地改动 → blob → tree → commit → fast-forward main → tag + Release」全做完：

```powershell
$env:GITHUB_TOKEN = "ghp_xxx"     # repo scope 的 PAT，本机没存过
node _build\probe-upstream.cjs    # 只读：看上游 main 在哪、tag 是否已存在
node _build\diff-vs-upstream.cjs  # 只读：确认没有会覆盖上游改动的冲突项
node _build\publish-<VER>.cjs --dry-run   # 本地复核 apk 的 sha256 / 证书 / versionCode，不碰远端
node _build\publish-<VER>.cjs             # 真发
```

顺带把 `README.md` 的标题、下载表、`adb install` 行、`### X.Y.Z` 更新内容节一起更新。

---

## 7. 测试

### 7.1 单测（vitest）

`vitest.config.ts`：`include: ["src/**/*.test.ts"]`，`setupFiles: ["src/testLocale.ts"]`（把 locale 钉在 `fr`，所以断言里是法语串）。

现有 19 个测试文件 / **101 个用例**，覆盖：`asyncPool` / `workflow` / `promptDocument` / `promptLibrary` / `promptWeights` / `promptRobustness` / `imageCache` / `metadata` / `importValidation` / `modelCompatibility` / `translation` / `experience` / `thumbnails`（v1.16）/ `comfySocket`（v1.16）/ `wardrobeNames`（v1.17）/ `promptRules`（v1.18）/ `nodeSkip`（v1.18）/ `translate`（v1.21）/ `promptTemplates`（v1.21）。

**没有覆盖**：`workflowBindings`（占位符替换！）、`workflowGraph`、`workflowLibrary`、`promptPresets`、`serverInventory`、`llm`。这几个是最该补单测的地方，尤其 `resolveGraph` / `autoBind`——它们是唯一决定「发出去的图对不对」的逻辑。

### 7.2 E2E（Playwright）

`playwright.config.ts`：`testDir: "tests"`，端口 `PAINT_TEST_PORT || 14420`，`webServer: npm run dev`（`reuseExistingServer: false`，**跑之前先杀掉占用 14420 的进程**），viewport 390×844。

**v1.14 新增并通过的**：`tests/v114.spec.ts`（4 用例）+ `tests/v114-harness.tsx`（内联 7 节点 fixture，KSampler 的 `sampler_name`/`scheduler` 故意留空）。覆盖：图标节点与 9 条连线、未选中时无参数面板、点节点才展开 6 个可编辑字段 + 4 条 `.node-link`、空 select 的占位 option、缩放按钮、工作流命名保存与覆盖保存。

**v1.15 新增并通过的**：`tests/v115.spec.ts`（4 用例）。覆盖：新装直落工坊且无引导步骤、导航第五项文案、素材库四货架 + 搜索 + 选中写进提示词、编辑器只剩文本/区块/翻译/权重（无语音入口、无补全开关、无联想气泡）、导入工作流不改原字段。

**v1.16 新增并通过的**：`tests/v116.spec.ts`（2 用例）。覆盖：素材库选中整套 → 点「发送到画面描述」→ 落到提示词页的画面描述框；图库打开看图 → 「查看详细提示词」→ 弹层列出正/负提示词、模型、LoRA。**e2e 里的假 PNG 必须自己算 CRC32 并带 `IHDR`+`IDAT`**，只塞 `tEXt` 的图会让 `createImageBitmap` 解码失败，缩略图永远停在「加载中」、`.image-button` 不渲染。

**v1.18 新增并通过的**：`tests/v118.spec.ts`（3 用例）。覆盖：装配卡把固定块 + 质量标签 + 替换规则合成后写进 `{{prompt}}`（断言 POST 到 `/api/prompt` 的 body）、勾掉 ImageScale 后发送的图里没有节点 7 且节点 8 直连节点 6、固定块预设保存后能重新选中。
- 写这个 spec 的两个坑：①`.assembly-toggle small` 的「命中 N 条」是拿 `settings.positive` 去跑规则的，**提示词没写之前永远是「命中 0 条」**，断言必须先填提示词；②要验证「发出去的东西」，就在 `page.route("**/__native")` 里把 `command === "api" && args.path === "/api/prompt"` 的 body 收集起来，别去解析 UI。

**v1.19 新增并通过的**：`tests/v119.spec.ts`（3 用例）。覆盖：图库每一格真正解码（`.gallery-card img` 的 `naturalWidth > 0`、`.image-placeholder` 计数 0）、结果面板只有两个按钮且 `aria-label` 恰为 `["收藏此结果","删除此结果"]`、语言是静态 `简体中文` 行且外观选择器 5 项、选 `night` 后 `localStorage["mochi-theme"] === "night"` 且 reload 后仍生效。
- 两个坑：①`boot()` 里不能在每次 `addInitScript` 都 `localStorage.clear()`，否则 reload 用例读不到刚写的主题 → 用 `sessionStorage["v119-seeded"]` 只播种一次；②断言 `aria-label` 要写**中文**（页面 locale 是 zh-CN），不是法语源串。

**跑法**：`npx playwright test`（全量）。v1.20 删掉四份过期 spec 后，`tests/` 里只剩维护中的 6 个 spec + `v114-harness.tsx`，全量跑完 **20 passed / 约 25 s**，不再挂死。跑之前必须先杀 14420 端口（`playwright.config.ts` 里 `reuseExistingServer: false`）：

```powershell
Get-NetTCPConnection -LocalPort 14420 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
npx playwright test
```

**已删除的过期 spec（v1.20）**：`app.spec.ts`、`studio-settings.spec.ts`、`catalog.spec.ts` + `catalog-harness.tsx`、`onboarding.spec.ts`、`optimizer.spec.ts` + `optimizer-harness.tsx`、`prompt-library.spec.ts` + `prompt-harness.tsx`、`v14.spec.ts` + `v14-harness.tsx`、`connections.spec.ts`、`android-assistant.mjs`。它们依赖的都是 v1.0–v1.17 期间就删掉的东西（`activate_profile` / `list_profiles` / `/bridge/*` / `Reprendre la configuration` / 整页 Onboarding / `src/ModelImports`），修的成本远高于重写，所以整份移除。要参考写法就看现存的六个 spec。

**v1.21 新增并通过的**：`tests/v121.spec.ts`（3 用例）。覆盖：工坊「翻译提示词」快捷按钮 → 弹层里把引擎切到 API → mock 的 `llm_chat` 返回带 ```` ``` ```` 围栏的译文 → 断言围栏被 `cleanAnswer` 去掉且 `.translation-engine-used` 显示「经由 API」→ 插入后正向提示词被替换；模板管理弹层的新建 / 重命名 / 复制（`副本` 排在最前，因为列表是新的在前）/ 导出（下载文件名 `huihua-templates.json`）/ 删除；模板卡与「最近生成」卡默认折叠、点 heading 展开、eyebrow 显示 `1 条`。

肉眼确认 UI 的老办法（`_build/v121-shot.mjs`）见第 8 节。

**v1.22（工坊布局重构）没有新增 spec**：那次只动 CSS（`src/atelier.css`）+ `StudioNav.tsx` 的锚点，20 个既有用例仍全部通过——这本身就是回归证据，因为 `.generate-bar` / `.prompt-entry` / `.card-heading` 都靠 DOM 顺序工作，用 `order` 重排后它们的位置变了但选择器不变。布局的肉眼复核走 `_build/v122-shot.mjs`（四档宽度）+ `v122-measure.mjs`（打印每个子元素的 `order` / `grid` / 坐标）+ `v122-theme.mjs`（五套主题色值探针），细节见 §9.12。

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
- **点侧边导航要用 `page.evaluate`**（v1.21 起）：`main#main.page-window` 覆盖在 `aside nav` 上方，`click()` 与 `click({ force: true })` 都会超时。改成 `page.evaluate(() => document.querySelectorAll("aside nav button")[i]?.click())`，顺序是 工坊 / 提示词 / 图库 / 素材库 / 设置。
- **折叠卡的内容区不能写裸 `display`**（v1.21 踩过）：`.card-content { display: grid }` 会压过浏览器内置的 `[hidden] { display: none }`，折叠就失效。一律写 `.card-content:not([hidden])`。
- 设置页的分组是 `<details class="settings-group">`，**不展开时内部 DOM 根本不存在**，先点 `summary`。
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

v1.14.0 的 APK 已构建并签名：`dist-apk/huihua-1.14.0-arm64.apk`（77 186 815 字节，versionCode `11400`，证书 SHA-256 `9fe3dac1…bf9f`，与 1.1.3 同指纹，可直接覆盖升级）。发行说明草稿在 `_build/release-1.14.0.md`（v1.20 起只保留当前版本的 `release-1.19.0.md`，历史草稿已删）。

**构建顺序有一个坑**：`cargo build`（不是 `tauri build`）不会跑 `beforeBuildCommand`，但 `build.rs` 仍会在**编译时**把 `../dist` 烘进 `.so`。所以必须 `npx vite build` → 再构建 `.so`（如今的 `build-apk.ps1` 已把这一步排好）。顺序反了会打进旧前端（UI 看起来没变，或直接白屏）。跑 `node _build\v119-verify-apk.mjs` 可以自检：它读当前 `dist/assets` 的全部哈希文件名，检查是否出现在 `libhuihua_lib.so` 里，缺一个就 exit 1。

---

## 9.6 v1.15 变更清单（本轮迭代）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 导入工作流不再自动联动 | `App.tsx` `importFile()` | 删掉 `autoBind(w)`：导入只做 `parseWorkflow` + `checkWorkflow`，字段原样保留，提示改为「工作流已导入。」。「联动到自动设置」按钮（JSON 视图）仍保留，成为唯一的显式联动入口 |
| 2 | 删进 APK 的引导步骤 | 删 `Onboarding.tsx` + `Onboarding.css`；`App.tsx` 删 `setupStep`/`setupOpen`/`paint-setup` 监听/`return <Onboarding …>` 分支 | 首次启动直接进工坊（无 server 则落设置页）。`Welcome.tsx` 保留（它只是「还没连服务器」的空态，不是步骤引导），但文案里的 Danbooru/术语表改成素材库 |
| 3 | 修生图后卡死 | `useGenerationSession.ts` | 见下 |
| 4 | 术语表 → 素材库 | `Glossary.tsx` 全量重写 + `src/data/wardrobe.json`（164 KB，新）+ 删 `src/data/glossary.json`；`App.tsx` 标题/副标题/导航 label；`PromptSection.tsx` 按钮；`experience.test.ts` 第 4 个用例 | 四货架：服装 17 组 558 套 5434 标签、场景 7 组 45 套 190、姿势 24 组 500 套 2219、表情 5 组 32 套 205。数据由 `D:\demo\_anima_build.mjs` 从 Comfyui-Anima-Wardrobe 的 `anima_presets.json` 生成（MIT，lingdongbudong） |
| 5 | 提示词编辑器瘦身 | `PromptEditor.tsx` / `PromptTools.tsx` / `PromptSection.tsx`；删 `usePromptSuggestions.ts`、`tags.worker.ts`、`caret.ts`、`PromptAssistant.tsx` | 去掉语音助手入口与弹层、自动补全开关、Danbooru 联想气泡、`Vérifier`（检查）页与 `.prompt-conflict` 行。剩下：文本/区块分段、翻译、历史、可复用区块、权重、撤销重做 |
| 6 | 版本 + i18n | `_build/bump-1.15.0.mjs` / `_build/add-v115-strings.mjs`（v1.20 已删） | 1.15.0 / versionCode `11500`；locale 950 → **967** 键 |

**「生图后卡死」的根因**（`src/useGenerationSession.ts`）：

轮询 effect 的依赖数组里带着 `onOnline` 和 `onError`，而这两个是 `App.tsx` 里每次渲染都新建的内联箭头函数。于是**任何**一次 `setState`（进度、phase、preview、results…）都会让 effect 拆除再重建：`stopped` 翻 true → `clearTimeout` → 新 effect 里 `void poll()` 立刻再发一轮 `/api/queue` + `/api/history`。生成过程中本来每 1.5 s 一轮，这下变成「每次渲染一轮」，请求量随渲染次数平方级上涨，UI 线程被 promise 回调占满——表现就是出图后界面卡住不动。

修法三条：
1. `onOnline` / `onError` 存进 `onlineRef` / `errorRef`（每次渲染同步赋值），effect 依赖里去掉它们；
2. 新增模块级 `busy` 锁：`poll()` 开头 `if (busy.current …) return`，`finally` 释放。被拆掉的旧循环若还有请求在飞，新循环不会叠上去；
3. `savedImages` 集合去重，避免重叠轮询把同一张图重复交给 `persist()` 写两遍相册。

**回归用例**：`tests/v115.spec.ts`（4 个，全绿）覆盖「新装首启无引导」「素材库四货架 + 选中写进提示词」「编辑器无语音/无补全/无气泡/两按钮」「导入不改字段」。

**构建产物**：`dist-apk/huihua-1.15.0-arm64.apk`（75 204 351 字节，versionCode `11500`，SHA-256 `9b86385a6838c3f30a5fdde3c4bca9754ad58517cd7d0a76167f99aa4102554b`，签名证书 SHA-256 `9fe3dac1…bf9f`，与 1.1.2 / 1.1.3 / 1.14.0 同指纹可覆盖升级）。发行说明在 `_build/release-1.15.0.md`（v1.20 已删）。

**v1.15 顺手做的 CSS 清理**（6 个文件，40 余行死规则）：`.suggestion-bubble` / `.suggestion-dock` / `.suggestion-heading` / `.tag-option` / `.tag-suggestions` / `.tag-dot` / `.category-*` / `.autocomplete-setting` / `.editor-hint` / `.voice-entry` / `.prompt-conflict` / `.prompt-issues` / `.prompt-check-description`。另外 `src/experience.css` 的 `.editor-paper textarea { padding-bottom: 175px }` 改回 `23px`（那 175px 原本是给联想气泡让位）。清理脚本：`_build/clean-v115-css*.mjs`（5 个，按行/按块两套手法）。

---

## 9.7 v1.16 变更清单（本轮迭代）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 缩略图真缩 | 新增 `src/thumbnails.ts`；`Picture.tsx`、`components.tsx`、`App.tsx` `resetSession()`；新增 `src/thumbnails.test.ts` | 原来拼 `?thumb=1`，ComfyUI 不认这个参数、照样回原图，24 MB LRU 两三张就满。现在 `createImageBitmap` + `OffscreenCanvas` 在本地缩到长边 256（webp q=0.72），独立 8 MB 缓存。`fitSize`/`shrink`/`thumbnailImage`/`clearThumbnailCache` |
| 2 | 实时进度（WebSocket） | 新增 `src/comfySocket.ts`；`useGenerationSession.ts` 加独立 effect；`tauri.conf.json` CSP `connect-src` 加 `ws: wss:`；新增 `src/comfySocket.test.ts` | 之前进度是假的（`setProgress` 只在 0/100 两处调用），预览靠轮询 `/api/history` 里的 temp 图。现在直连 `/ws?clientId=`，解析 `progress`/`progress_state`/`executing`/`execution_start`/`execution_error`，二进制帧取 `PREVIEW_EVENT=1` 的预览（8 字节头 + PNG/JPEG/WEBP）。socket 有真帧时轮询不许覆盖（`socketPreview` ref）。重连退避 1s→15s |
| 3 | 素材库发送到画面描述 | `Glossary.tsx` 加 `onDescribe` + `chosen` state + `describe()`；`App.tsx` `describeDraft`；`PromptStudio.tsx` `draft` prop | 选中整套后多一个「发送到画面描述」按钮，把条目的中文 label 用「，」拼成一句话，跳到提示词页填进「画面描述」框。`id: Date.now()` 保证同样内容连发两次也能触发 |
| 4 | 看图可查详细提示词 | 新增 `src/ImageDetails.tsx`、`src/imageBytes.ts`；`Viewer.tsx` 加第五个动作按钮 | 按钮在每个图的查看器里，读 PNG 的 `comfy_pocket` tEXt chunk，列出正/负提示词 + 模型/尺寸/步数/CFG/采样器/调度器/种子/LoRA/VAE/来源，两段提示词各带一键复制。**注意 Viewer 的 return 改成 fragment**：`<dialog>` 不能可靠地嵌套 `showModal()`，弹层必须挂在 Viewer 的 Modal 旁边而不是里面 |
| 5 | 版本 + i18n | `_build/bump-1.16.0.mjs` / `_build/add-v116-strings.mjs`（v1.20 已删） | 1.16.0 / versionCode `11600`；locale 968 → **983** 键 |

**顺手修的 i18n/样式**：`.glossary-selection .describe-send`（选中条第三个按钮）；`.image-details` 整套（弹层 `min(560px, 100%-24px)`、`.detail-text` `max-height:32vh`、`.detail-rows` 用 1px gap 做分隔线）。

**回归用例**：`tests/v116.spec.ts`（2 个，全绿）覆盖「素材库选中 → 发到画面描述 → 提示词页收到」「图库打开看图 → 详细提示词弹层显示银色头发/模型/LoRA」。e2e 里生成 PNG 必须自己算 CRC32 且带 `IHDR`+`IDAT`，只塞 `tEXt` 的假 PNG 会让 `createImageBitmap` 解码失败、缩略图永远停在「加载中」、`.image-button` 不渲染。

**还没在真机验证的**：CSP 加了 `ws:` 只在重新构建 APK 后生效，真 ComfyUI 上的 ws 进度与预览也还没实测。

**构建与发布**：`dist-apk/huihua-1.16.0-arm64.apk`（75 204 351 字节，versionCode `11600`，SHA-256 `1717561e846eadb2173d5d96ee22b1cc7e693164212273291be39ef9ad0478d9`，签名证书与前几版同指纹）。构建顺序仍是 `npx vite build` → cargo → copy_so → gradle → apksigner 四步（v1.20 起这四步收进 `_build/build-apk.ps1` 一条命令）；嵌入校验：`dist/assets` 下 15 个文件全部出现在 `libhuihua_lib.so` 里。
提交 `1843a8c`（feat(v1.16)…）+ `9e7ef75`（chore(release)），tag `v1.16.0` 指向 `1843a8c`，Release id `428033193`。

---

## 9.8 v1.17 变更清单（本轮迭代）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 素材库全中文 | 新增 `src/wardrobeNames.ts`、`src/data/wardrobe.{a,b,c,d}.*.json`（7 个中文名分片）、`src/wardrobeNames.test.ts`；`Glossary.tsx` 全部渲染点走 `display()` | 8048 条标签全部有中文名，**英文原值保持不动**：生成提示词仍然发英文 label。`display()` 只影响渲染层，`hitFor()`/`describe()` 里的 `prompt` 始终是英文 |
| 2 | 中英日三路搜索 | `src/wardrobeNames.ts` 的 `searchText()`；`Glossary.tsx` 的 `matches()` | 同时匹配中文名、英文原名、罗马音别名（`sailor dress` / `sailor` / `seifuku` 都能命中） |
| 3 | 整套双路发送 | `Glossary.tsx` 的 `describe()`；`PromptStudio.tsx` 的 `insertDraft()` + 新按钮；`App.tsx` `describeDraft` 类型改成 `{ text, prompt }` | 「发送到画面描述」给中文句子（`text`）+ 英文标签草稿（`prompt`）；「按英文标签填入正向提示词」直接把英文标签写进正向提示词。两条路互不覆盖 |
| 4 | 分类/分组中文化 | `Glossary.tsx` 面包屑与 `.theme-choices` 分组条 | 都走 `groupLabel()`/中文映射，缺中文名回退英文原名 |
| 5 | 版本 + i18n | `_build/bump-1.17.0.mjs`、`_build/check-i18n-1.17.0.cjs`（v1.20 已删） | 1.17.0 / versionCode `11700`；locale 983 → **986** 键（中英法三语对齐，`t()` 引用 0 缺失） |

**校验**：`node node_modules/typescript/bin/tsc -b` 无输出；`vitest run` 15 文件 / **75 测试**全绿（新增 `src/wardrobeNames.test.ts` 20 条）；`vite build` 通过；校验脚本（v1.20 已删）当年输出 en 986 / zh 986 / 缺失 0。

**网络环境实测（2026-10-31，这台机器）**：
- `github.com:443` **连不上**（`curl` 21s 超时，`git push` 走不通），`git` 还会先报 `schannel: CRYPT_E_REVOCATION_OFFLINE (0x80092013)`——想绕过就用 `git config --global http.schannelCheckRevoke false` 或 `curl --ssl-no-revoke`。
- `api.github.com`、`codeload.github.com`、`objects.githubusercontent.com`、`ssh.github.com:443` **都通**。
- 当年（1.17.0）绕过的办法是用一个走 Git Data API 的发布脚本直接建 blob → tree → commit → fast-forward `main` → 建 tag + Release，只需要 api.github.com。v1.18 起网络恢复，改回 `git push` + `publish-<VER>.cjs`（只上传 asset），`publish-1.17.0.cjs` 已在 v1.20 删除。
- 写权限 token 靠**设备码登录**拿（本机没有 `gh`，`github.com/login/device/code` 偶尔抖动，脚本里带 8 次重试）：`node _build/gh-login-and-publish.cjs` 打印 `user_code`，浏览器打开 <https://github.com/login/device> 输入授权 GitHub CLI，token 落到 `_build/.ghtoken`（已 gitignore，40 字符，`gho_` 前缀），随后自动发版。要换账号就删掉这个文件重跑。

**1.17.0 发布结果**：上游 `main` 从 `a6dbaff` 一路前进（`389144c` 首发 → 补正文 → 补发版脚本 → tag 平移），Release id **`429714462`**，tag `v1.17.0`，`draft=false / prerelease=true`（原因见下），无 APK 资产。页面：<https://github.com/xxwzh66-byte/huihua/releases/tag/v1.17.0>。
**确切的当前 sha 不要看这里**（每改一次文档再发一次就变），跑 `node _build/verify-release.cjs` 看实时值：它打印 tag / main 指向、`package.json` 版本、`src/wardrobeNames.ts` 是否在位；`node _build/show-release-body.cjs` 抓回 Release 正文。
- 当年那个发布脚本已幂等：树和上游一致就跳过提交，且会把已存在的 tag `force` 平移到最新提交（Release PATCH 不会移动 tag）。连跑两次第二次只打印「与上游一致 → 跳过提交」，已实测。
- 为什么是 `prerelease` 而不是 `draft`：`AppUpdates.kt:89` 同时跳过 `draft` 和 `prerelease`，两者都不会被应用内更新推给用户；但 `draft` 在 Releases 页不显示，`prerelease` 显示。第一次发成 `draft`（id `429713828`）已删除。
- **本地 sha 与上游不同**：上游那两个提交是 Git Data API 直接造的，本地工作副本还是 `331516f` / `52ec453` / `f87f746`，树内容一致但 sha 不同。`github.com` 不通没法 `git fetch` 对齐，下一轮用 `_build/diff-vs-upstream.cjs` 按 blob sha 比对即可，不用担心「本地落后」。
- `_build/probe-upstream.cjs` 只读探测上游状态；`_build/diff-vs-upstream.cjs` 对比本地 HEAD 与上游 main 的 blob sha，确认没有「上游已改过、本地要覆盖」的冲突（1.17.0 结果：`changed=23 identical-to-upstream=0 upstream-moved=0`）。

**构建产物（1.17.0 最终版，签名已修正）**：`dist-apk/huihua-1.17.0-arm64.apk`（75 269 887 字节，versionCode **`11700`**，versionName `1.17.0`，SHA-256 `8aa2c691e35a3bfcd0ca9559fbb22eb7ac4046bdb48542ecc17770b6542b687a`，**签名证书 SHA-256 `9fe3dac1f8807221bb66b8526b24684caa952a014d1e3fb219b831f40432bf9f`**，与 1.0 → 1.16 全部版本同指纹，可直接覆盖升级）。`dist/assets` 下 8 个 js/css 全部 embedded 进 `libhuihua_lib.so`。

### ⚠️ 1.17.0 第一次发布的重大事故：签名换错了

第一版 `huihua-1.17.0-arm64.apk`（`sha256:158413f8…3add`，Release id `429714462`）是**用另一把临时密钥签的**：

| | 历史版本 1.0–1.16（正确） | 出事的那个 1.17.0 包 |
| --- | --- | --- |
| 证书 SHA-256 | `9fe3dac1f8807221bb66b8526b24684caa952a014d1e3fb219b831f40432bf9f` | `593b14d8843cef2a41658e25b577bbf1943c60ff4c38406b83a60a8c31c89844` |
| 证书 DN | `CN=HuiHua Local Build, OU=Local, O=HuiHua, L=Local, ST=Local, C=CN` | `CN=huihua, OU=huihua, O=huihua, L=CN, ST=CN, C=CN` |
| versionCode | `11700` | `1017000`（错把 minor 当成 1.17 而不是 17） |

后果：老用户**覆盖安装必然失败**（`INSTALL_FAILED_UPDATE_INCOMPATIBLE` / 「应用未安装」）。发行说明里当时还写了「这一版的签名换了，请先卸载旧版」——那是把事故当成了正常变更，完全错误。

**根因**：那份工作是在另一台机器上做的，那台机器既没有 `D:\demo\toolchain` / `D:\demo\android-sdk`，也没有 `_build/huihua-release.jks`，于是有人新生成了一把 keystore 把包签了。keystore 一直好好躺在仓库里，只是那台机器没拿到。

**三个永久教训（已写进构建脚本自检）**：
1. **签名证书必须恒等于 `9fe3dac1…bf9f`**。`_build/build-apk.ps1` 现在签名后读 `apksigner verify --print-certs` 比对 `$ExpectedCert`，不符就删包 `exit 1`，传不上去。
2. **versionCode 规则是 `10000 + minor*100 + patch`，minor 是整段数字**：1.17.0 → `11700`，不是 `1017000`、也不是 `10107`。脚本从 `package.json` 的 `$Version` 正则算出 `$ExpectedCode`，并对 `tauri.properties` 做前置检查，不符直接拒绝构建。
3. **`src-tauri/gen/android/app/tauri.properties` 不在 git 里**，每次 bump 必须手改 `versionName` + `versionCode`，漏改就会把上一版的 versionCode 打进新包（Gradle 读它，不读 package.json）。

**修正动作**：改 `tauri.properties` 为 `1.17.0 / 11700` → 真 keystore 重签 → 替换 Release 资产 + 正文（正文里「签名换了请卸载」那段已改写成「直接覆盖安装即可」）。


## 9.9 v1.18 变更清单（本轮迭代：工坊改造）

灵感来自 `github.com/damoshen123/st-chatu8` 的 ComfyUI 面板（SillyTavern 扩展）。**只搬了四个机制，没有搬它的框架**：它是单文件 5 MB 的 `index.js` + jQuery，与 Tauri/React 无关；可复用的是「提示词在离开客户端前被装配」这一层。

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 提示词装配卡 | 新增 `src/promptRules.ts`（规则引擎）、`src/PromptAssembly.tsx` + `src/prompt-assembly.css`（UI）；`App.tsx` 挂 `<PromptAssembly>` 在 `<PromptSection>` 之前 | 四栏：前置固定 / 后置固定 / 质量标签（正面）/ 质量标签（负面）。工作流里的 `{{prompt}}` 收到的是装配后的结果，不是 `settings.positive` 原文 |
| 2 | 替换规则引擎 | `src/promptRules.ts` 的 `applyRules` / `assemble` / `assembleNegative` / `finalPrompt` / `finalNegative` | 每行 `触发词 | 类型 | 内容`，取**最后一个** `|` 切分；类型 ∈ `替换` / `前置前` / `前置后` / `后置前` / `后置后` / `最后置`；触发词可用 `|` 并列，`/…/` 包裹按正则。**刻意不移植 st-chatu8 的 `@if` 条件**（原实现是 eval 级 `safeEvaluateIf`）。新增 `dedupeTags()` 去重与空白归一 |
| 3 | 三套命名集合 | 新增 `src/promptPresets.ts`；`PromptAssembly.tsx` 的三个 picker | `prompt-fix-presets-v1`（固定块）、`prompt-rule-presets-v1`（规则表）、`prompt-profiles-v1`（整套 config，含 settings + workflowName）。各 LIMIT 80 |
| 4 | 节点跳过 / 旁路 | 新增 `src/nodeSkip.ts`；`WorkflowCanvas.tsx` 加 `.node-skip` 开关与 `.graph-node.skipped` 虚线；`App.tsx` 的 `generate()` 在 `resolveGraph` 之后调 `applySkips` | 节点上写 `_skip: true`，发送前剥掉并把消费者重连真实上游（`resolveSource` 按输出类型打分，`guard > 64` 防环）。等价于 st-chatu8 的 `processSkippedNodes`，但这里是纯函数 |
| 5 | 画布工具条计数 | `WorkflowCanvas.tsx` 的 `.canvas-count` | 由「N 个节点 · N 个占位符」扩为「N 个节点 · N 个占位符 · N 条连线 · N 个已跳过」（后两项仅在非零时出现），`graphStats()` 提供 |
| 6 | 版本 + i18n | `_build/bump-1.18.0.mjs`、`_build/add-v118-strings.mjs`（v1.20 已删） | 1.18.0 / versionCode **`11800`**；locale 986 → **1026** 键（新增 40 条） |

**装配顺序**（`assemble`）：`前置前 → before → 前置后 → modifiedPrompt → 后置前 → after → 后置后 → quality → 最后置`，空槽折叠后 `dedupeTags`。
**负面装配**（`assembleNegative`）：`qualityNegative` 提到最前，其余同序。
**生成链交给服务器的是**：`resolveGraph(custom, {positive: finalPrompt(...), negative: finalNegative(...)})` → `applySkips(...)` → `checkWorkflow` → `POST /api/prompt`。`rememberPrompt` 也存装配后的结果。

**校验**：`npx tsc -b` 无输出；`npx vitest run` **17 文件 / 97 测试**全绿（新增 `src/promptRules.test.ts` 14 条、`src/nodeSkip.test.ts` 8 条）；`npx vite build` 通过（`index-CN2jNNnd.js` 473 808 B / `index-4xTMGQ37.css` 117 390 B / `Glossary-*.js` 583 kB）；`npx playwright test tests/v114 tests/v115 tests/v116 tests/v118` → **13 passed**。
- 顺手补了个类型缺口：`NodeInfo` 原来没有 `output` 字段，`nodeSkip.ts` 读 `info[classType].output` 只能靠 `as` 硬转，`nodeSkip.test.ts` 的 fixture 直接被 TS2353 拦下。已在 `src/api.ts:35-42` 给 `NodeInfo` 加上 `output?: unknown`（注释写明是给旁路重连用的）。

**e2e 覆盖（`tests/v118.spec.ts`，3 例）**：
1. 装配卡把固定块 + 质量标签 + 规则合成后写进 `{{prompt}}`：断言 `posted[0].prompt["2"].inputs.text === "solo, masterpiece, 1girl, beret, best quality"`。
2. 跳过的节点不进服务器：勾选 ImageScale 后生成，断言 `prompt["7"] === undefined` 且 `prompt["8"].inputs.images === ["6", 0]`。
3. 固定块预设保存后能被重新选中（picker 2 个 option，选中后 textarea 回填）。

**已知取舍**：
- 装配卡只在工坊页，`PromptStudio`（LLM 生成那页）不经过它。
- 规则表的「替换」是大小写不敏感的全局替换，中文触发词同样有效。
- `Describe`（素材库发到画面描述）与装配卡互不感知：素材库写的是 `settings.positive`，装配卡再包一层。

**同轮追加：详细提示词可编辑 / 复制全部 / 写回工坊**
- `src/ImageDetails.tsx` 加 `onApply?: (positive, negative) => void`，并新增 `editing` / `positive` / `negative` 三个 state。
- 两段提示词由 `<pre>` 改为「`<pre>` ↔ `<textarea className="detail-edit">`」二选一；`editing` 由底部「编辑」按钮切（文案 `Modifier` ↔ `Fin de l'édition`）。
- 新增 `.detail-actions` 四个按钮：编辑 / 还原（`dirty` 时出现，把两个值复位成 PNG 里的原文）/ 复制全部 / 写回工坊。
- 「复制全部」拼 `Prompt positif:` + `Prompt négatif:` + 十行参数为纯文本，一次复制整份。
- 「写回工坊」走 `Viewer` 的新 prop `onApplyPrompt` → `App.tsx` 里 `setSettings(s => ({...s, positive, negative}))` + `setImported(null)` + `setViewer(null)` + `setTab("create")` + Toast「提示词已写回工坊。」。
- **编辑只改这里的副本，不回写图片文件**（弹层底部有 `.detail-hint` 明确写这句）。要让 `Viewer` 的 `return` 继续保持 fragment，`<dialog>` 不能嵌套 `showModal()`。
- i18n `_build/add-v118b-strings.mjs`（v1.20 已删）：+7 条，locale 1026 → **1033** 键。
- e2e `tests/v116.spec.ts` 新增第 3 例「the detailed prompt can be edited, copied and pushed to the studio」：断言初始无 `.detail-edit`、点编辑后 textarea 有值、`fill` 新词后「复制全部」读出剪贴板含新词与参数、点「还原」回到 `quiet library`、再改后「写回工坊」使弹层关闭且 `.prompt-entry.positive-entry` 含 `neon city`。**3 passed（18.5s）**。
  - 读剪贴板要先 `page.context().grantPermissions(["clipboard-read","clipboard-write"])`。

---

## 9.10 v1.19 变更清单（本轮迭代：图库 / 实时预览 / 主题 / 结果简化）

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 图库取不到图片 | `src/thumbnails.ts` 的 `decode()` 加 `data:` 短路 | `imageUrl()` 返回的是 `data:` URL，旧实现 `await fetch(url)` 被 CSP `connect-src`（只有 `'self' ipc: http://ipc.localhost ws: wss:`，**没有 `data:`**）拦掉 → 每格 `.catch()` 显示占位。改为 `<img>` + `.decode()`，落在 `img-src`（含 `data:`）内 |
| 2 | 工坊实时预览做不到 | `src-tauri/gen/android/app/build.gradle.kts` 的 `manifestPlaceholders["usesCleartextTraffic"]` 由 `"false"` 改 `"true"` | **这才是根因**：debug 分支原本就是 `true`，只有 release 是 `false`，于是 release APK 里明文 `ws://` 被 Android 系统直接掐掉；Rust 侧 reqwest 自带协议栈所以从没察觉。v1.16 往 CSP 里加 `ws: wss:` 一直没用，因为根本不是 CSP 的事 |
| 3 | 结果只要收藏 + 删除 | `src/App.tsx` 的 `.result-actions` | 三个按钮（Masquer / Favori / Masquer）→ 两个（`收藏此结果` / `删除此结果`）。**都只写本地**：`dismissResult` 从 `results` 移除，`resultAction("trash")` 写 `removed:<server>` 集合，服务器 output 目录不动 |
| 4 | 语言只留中文 + 外观多选项 | `src/LanguagePicker.tsx` 改静态行；新增 `src/theme.ts` / `src/theme.css` / `src/Appearance.tsx`；`Connections.tsx` 挂 `<Appearance>`；`App.tsx` 持有 `theme` state | 语言只是**收窄 UI**，`Locale` 类型仍保留 `fr`/`en`（`src/testLocale.ts` 钉在 `fr`，17 个测试文件依赖法语源串）。主题五套：`pure`（默认，与原纯白一致）/ `warm` / `mint` / `ink` / `night`（暗色） |
| 5 | 自动检查更新是否有用 | 核查结论：**有用** | `src-tauri/pocket-plugin/android/.../AppUpdates.kt`（256 行）是真实现：拉 GitHub releases → 校验 asset 名 `huihua-${tag}-arm64.apk`、`sha256:` digest、size 1..250 MB → 下载 → `verify()` 比对长度 + sha256 + `getPackageArchiveInfo` 的包名/longVersionCode/versionName + 签名证书 → FileProvider（`${applicationId}.updates`）安装。`UpdateProvider` 与 `res/xml/update_paths.xml` 都在 |

**night 主题白块攻坚**（本轮最耗时的一段，改主题前必读）：
- 为什么难：全仓硬编码 `#ffffff`/`#fff` 共 **103 处**，其中两处带 `!important`（`src/mochi.css:1260-1264` 的 `.connection-form`、`.selected`/`.segmented button[aria-pressed="true"]` 用 `var(--lavender)`）；另外 `src/mochi.css:18-20` 自定义了 `--canvas` / `--field` / `--lavender` 三个 token，`theme.css` 一开始只改 `--surface*`，所以那批仍是白的。
- 修法三条：①`:root` 里把 `--canvas`/`--field`/`--lavender` 重指到 `var(--bg)` / `var(--surface-soft)`；②单类覆盖常用白底；③对双类选择器（`.prompt-studio .studio-block`、`.studio-imports > .save-preset-shortcut`）用 `html[data-theme]` 前缀提高特异性压回去。全部堆在 `src/theme.css` 末尾，不动其他 CSS 文件。
- 排查手法：Playwright 探针遍历 `body *`，取 `getComputedStyle().backgroundColor`，`lum = 0.299r+0.587g+0.114b > 200` 且可见且尺寸 ≥30×14 的列出来。修到只剩 `nav-icon`（已透明）与 `button.primary`（night 下 `--accent` 本就是浅色，设计意图）为止。
- **`theme.css` 必须是 `main.tsx` 里最后 import 的样式表**，否则被 `mochi.css` 覆盖。

**校验（v1.19）**：`npx tsc -b` 无输出；`npx vitest run` **17 文件 / 97 测试**全绿；`npx vite build` 通过（`index-qEtYj87a.js` 473.75 kB，`Glossary-*.js` 582.94 kB 有 >500 kB 警告，非阻塞）；`npx playwright test tests/v114 tests/v115 tests/v116 tests/v118 tests/v119` → **17 passed（24.9s）**。
- 版本：1.19.0 / versionCode **11900**（`_build/bump-1.19.0.mjs`）；locale 1033 → **1042** 键（`_build/add-v119-strings.mjs`，+9：`简体中文` / 五个主题名 / `Supprimer` / `Supprimer du résultat` / `Rafraîchissement automatique`）。

**构建产物（v1.19.0）**：`dist-apk/huihua-1.19.0-arm64.apk`，**75 253 503 字节**，`versionCode='11900'` / `versionName='1.19.0'`，证书 `9fe3dac1…bf9f`，APK SHA-256 `44792687f76ab380164b3d323a6797b62a46cd67792cc99119d2681469498cdb`。构建链：`npx vite build` → `_build/build-apk.ps1 -Toolchain D:\demo\toolchain -Sdk D:\demo\android-sdk -Version 1.19.0`（cargo + gradle 一次跑完，2m42s，三道自检全过）。`_build/v119-verify-apk.mjs` 确认 `dist/assets` 下 14 个文件全部嵌进 `libhuihua_lib.so`。发布：`node _build/publish-1.19.0.cjs`（上传前本地复核 SHA-256 / 证书 / versionCode，任一不符不碰远端）。

**已知取舍**：
- 「删除」仍只是**本地隐藏**，服务器 output 目录不动（v1.14 起如此，没有 `/api/history` 的删除接口）。
- 实时预览的修复**只在 release 构建层面**，尚未在真机上验证过一次完整的 socket 预览；另外 Rust 侧没有 WebSocket 实现（离线 cargo registry 里没有 `tokio-tungstenite`），所以仍然走 WebView 直连。
- 主题只覆盖到当前存在的页面；以后新加的组件如果写死 `#fff`，night 下还会白，记得用 `var(--surface*)`。



## 9.11 v1.20 变更清单（清理）与 v1.21 变更清单（翻译 / 模板 / 折叠）

### v1.20：删不必要文件

一次性脚本 `_build/cleanup-1.20.mjs`（跑完即删）用 `git rm -f` 移走 **95 条路径**，四类：

| 类别 | 例子 | 为什么 |
| --- | --- | --- |
| 死源码 | `src/StudioModels.tsx`、`src/ModelPicker.tsx`、`src/llmAdapter.ts`、`src/tags.ts` | 引用数 0，或只剩桶文件 re-export / 已过期 spec |
| 死数据 | `src/data/booru.tsv.gz`（1.9 MB）、`booru.json`、`assets/brand/mochi.png`（1.1 MB）、`expressions/closed.webp`、`languages/*` | 运行时 0 引用（Danbooru 离线索引在 v1.15 换成素材库后就没人查了） |
| 一次性脚本 | `scripts/` 四件、`_build` 下 6 个 `add-*-strings` / 7 个 `bump-*` / 5 个 `clean-v115-css*` / 6 个旧 `publish-*` / 7 个旧 `release-*.md` / `cargo_android.ps1`+`copy_so.ps1`+`gradle_assemble.ps1` | 每版用完即弃；构建链已收进 `build-apk.ps1` |
| 过期 e2e | `app.spec.ts`、`studio-settings.spec.ts`、`catalog.spec.ts`（+harness）、`onboarding.spec.ts`、`optimizer.spec.ts`（+harness）、`prompt-library.spec.ts`（+harness）、`v14.spec.ts`（+harness）、`connections.spec.ts`、`android-assistant.mjs` | 依赖 v1.0–v1.17 已删的东西，修不如重写 |

连带改动：`src/components.tsx` 只剩 `export { shortName } from "./modelNames";`；`src/modelNames.ts` 只留 `shortName`（删 `modelPath`）；三个测试文件删掉 4 条只测搜索的用例（97 → **93**）。

**两个误删，已用 `git checkout HEAD -- <path>` 恢复**：`tests/fixtures/{parameters.jpg,plain.jpg}`（`src/metadata.test.ts` 要读）与 `_build/{diff-vs-upstream,show-release-body,gh-login-and-publish}.cjs`（HANDOFF §9.8 有引用）。教训：删之前对 `tests/fixtures` 与 `_build` 里的运维脚本再 grep 一遍**文件名**，不要只 grep import 路径。

### v1.21：翻译走 API + 模板管理 + 折叠

| # | 需求 | 落点 | 说明 |
| --- | --- | --- | --- |
| 1 | 翻译可调 API | `src/translate.ts`（新）+ `src/PromptTranslation.tsx` 重写 | 之前只有 Android 的 ML Kit（`src-tauri/src/translation.rs` 在非 Android 直接报「只能在 Android 上用」）。新引擎复用已配置的 `llmChat`：`translationSystem()` 明确要求「Danbooru 标签 / `<lora:…>` / `(tag:1.2)` / 括号逗号换行原样保留，只翻自然语言，只回答译文」。三档 `auto`/`device`/`api`，`auto` 先本机再 API，所以桌面也能用 |
| 2 | 翻译对准提示词 | `PromptSection.tsx`（整段）、`PromptStudio.tsx`（画面描述 + 生成结果）、`ImageDetails.tsx`（图库详情正/负段）、`PromptEditor.tsx`（选中片段，原有） | 全部走同一个 `PromptTranslation` 弹层，方向按用途预选（→English / →中文） |
| 3 | 折叠 | `CollapsibleCard.tsx` 加 `defaultOpen`；`PromptStudio.tsx` 模板区与「最近生成」改成折叠卡 | 模板卡的 eyebrow 显示当前模板名 / `{n} 个可用` / `未使用`，「最近生成」显示 `{n} 条` |
| 4 | 模板方案保存 | `src/TemplateManager.tsx`（新）+ `template-manager.css`（新）+ `promptTemplates.ts` 加 7 个导出 | 新建 / 重命名 / 复制（`· 副本`、`· 副本 2`）/ 删除 / 导出全部 JSON / 导入 JSON；存储仍是 `prompt-templates-v1`（上限 100）。导入接受三种外形（包装对象 / 裸数组 / 单条），按 name 去重 |

**校验（v1.21）**：`npx tsc -b` 无输出；`npx vitest run` **19 文件 / 101 测试**全绿（新增 `src/translate.test.ts` 3 条、`src/promptTemplates.test.ts` 5 条）；`npx vite build` 通过；`npx playwright test` 全量 **20 passed（24.5s）**（新增 `tests/v121.spec.ts` 3 条）。版本 1.21.0 / versionCode `12100`（`_build/bump-1.21.0.mjs`）；locale 1042 → **1081** 键（`_build/add-v121-strings.mjs`，+39）。

**两个坑（v1.21）**：
1. **`[hidden]` 会被自己的 `display` 规则打败**。给折叠卡内容写 `.template-slot .card-content { display: grid }` 后，折叠再也不会生效——浏览器内置的 `[hidden] { display: none }` 特异性比不过类选择器。必须写成 `.card-content:not([hidden])`。
2. **e2e 里点导航按钮要用 `page.evaluate`**。`main#main.page-window` 覆盖在 `aside nav` 上方，`click()` 和 `click({ force: true })` 都会等到超时；改成 `page.evaluate(() => document.querySelectorAll("aside nav button")[i]?.click())` 立刻生效。

**构建产物与发布（1.21.0）**：

- `dist-apk/huihua-1.21.0-arm64.apk`，**75 253 503 字节**，versionCode `12100` / versionName `1.21.0`，证书 SHA-256 `9fe3dac1…bf9f`（与 1.0.0 起所有版本同一张证书，可覆盖升级），APK SHA-256 `d28e382deb2746fd2a63ea9077fcd9e873ac9557bd6f386249e565cb7a469164`。
- `dist/assets` 下 14 个文件全部嵌入 `libhuihua_lib.so`（解 apk → zip → `Expand-Archive` → node 用 latin1 读 so 比对文件名）。
- 发布：`node _build/publish-1.21.0.cjs`（`--dry-run` 只做本地四项复核）。Release id `433880470`，tag `v1.21.0` → `89055b3`，`draft=false / prerelease=false`，asset 75 253 503 B digest 与本地一致。
- **这台机器上 `build-apk.ps1` 会卡在 Gradle 那一步**，原因不是脚本：Java 在这台机器上**无法写入 `C:\Users\32978` 下任何目录**（`%TEMP%`、`.gradle`、家目录全被拒，`RandomAccessFile` 直接 `FileNotFoundException: 拒绝访问`）。绕法是换 `GRADLE_USER_HOME` 到可写盘，并绕开 wrapper 自带的锁文件：

  ```powershell
  $env:JAVA_HOME='D:\demo\toolchain\jdk17\jdk-17.0.20.1+1'
  $env:ANDROID_HOME='D:\demo\android-sdk'; $env:ANDROID_SDK_ROOT='D:\demo\android-sdk'
  $env:GRADLE_USER_HOME='D:\demo\_tmp\gradle'; $env:TEMP='D:\demo\_tmp'; $env:TMP='D:\demo\_tmp'
  cd D:\demo\Paint-v1\src-tauri\gen\android
  & 'C:\Users\32978\.gradle\wrapper\dists\gradle-8.14.3-bin\cv11ve7ro1n3o1j4so8xd9n66\gradle-8.14.3\bin\gradle.bat' --no-daemon -g D:\demo\_tmp\gradle assembleRelease
  ```

  即：**直接调 gradle 发行版的 `gradle.bat`，不要调 `gradlew.bat`**（wrapper 要在 `~/.gradle` 里建 `.lck`，必然被拒）。cargo 那步不受影响。签名的三步照旧手跑：
  `apksigner sign --ks _build\huihua-release.jks --ks-key-alias huihua --ks-pass pass:huihua2026 --key-pass pass:huihua2026 --out dist-apk\huihua-<VER>-arm64.apk <unsigned.apk>`。
  另外 `vim` 提示 `Unable to initialize metrics, ensure C:\Users\32978\.android is writable` 是同一个权限问题的无害副产物，可以忽略。



## 9.12 v1.22 变更清单（工坊布局重构）

用户只说了一句「重构工坊界面的布局排版，自行决定」。结论：**不改 DOM 顺序**，因为 5 份 spec 里几十个选择器（`.generate-bar` / `.prompt-entry` / `.card-heading` 文案 / `.assembly-*`）都挂在现有结构上；改 CSS 的 `order` 更省事也更好回退。

### 手机（<900px）单列顺序

| 次序 | 元素 | 原因 |
| --- | --- | --- |
| 1 | `button.studio-pc` 服务器胶囊 | 留在顶部，随时能点开连接面板 |
| 2 | `.configuration-slot` 预设 | 选模型/尺寸是最先要做的事 |
| 3 | `.studio-prompts` 提示词卡 | 写作区上移，负向与快捷按钮同屏 |
| 4 | `.render-panel` 实时预览 + `.generate-bar` | **关键**：原来生成条在整页最底（要滑约 1300 px），现在紧跟提示词 |
| 5-7 | `#studio-workflow` / `.assembly-slot` / `.import-summary` | 低频操作沉到底部，且都是折叠卡 |
| 8 | `.studio-imports` | 一次性的「从图像取参数 / 存预设」 |

≥900px 两栏：第 1 行 `studio-pc | configuration-slot`，第 2 行起左栏提示词 → 工作流 → 装配 → 导入摘要，右栏 `.render-panel` `grid-row: 2 / span 6` + `position: sticky; top: 16px`。≥1280px 列宽 `1.14fr / 0.86fr`。

### 三个刻意的取舍（都试过别的写法）

- **手机上的生成条是 `position: fixed`**。static 要滑才能按（原来的病）；sticky 在空态时压在预览上方挡内容。最终 fixed 到底栏上方 `bottom: calc(86px + var(--safe-bottom))`，同时 `.atelier-layout { padding-bottom: 132px }` 让最后一张卡（`.studio-imports`）也能滚出来、不藏在条下面。桌面 `min-width:900px` 里才改回 `position: sticky; bottom: 16px`。
- **手机上隐藏 `StudioNav` 快捷栏**（`.studio-quick-nav.studio-quick-nav { display: none }`）。底栏已五个入口、生成按钮就在预览卡里，那根 38 px 悬浮竖条只剩遮挡作用。桌面/平板保留。
- **`.studio-prompts` 从裸 section 变成卡片**（`var(--surface-soft)` + 1px `var(--line)` + 18px 圆角 + 14px padding）。原来它没有背景，正面/负面两个白框浮在页面上，与下面「实时预览」的灰槽不是一套语言。

### 必须记住的特异性

`src/theme.css` 里有一批 `html[data-theme] .x`（特异性 0,2,1）会压过普通 `.atelier-layout > .x`（0,2,0）。所以 `atelier.css` 里对 `.studio-pc.studio-pc`、`.render-panel.render-panel`、`.generate-bar.generate-bar`、`.prompt-entry.prompt-entry` 重复写类名提权；反过来，主题相关的两个补丁要写 `html[data-theme] …` 版本：
- `html[data-theme] .atelier-layout > .render-panel > .generate-bar > .primary { color: var(--swatch) }` —— 否则 night 下白字贴浅灰底（`src/mochi.css:1997` 写死了 `color: white`）；
- `html[data-theme] .sidebar.sidebar` 与 `.nav.active .nav-icon` —— `src/mochi.css:201-220` 硬编码 `#f0f0f0` / `#dedede`，night 下底栏是亮的。

### 校验数字

- 手机 `390×844`：整页 1374 px（原 1390），生成条 `position: fixed`、高 64 px、`bottom: 86px`，预览卡顶 540（原 905）。
- 平板 `768×1024`：单列，预览卡顶 613。
- 桌面 `1180×900`：两栏，左栏 516 px / 右栏 496 px，预览卡顶 240、高 433。
- 宽屏 `1440×1000`：左 573 / 右 433。
- 五套主题探针（`_build/v122-theme.mjs`）全过：pure 白、warm `rgb(246,239,227)`、mint `rgb(242,250,246)`、ink `rgb(247,248,250)`、night `rgb(34,38,46)` 底 + `rgb(232,233,238)` 字，无白块。
- locale：`zh-CN.json` / `en.json` 各 **1083 键**（v1.22 补 `Workflow`、`Prompts` 两条 nav 标签）。

### 构建产物与发布（1.22.0）

- 产物 `dist-apk/huihua-1.22.0-arm64.apk`，**75 253 503 字节**，`versionCode='12200'` / `versionName='1.22.0'`，证书 `9fe3dac1…bf9f`，APK SHA-256 `28c198c6172d102350b7a6a456ff50d3a2cde8d6a5d7ea8f2ce007d6059f23ad`。
- 本轮 `build-apk.ps1` 卡在两步，都得手工绕过（跟脚本无关，还是那台机器 JVM 的权限问题）：
  1. **cargo 链接阶段**：`Cannot create temporary file in C:\Users\32978\AppData\Local\Temp\: Permission denied` → 先设 `$env:TEMP` 与 `$env:TMP` 为 `D:\demo\_tmp` 再跑脚本。
  2. **gradlew**：`PKIX path building failed`（wrapper 想下载 gradle 但走不通）→ 直接调已解压好的发行版：`gradle-8.14.3\bin\gradle.bat --no-daemon -g D:\demo\_tmp\gradle assembleRelease`，`GRADLE_USER_HOME` 也指到 `D:\demo\_tmp\gradle`。
- 之后手工签名 + 三件套校验，与脚本第 5-7 步完全相同。
- 嵌入校验：`dist/assets` 下 14 个文件全部能在 `jniLibs/arm64-v8a/libhuihua_lib.so` 里找到（`missing: 0`）。
- 发布：`node _build/publish-1.22.0.cjs`（上传前本地复核 SHA-256 / 证书 / versionCode），Release id **434708672**，digest 校验通过。
- push 这次遇到新的 schannel 错：`CRYPT_E_NO_REVOCATION_CHECK` → `git -c http.schannelCheckRevoke=false -c http.sslVerify=false push origin main` 一次过。

### 顺带修掉的东西

- `StudioNav.tsx` 的三个死锚点（v1.20 清理后 `studio-model` / `studio-loras` / `studio-generation` 在 `src/` 里 grep 计数为 0）。现在 `sections` 四项、`essential` 标记控制可见性，滚动高亮逻辑未变。
- 复核脚本：`_build/v122-shot.mjs`（四档全页图）、`v122-measure.mjs`（逐元素 top/h/order/grid 与视口截图）、`v122-bar.mjs`（单量生成条）、`v122-theme.mjs`（五主题色值探针）、`v122-scroll.mjs`（三个滚动位置）。都 mock `**/__native`，注意响应要包一层 `{ value: … }`（`src/api.ts` 的 `native()` 取 `json.value`）。


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
- **导航按钮点不动（截图脚本专用坑）**：`main#main.page-window` 会拦截 `aside nav button` 的指针事件，`click()` 与 `click({force: true})` 都会超时。必须用 DOM 直点：`await page.evaluate(i => { const b = document.querySelectorAll("aside nav button"); b[i < 0 ? b.length - 1 : i]?.click(); }, index)`。导航顺序：工坊 / 提示词 / 图库 / 素材库 / 设置。
- **设置页分组要点开才渲染**：`<details class="settings-group">` 不展开时内部 `.switch-row` / `.setting-row` 都不在 DOM 里，先 `summary.click()` 再取。
- **`theme.css` 必须最后 import**（`src/main.tsx` 末尾），否则被 `mochi.css` 里那些 `background: #fff` 覆盖；新组件别写死白色，用 `var(--surface)` / `var(--surface-soft)` / `var(--bg)`。

---

## 11. 现在缺什么（v1.21 之后重核，按优先级）

> 这一节在 v1.15 发版后重新逐条核对过代码，不是沿用旧结论。标注「✅已核实」的都跑过 grep / 读过实现；标注「✅ v1.16 已做」的是那一轮补掉的。v1.21 又重核了一遍剩下的条目。

### P0 — 真正卡住体验的三条

1. ~~**进度是假的，也没有实时预览**~~ ✅ **v1.16 已做；v1.19 修掉真机失效的根因**
   - 现在 `src/comfySocket.ts` 直连 `/ws?clientId=`，`progress` → 真实百分比、`executing` → 「节点 N」、二进制 `PREVIEW_EVENT=1` 帧 → 预览图（`socketPreview` ref 保证不被轮询快照覆盖）。CSP 已加 `ws: wss:`。
   - **v1.19 找到真凶**：`src-tauri/gen/android/app/build.gradle.kts` 的 `manifestPlaceholders["usesCleartextTraffic"]` 在 release 下是 `"false"`（debug 是 `"true"`），于是 release APK 里明文 `ws://` 被 Android 系统直接掐掉——改 CSP 当然没用。现已统一改为 `"true"`。
   - 剩下要做的：真机上实测一次完整 socket 预览（1.19 只在构建层面修了，尚未跑通一次真机预览）。若仍不通，再考虑 Rust 侧 `tokio-tungstenite` 的 B 方案——注意离线 cargo registry 里没有这个 crate。

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

7. **无 CI** ✅已核实（e2e 已在 v1.20 修好）
   - `tests/` 现在只剩 6 个维护中的 spec，全量 `npx playwright test` **20 passed / 约 25 s**，不再有红。
   - 但 `.github/` 目录仍然不存在，没有 CI。补 CI 的性价比最高：`tsc -b` + `vitest run` + `vite build` 三件套，十几行 YAML，能拦住本次这类回归（v1.14 的 COMBO 解析、v1.15 的轮询卡死都是单测能拦的）。

### P2 — 能更好

8. `resolveGraph` / `autoBind` 没有单测——最该补的两个函数。
9. **死代码清单**（`_build/find-orphans.mjs` 扫出来的）—— **v1.20 已整批清理，下表只剩结论**：

   | 文件 | 状态 |
   | --- | --- |
   | ~~`src/StudioModels.tsx`~~ | **v1.20 已删**。v1.1.3 删 `SettingsPanel` 后它就没人 import，内部还调 v1.0 就没了的 `/bridge/model-info`、`/bridge/model-favorites` |
   | ~~`src/ModelPicker.tsx`~~ | **v1.20 已删**。只被 `src/components.tsx` 桶文件 re-export，`<ModelPicker>` 全项目 0 处渲染 |
   | ~~`src/llmAdapter.ts`~~ | **v1.20 已删**。0 处引用 |
   | ~~`src/tags.ts`~~ / ~~`src/data/booru.tsv.gz`~~ / ~~`src/data/booru.json`~~ | **v1.20 已删**（连同 `scripts/compile-tags.py`）。删完后 `experience.test.ts` / `promptLibrary.test.ts` / `promptRobustness.test.ts` 里那 4 条只测搜索的用例一并移除，测试数 97 → 93 |
   | ~~`assets/brand/mochi.png`~~（1.1 MB）/ `mochi.webp` / `languages/*` / `expressions/closed.webp` | **v1.20 已删**，全 0 引用。`open.webp`（`App.tsx:70` header）与 `sad.webp`（`MochiMascot.tsx:1`）保留 |
   | `src/workflow.ts` 的 `buildWorkflow` | 只剩定义 + 单测，产品代码无调用方 |
   | `src/workflowGraph.ts` 的 `layoutGraph` | **不是孤儿**：`WorkflowCanvas.tsx:124` 用它算节点坐标（`WorkflowCanvas.tsx:23` import） |
   | ~~`src/PromptAssistant.tsx`~~ | v1.15 已删 |

   注意 `src/testLocale.ts` 由 `vitest.config.ts` 引用、`src/vite-env.d.ts` 是类型声明——这两个不算孤儿，别删。
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
