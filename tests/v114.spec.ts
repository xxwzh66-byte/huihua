import { test, expect } from "@playwright/test";

/**
 * v1.14: the visual workflow canvas became real node graph (icon nodes, wires,
 * tap-to-open parameter panel) and the shelf gained a selector + a name field.
 * Both render against a fixed fixture so the test never needs ComfyUI.
 */
const html = `<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>v1.14 canvas</title></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/v114-harness.tsx');</script></body></html>`;

test.beforeEach(async ({ page }) => {
  await page.route("**/__v114**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto("/__v114");
});

test("nodes render as icons and wires, parameters stay hidden until tapped", async ({
  page,
}) => {
  const nodes = page.locator(".graph-node");
  await expect(nodes).toHaveCount(7);
  // Nothing is selected yet: no detail panel, just the hint.
  await expect(page.locator(".canvas-detail")).toHaveCount(0);
  await expect(page.locator(".canvas-hint")).toBeVisible();
  // Wires exist for every link in the fixture (9 links across 7 nodes).
  await expect(page.locator("svg.canvas-edges path")).toHaveCount(9);
  // Only the tapped node reveals its fields.
  await nodes.filter({ hasText: "KSampler" }).first().click();
  await expect(page.locator(".canvas-detail")).toBeVisible();
  // 5 scalar fields (seed, steps, cfg, sampler_name, scheduler, denoise → 6)
  // plus 4 wires rendered as `.node-link`, never as editable fields.
  await expect(page.locator(".canvas-detail .node-field")).toHaveCount(6);
  await expect(page.locator(".canvas-detail .node-link")).toHaveCount(4);
  // Tapping the same node again collapses the panel.
  await nodes.filter({ hasText: "KSampler" }).first().click();
  await expect(page.locator(".canvas-detail")).toHaveCount(0);
});

test("an unset select shows a placeholder instead of borrowing a value", async ({
  page,
}) => {
  await page.locator(".graph-node").filter({ hasText: "KSampler" }).first().click();
  const sampler = page
    .locator(".canvas-detail label.node-field")
    .filter({ hasText: "sampler_name" })
    .locator("select");
  await expect(sampler).toHaveValue("");
  // The empty value renders its own option rather than the first real choice.
  await expect(sampler.locator("option").first()).toHaveAttribute("value", "");
  await sampler.selectOption("dpmpp_2m");
  await expect(page.locator("#graph")).toContainText('"sampler_name":"dpmpp_2m"');
});

test("zoom controls change the scale of the graph", async ({ page }) => {
  const stage = page.locator(".canvas-graph");
  const before = await stage.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  await page.locator(".canvas-zoom button").last().click();
  const after = await stage.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  expect(after).not.toBe(before);
});

test("the shelf names and re-selects a saved workflow", async ({ page }) => {
  const name = page.locator(".shelf-save input");
  await name.fill("我的工作流");
  await page.locator(".shelf-save-button").click();
  await expect(page.locator("#log")).toContainText("工作流已保存到本机。");
  const picker = page.locator(".shelf-picker select");
  await expect(picker.locator("option")).toHaveCount(2);
  await expect(picker.locator("option").nth(1)).toHaveText("我的工作流");
  // Saving again overwrites the same entry instead of adding a second one.
  await page.locator(".shelf-save-button").click();
  await expect(picker.locator("option")).toHaveCount(2);
});
