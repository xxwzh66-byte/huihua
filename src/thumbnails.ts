import { imageUrl } from "./api";
import { createImageCache } from "./imageCache";

/**
 * ComfyUI's `/api/view` ignores unknown query parameters, so asking it for a
 * thumbnail used to return the full original. Galleries then held dozens of
 * multi-megabyte bitmaps at once. We now fetch the original once and shrink it
 * locally, and only the small copy is kept in memory.
 */
export const THUMB_SIDE = 256;

/** Fit a bitmap inside a square of `side` pixels without ever enlarging it. */
export function fitSize(
  width: number,
  height: number,
  side = THUMB_SIDE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, side / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Bitmap = { width: number; height: number; source: CanvasImageSource };

async function decode(url: string): Promise<Bitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("thumbnail source unavailable");
  const blob = await response.blob();
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  }
  const image = new Image();
  image.src = URL.createObjectURL(blob);
  await image.decode();
  return { width: image.naturalWidth, height: image.naturalHeight, source: image };
}

/** Downscale a data URL to a small JPEG-ish data URL, or "" when unsupported. */
export async function shrink(
  url: string,
  side = THUMB_SIDE,
): Promise<string> {
  const bitmap = await decode(url);
  const { width, height } = fitSize(bitmap.width, bitmap.height, side);
  if (!width || !height) return "";
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const context = (canvas as HTMLCanvasElement).getContext("2d");
  if (!context) return url;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap.source, 0, 0, width, height);
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.72 });
    return blobToDataUrl(blob);
  }
  const typed = canvas as HTMLCanvasElement;
  return typed.toDataURL("image/webp", 0.72);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * A thumbnail cache is cheap: one 256 px webp is a few dozen KB, so the budget
 * holds well over a hundred screens of gallery. Originals are never cached
 * here — that is what the 24 MB image cache is for, and only the Viewer asks
 * it for a full-size bitmap.
 */
const cache = createImageCache(
  async (path: string) => shrink(await imageUrl(path)),
  8 * 1024 * 1024,
);

export const thumbnailImage = (path: string) => cache.get(path);
export const clearThumbnailCache = cache.clear;
