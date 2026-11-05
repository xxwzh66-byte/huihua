import { test, expect, type Page } from "@playwright/test";

/**
 * v1.24 is about the two ends of the update story:
 *  - the release dialog no longer dumps you into the release page; the notes
 *    block is the whole story now,
 *  - the settings page carries one row that opens the repository in the system
 *    browser, so the address lives inside the app instead of in a README.
 * The faster download (sixteen parallel range requests) is Kotlin-side and is
 * covered by the APK checklist rather than by a browser test.
 */

const info = {
  CheckpointLoaderSimple: {
    class_type: "CheckpointLoaderSimple",
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors"], {}] } },
  },
  CLIPTextEncode: {
    class_type: "CLIPTextEncode",
    input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] } },
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
const REPO = "https://github.com/xxwzh66-byte/huihua";

type Call = { command: string; args?: Record<string, unknown> };
const calls: Call[] = [];

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
  if (command === "open_link") return { opened: true };
  if (command === "update_action")
    return {
      supported: true,
      phase: "idle",
      error: "",
      received: 0,
      ready: false,
      available: true,
      canInstall: true,
      release: {
        version: "9.9.9",
        size: 75253503,
        title: "绘画 9.9.9",
        published: "2026-11-05T04:13:06Z",
        page: "https://github.com/xxwzh66-byte/huihua/releases/tag/v9.9.9",
        notes: "## 更快\n- 下载改成分片并行\n- 设定页多了项目入口",
      },
    };
  if (command === "llm_get")
    return { base_url: "", model: "", temperature: 0.7, has_key: false };
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
    if (path === "/api/history")
      return { done: { outputs: {}, status: { completed: true } } };
  }
  return {};
}

async function boot(page: Page) {
  calls.length = 0;
  await page.route("**/__native", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    calls.push({ command: body.command, args: body.args });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ value: answer(body.command, body.args) }),
    });
  });
  await page.addInitScript((server) => {
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
    localStorage.setItem("server", server);
  }, SERVER);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".generate-bar", { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function openSettings(page: Page) {
  await page.evaluate(() => {
    const buttons = document.querySelectorAll("aside nav button");
    (buttons[buttons.length - 1] as HTMLButtonElement | undefined)?.click();
  });
  await page.waitForTimeout(800);
  const groups = page.locator("details.settings-group");
  const group = groups.nth((await groups.count()) - 1);
  await group.locator("summary").click();
  await page.waitForTimeout(300);
  return group;
}

test("the project row opens the repository through the native bridge", async ({
  page,
}) => {
  await boot(page);
  const group = await openSettings(page);

  const row = group.locator(".project-link > button");
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  await expect(row.locator("strong")).toHaveText("GitHub 项目地址");
  await expect(row.locator("small")).toContainText("浏览器");

  await row.click();
  await page.waitForTimeout(500);

  const opened = calls.filter((call) => call.command === "open_link");
  expect(opened).toHaveLength(1);
  expect(opened[0].args?.url).toBe(REPO);
});

test("the update dialog drops the release-page link but keeps the notes", async ({
  page,
}) => {
  await boot(page);
  // The manual check opens the dialog; the mock always answers "available".
  await page.evaluate(() =>
    window.dispatchEvent(new Event("mochi-update")),
  );
  await page.waitForTimeout(1200);

  const dialog = page.locator("dialog.update-dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog.locator(".release-notes")).toContainText("下载改成分片并行");

  // The anchor that used to send people to the release page is gone.
  await expect(dialog.locator('a[href*="/releases/tag/"]')).toHaveCount(0);
  await expect(dialog.getByText("查看完整发布说明")).toHaveCount(0);
});
