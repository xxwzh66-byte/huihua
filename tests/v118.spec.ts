import { test, expect, type Page } from "@playwright/test";

/**
 * v1.18 brings four things learned from the ComfyUI panel of st-chatu8:
 *  - a prompt assembly card (fixed blocks + quality tags + rule sheet),
 *  - the composed text, not the raw settings, is what {{prompt}} receives,
 *  - nodes can be skipped and are rewired before the graph is sent,
 *  - saved collections for blocks, rule sheets and whole setups.
 * Everything runs against a mocked native bridge, so no ComfyUI is required.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: {
      required: {
        ckpt_name: [["sd_xl_base_1.0.safetensors", "anima.safetensors"], {}],
      },
    },
    output: ["MODEL", "CLIP", "VAE"],
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: {
      required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] },
    },
    output: ["CONDITIONING"],
  },
  EmptyLatentImage: {
    class_type: "EmptyLatentImage",
    input: {
      required: {
        width: ["INT", { min: 64, max: 4096, step: 8 }],
        height: ["INT", { min: 64, max: 4096, step: 8 }],
        batch_size: ["INT", { min: 1, max: 8 }],
      },
    },
    output: ["LATENT"],
  },
  KSampler: {
    class_type: "KSampler",
    input: {
      required: {
        model: ["MODEL", {}],
        seed: ["INT", { min: 0, max: 18446744073709551615 }],
        steps: ["INT", { min: 1, max: 150 }],
        cfg: ["FLOAT", { min: 0, max: 30 }],
        sampler_name: [["euler_ancestral", "dpmpp_2m"], {}],
        scheduler: [["normal", "karras"], {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
        denoise: ["FLOAT", { min: 0, max: 1 }],
      },
    },
    output: ["LATENT"],
  },
  VAEDecode: {
    class_type: "VAEDecode",
    input: { required: { samples: ["LATENT", {}], vae: ["VAE", {}] } },
    output: ["IMAGE"],
  },
  ImageScale: {
    class_type: "ImageScale",
    input: {
      required: {
        image: ["IMAGE", {}],
        upscale_method: [["nearest-exact", "bilinear"], {}],
        width: ["INT", {}],
        height: ["INT", {}],
      },
    },
    output: ["IMAGE"],
  },
  SaveImage: {
    class_type: "SaveImage",
    input: {
      required: { images: ["IMAGE", {}], filename_prefix: ["STRING", {}] },
    },
    output: [],
  },
};

/** The prompt card drives `{{prompt}}`; `{{negative}}` feeds the other encoder. */
const bound = {
  "1": {
    class_type: "CheckpointLoaderSimple",
    inputs: { ckpt_name: "{{model}}" },
  },
  "2": {
    class_type: "CLIPTextEncode",
    inputs: { text: "{{prompt}}", clip: ["1", 1] },
  },
  "3": {
    class_type: "CLIPTextEncode",
    inputs: { text: "{{negative}}", clip: ["1", 1] },
  },
  "4": {
    class_type: "EmptyLatentImage",
    inputs: { width: "{{width}}", height: "{{height}}", batch_size: "{{batch}}" },
  },
  "5": {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      seed: "{{seed}}",
      steps: "{{steps}}",
      cfg: "{{cfg}}",
      sampler_name: "{{sampler}}",
      scheduler: "{{scheduler}}",
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
      denoise: 1,
    },
  },
  "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  "7": {
    class_type: "ImageScale",
    inputs: {
      image: ["6", 0],
      upscale_method: "nearest-exact",
      width: 1024,
      height: 1024,
    },
  },
  "8": {
    class_type: "SaveImage",
    inputs: { images: ["7", 0], filename_prefix: "ComfyPocket/ComfyPocket" },
  },
};

function answer(command: string, args: Record<string, unknown> | undefined) {
  if (command === "lock_status")
    return {
      supported: false,
      available: false,
      enabled: false,
      unlocked: true,
      delay: 0,
      hideRecents: false,
      autoPrompt: false,
    };
  if (command === "restore") return "http://192.168.1.8:8188";
  if (command === "image" || command === "save_image") return "";
  if (command === "update_action")
    return { supported: false, phase: "idle", available: false };
  if (command === "llm_get")
    return { base_url: "", model: "", temperature: 0.7, has_key: false };
  if (command === "api") {
    const path = (args?.path as string) ?? "";
    if (path === "/api/system_stats")
      return {
        system: {
          os: "linux",
          comfyui_version: "0.3.40",
          python_version: "3.12",
        },
        devices: [
          {
            name: "cuda:0 NVIDIA GeForce RTX 4090",
            type: "cuda",
            vram_total: 25757220864,
            vram_free: 23113478144,
            torch_vram_total: 25757220864,
            torch_vram_free: 23113478144,
          },
        ],
      };
    if (path === "/api/object_info") return info;
    if (path === "/api/queue") return { queue_running: [], queue_pending: [] };
    if (path.startsWith("/api/history")) return {};
    if (path === "/api/prompt") return { prompt_id: "run-1" };
  }
  return {};
}

/** Every prompt body the app posts to /api/prompt, in order. */
async function boot(page: Page, workflow = bound) {
  const posted: Record<string, unknown>[] = [];
  await page.route("**/__native", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.command === "api" && body.args?.path === "/api/prompt")
      posted.push(body.args.body as Record<string, unknown>);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ value: answer(body.command, body.args) }),
    });
  });
  await page.addInitScript((graph) => {
    localStorage.clear();
    localStorage.setItem("mochi-language", "zh-CN");
    localStorage.setItem("mochi-update-auto", "false");
    localStorage.setItem(
      "settings",
      JSON.stringify({
        model: "sd_xl_base_1.0.safetensors",
        sampler: "euler_ancestral",
        scheduler: "normal",
      }),
    );
    localStorage.setItem(
      "workflow-library-v1",
      JSON.stringify([
        { id: "w1", name: "人像质感", at: Date.now(), nodes: 8, graph },
      ]),
    );
  }, workflow);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 15000 });
  await page.waitForTimeout(800);
  return posted;
}

