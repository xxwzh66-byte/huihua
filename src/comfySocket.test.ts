import { describe, expect, it } from "vitest";
import { percentOf, parsePreviewFrame, socketUrl } from "./comfySocket";

describe("render progress", () => {
  it("turns a ComfyUI step counter into a clamped percentage", () => {
    expect(percentOf(19, 20)).toBe(95);
    expect(percentOf(0, 20)).toBe(0);
    expect(percentOf(20, 20)).toBe(100);
  });
  it("never reports a negative or over-100 value, and ignores a broken max", () => {
    expect(percentOf(-5, 20)).toBe(0);
    expect(percentOf(40, 20)).toBe(100);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(Number.NaN, 20)).toBe(0);
    expect(percentOf(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("preview frames", () => {
  const frame = (event: number, kind: number, body: number[]) => {
    const buffer = new ArrayBuffer(8 + body.length);
    const view = new DataView(buffer);
    view.setUint32(0, event);
    view.setUint32(4, kind);
    new Uint8Array(buffer, 8).set(body);
    return buffer;
  };
  it("strips the 8-byte header and guesses the image mime", () => {
    const png = parsePreviewFrame(frame(1, 1, [0x89, 0x50, 0x4e, 0x47]));
    expect(png?.type).toBe("image/png");
    expect(parsePreviewFrame(frame(1, 2, [0xff, 0xd8]))?.type).toBe("image/jpeg");
    expect(parsePreviewFrame(frame(1, 3, [1, 2]))?.type).toBe("image/webp");
  });
  it("ignores non-preview events and truncated frames", () => {
    expect(parsePreviewFrame(frame(2, 1, [1, 2, 3]))).toBeNull();
    expect(parsePreviewFrame(new ArrayBuffer(8))).toBeNull();
    expect(parsePreviewFrame(frame(1, 1, []))).toBeNull();
  });
});

describe("socket endpoint", () => {
  it("maps http to ws and https to wss", () => {
    expect(socketUrl("http://192.168.1.8:8188", "abc")).toBe(
      "ws://192.168.1.8:8188/ws?clientId=abc",
    );
    expect(socketUrl("https://comfy.example.com", "abc")).toBe(
      "wss://comfy.example.com/ws?clientId=abc",
    );
  });
  it("accepts an address typed without a scheme and ignores a trailing slash", () => {
    expect(socketUrl("192.168.1.8:8188/", "abc")).toBe(
      "ws://192.168.1.8:8188/ws?clientId=abc",
    );
  });
  it("keeps an address that already uses a websocket scheme", () => {
    expect(socketUrl("ws://host:8188", "id")).toBe("ws://host:8188/ws?clientId=id");
  });
  it("reports nothing for an empty server instead of a broken url", () => {
    expect(socketUrl("", "abc")).toBe("");
    expect(socketUrl("   ", "abc")).toBe("");
  });
});
