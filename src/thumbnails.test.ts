import { describe, expect, it, vi } from "vitest";
import { fitSize, THUMB_SIDE } from "./thumbnails";

describe("thumbnail sizing", () => {
  it("fits the long edge into the thumbnail box and keeps the aspect ratio", () => {
    expect(fitSize(1024, 1024)).toEqual({ width: THUMB_SIDE, height: THUMB_SIDE });
    expect(fitSize(2048, 1024)).toEqual({ width: 256, height: 128 });
    expect(fitSize(1024, 2048)).toEqual({ width: 128, height: 256 });
  });
  it("never enlarges a small image", () => {
    expect(fitSize(120, 60)).toEqual({ width: 120, height: 60 });
  });
  it("refuses degenerate dimensions instead of producing a zero-size canvas", () => {
    expect(fitSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitSize(100, -1)).toEqual({ width: 0, height: 0 });
    expect(fitSize(Number.NaN, 100)).toEqual({ width: 0, height: 0 });
  });
  it("never rounds a visible edge down to zero", () => {
    const tiny = fitSize(4000, 1);
    expect(tiny.width).toBe(256);
    expect(tiny.height).toBe(1);
  });
});

describe("thumbnail cache budget", () => {
  it("keeps many shrunken frames for the cost of one original", async () => {
    const { createImageCache } = await import("./imageCache");
    const load = vi.fn(async (path: string) => path.padEnd(4000, "x"));
    const cache = createImageCache(load, 8 * 1024 * 1024);
    for (let i = 0; i < 100; i++) await cache.get(`frame-${i}`);
    await cache.get("frame-0");
    expect(load).toHaveBeenCalledTimes(100);
  });
});