/** The assembly card sits above the prompt card and starts collapsed. */
async function openAssembly(page: Page) {
  const card = page
    .locator(".collapsible-card")
    .filter({ has: page.locator(".card-heading", { hasText: "提示词装配" }) });
  await card.locator(".card-heading button").click();
  await page.waitForTimeout(250);
  return card;
}

test("the assembly card composes fixed blocks and rules into {{prompt}}", async ({
  page,
}) => {
  const posted = await boot(page);

  // Select the saved workflow so the graph carries the {{prompt}} placeholder.
  const shelf = page
    .locator(".collapsible-card")
    .filter({ has: page.locator(".card-heading", { hasText: "API 工作流" }) });
  await shelf.locator(".card-heading button").click();
  await page.waitForTimeout(250);
  await shelf.locator(".shelf-picker select").selectOption("w1");
  await page.waitForTimeout(400);

  const card = await openAssembly(page);
  const fields = card.locator(".assembly-field textarea");
  await expect(fields).toHaveCount(4);
  // A fixed prefix, a quality suffix and one replacement rule.
  await fields.nth(0).fill("masterpiece");
  await fields.nth(2).fill("best quality");
  await card.locator(".assembly-toggle").click();
  await page.waitForTimeout(200);
  await card
    .locator(".assembly-rules")
    .fill("hat | 替换 | beret\n1girl | 前置前 | solo");
  // Nothing matches yet because the prompt box is still empty.
  await expect(card.locator(".assembly-toggle small")).toContainText("命中 0 条");

  // The preview shows the composed text before any request is made.
  await expect(card.locator(".assembly-final code")).toContainText("masterpiece");

  // Write a prompt, then both rules fire.
  await page.locator(".prompt-entry.positive-entry").click();
  await page.waitForTimeout(300);
  const editor = page.locator(".prompt-editor textarea").first();
  await editor.fill("1girl, hat");
  await page.locator(".prompt-editor .editor-footer .primary").click();
  await page.waitForTimeout(400);
  await expect(card.locator(".assembly-toggle small")).toContainText("命中 2 条");

  await page.locator(".generate-bar .primary").click();
  await page.waitForTimeout(900);
  expect(posted.length).toBe(1);
  const sent = posted[0] as {
    prompt: Record<string, { inputs: Record<string, string> }>;
  };
  // Rules run first (hat → beret), then the slots wrap the result.
  expect(sent.prompt["2"].inputs.text).toBe(
    "solo, masterpiece, 1girl, beret, best quality",
  );
});

test("a node can be skipped and never reaches the server", async ({ page }) => {
  const posted = await boot(page);
  // The saved graph is loaded on demand from the shelf.
  const shelf = page
    .locator(".collapsible-card")
    .filter({ has: page.locator(".card-heading", { hasText: "API 工作流" }) });
  await shelf.locator(".card-heading button").click();
  await page.waitForTimeout(250);
  await shelf.locator(".shelf-picker select").selectOption("w1");
  await page.waitForTimeout(500);

  // Toolbar counts both nodes and wires.
  const toolbar = page.locator(".canvas-count");
  await expect(toolbar).toContainText("8 个节点");

  // Tap the upscale node (a chain node, so it may be bypassed).
  const scale = page
    .locator(".graph-node")
    .filter({ hasText: "ImageScale" })
    .first();
  await scale.click();
  await page.waitForTimeout(300);
  const skip = page.locator(".node-skip input");
  await expect(skip).toBeEnabled();
  await skip.check();
  await page.waitForTimeout(300);
  await expect(page.locator(".graph-node.skipped")).toHaveCount(1);
  await expect(toolbar).toContainText("1 个已跳过");

  await page.locator(".generate-bar .primary").click();
  await page.waitForTimeout(900);
  expect(posted.length).toBe(1);
  const sent = posted[0] as { prompt: Record<string, { class_type: string }> };
  // Node 7 is gone and node 8 now reads the VAEDecode output directly.
  expect(sent.prompt["7"]).toBeUndefined();
  expect(
    (sent.prompt["8"] as unknown as { inputs: Record<string, string[]> }).inputs
      .images,
  ).toEqual(["6", 0]);
});

test("the fixed block and rule sheet can be saved and recalled", async ({
  page,
}) => {
  await boot(page);
  const card = await openAssembly(page);
  await card.locator(".assembly-field textarea").nth(0).fill("cinematic");
  await card.locator(".assembly-name").fill("电影感");
  await card
    .locator(".assembly-bar button")
    .filter({ hasText: "保存" })
    .first()
    .click();
  await page.waitForTimeout(300);

  // Clearing then picking the preset restores the block.
  await card.locator(".assembly-field textarea").nth(0).fill("");
  await page.waitForTimeout(150);
  const picker = card.locator(".assembly-picker select").first();
  await expect(picker.locator("option")).toHaveCount(2);
  const value = await picker.locator("option").nth(1).getAttribute("value");
  await picker.selectOption(value as string);
  await page.waitForTimeout(250);
  await expect(card.locator(".assembly-field textarea").nth(0)).toHaveValue(
    "cinematic",
  );
});
