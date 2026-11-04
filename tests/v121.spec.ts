import { test, expect, type Page } from "@playwright/test";

/**
 * v1.21 ships three things worth pinning down:
 *  - translation can now run through the configured chat API, so it works on
 *    desktop builds too (the device engine is Android-only),
 *  - the prompt template block is a real manager: create, rename, duplicate,
 *    delete, export and import, all stored on the device,
 *  - the long prompt page folds its blocks instead of stacking them.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors"], {}] } },
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: {
      required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] },
    },
  },
  KSampler: {
    class_type: "KSampler",
    input: {
      required: {
        model: ["MODEL", {}],
        seed: ["INT", { min: 0, max: 18446744073709551615 }],
        steps: ["INT", { min: 1, max: 150 }],
        cfg: ["FLOAT", { min: 0, max: 30 }],
        sampler_name: [["euler_ancestral"], {}],
        scheduler: [["normal"], {}],
        positive: ["CONDITIONING", {}],
        negative: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}],
        denoise: ["FLOAT", { min: 0, max: 1 }],
      },
    },
  },
};

const SERVER = "http://192.168.1.8:8188";

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
  if (command === "restore") return SERVER;
  if (command === "image" || command === "save_image") return "";
  if (command === "update_action")
    return { supported: false, phase: "idle", available: false };
  if (command === "llm_get")
    return {
      base_url: "https://api.example.com/v1",
      model: "gpt-4o-mini",
      temperature: 0.7,
      has_key: true,
    };
  if (command === "llm_chat") {
    // The app sends [system, user]; echo a canned translation so the dialog can
    // show something and the insert path can be exercised.
    const messages = (args?.messages as { role: string; content: string }[]) ?? [];
    const asked = messages[messages.length - 1]?.content ?? "";
    const kept = /blue sky/.test(asked) ? "blue sky" : "";
    return { content: "```\n" + (kept || "silver hair, quiet library") + "\n```", model: "gpt-4o-mini" };
  }
  if (command === "api") {
    const path = (args?.path as string) ?? "";
    if (path === "/api/system_stats")
      return {
        system: { os: "linux", comfyui_version: "0.3.40", python_version: "3.12" },
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
  }
  return {};
}

async function boot(page: Page) {
  await page.route("**/__native", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ value: answer(body.command, body.args) }),
    });
  });
  await page.addInitScript((server) => {
    if (!sessionStorage.getItem("v121-seeded")) {
      sessionStorage.setItem("v121-seeded", "1");
      localStorage.clear();
      localStorage.setItem("mochi-language", "zh-CN");
      localStorage.setItem("mochi-update-auto", "false");
      localStorage.setItem(
        "settings",
        JSON.stringify({
          model: "sd_xl_base_1.0.safetensors",
          sampler: "euler_ancestral",
          scheduler: "normal",
          positive: "银发少女，安静的图书馆",
        }),
      );
    }
  }, SERVER);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 15000 });
  await page.waitForTimeout(600);
}

/** The nav buttons live behind an animated page window, so click via the DOM. */
async function navigate(page: Page, index: number) {
  await page.evaluate((i) => {
    const buttons = document.querySelectorAll("aside nav button");
    (buttons[i] as HTMLButtonElement | undefined)?.click();
  }, index);
  await page.waitForTimeout(700);
}

test("the prompt can be translated through the configured API", async ({ page }) => {
  await boot(page);

  // The Atelier card has a translate shortcut once there is text to translate.
  const shortcut = page.locator('.prompt-shortcuts button[aria-label="翻译提示词"]');
  await expect(shortcut).toBeVisible();
  await shortcut.click();

  const dialog = page.locator("dialog.translation-dialog");
  await expect(dialog).toBeVisible();
  // The engine picker exists and defaults to the automatic mode.
  const engine = dialog.locator(".translation-engine select");
  await expect(engine).toHaveValue("auto");
  await engine.selectOption("api");

  await dialog.locator('button:has-text("翻译")').last().click();

  const result = dialog.locator('textarea[aria-label="翻译"]');
  await expect(result).toBeVisible({ timeout: 15000 });
  // The fence the model wrapped around its answer is stripped before display.
  await expect(result).toHaveValue("silver hair, quiet library");
  await expect(dialog.locator(".translation-engine-used")).toContainText("API");

  await dialog.locator('button:has-text("插入到提示词")').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".prompt-entry.positive-entry")).toContainText(
    "silver hair, quiet library",
  );
});

test("prompt templates can be created, renamed, copied and exported", async ({
  page,
}) => {
  await boot(page);
  await navigate(page, 1); // 提示词

  const templateCard = page
    .locator(".collapsible-card")
    .filter({ has: page.locator(".card-heading", { hasText: "提示词模板" }) });
  // Folded by default: the body is hidden until the heading is pressed.
  await expect(templateCard.locator(".card-content")).toBeHidden();
  await templateCard.locator(".card-heading button").click();
  await expect(templateCard.locator(".card-content")).toBeVisible();

  await templateCard.locator('button:has-text("管理")').click();
  const manager = page.locator("dialog.template-manager");
  await expect(manager).toBeVisible();
  await expect(manager.locator(".template-empty")).toBeVisible();

  // Create one.
  await manager.locator(".template-create input").fill("电影感");
  await manager.locator('.template-create button:has-text("新建")').click();
  await expect(manager.locator(".template-list li")).toHaveCount(1);
  await expect(manager.locator(".template-pick")).toContainText("电影感");

  // Rename it in place.
  await manager.locator('.template-tools button[aria-label="重命名"]').click();
  await manager.locator(".template-rename input").fill("电影感 v2");
  await manager.locator('.template-rename button').click();
  await expect(manager.locator(".template-pick").first()).toContainText(
    "电影感 v2",
  );

  // Duplicate gives a second, differently named entry; the copy is prepended.
  await manager.locator('.template-tools button[aria-label="复制"]').first().click();
  await expect(manager.locator(".template-list li")).toHaveCount(2);
  await expect(manager.locator(".template-pick").first()).toContainText("副本");

  // Export writes the whole set as JSON, and the count is shown.
  await expect(manager.locator(".template-actions small")).toContainText("/ 100");
  const download = page.waitForEvent("download");
  await manager.locator('button:has-text("导出全部")').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("huihua-templates.json");

  // Delete one and the list shrinks.
  await manager.locator('.template-tools button[aria-label^="删除"]').first().click();
  await expect(manager.locator(".template-list li")).toHaveCount(1);
});

test("the prompt page folds its long blocks", async ({ page }) => {
  await boot(page);
  await navigate(page, 1);

  // Both the template block and the recent-generations block are collapsible
  // cards now; the recent one only appears once there is history.
  await page.evaluate(() => {
    localStorage.setItem(
      "prompt-studio-history-v1",
      JSON.stringify([
        {
          id: "e1",
          input: "雨夜的东京街头",
          output: "rainy tokyo street, neon",
          at: Date.now(),
        },
      ]),
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 15000 });
  await navigate(page, 1);

  const historyCard = page
    .locator(".collapsible-card")
    .filter({ has: page.locator(".card-heading", { hasText: "最近生成" }) });
  await expect(historyCard).toHaveCount(1);
  await expect(historyCard.locator(".card-content")).toBeHidden();
  await expect(historyCard.locator(".eyebrow")).toContainText("1 条");
  await historyCard.locator(".card-heading button").click();
  await expect(historyCard.locator(".card-content")).toBeVisible();
  await expect(historyCard.locator(".studio-history li")).toHaveCount(1);
});
