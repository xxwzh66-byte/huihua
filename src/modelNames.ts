export const shortName = (s: string) =>
  s
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(safetensors|ckpt|pt|pth)$/i, "")
    .replace(/_/g, " ");

/**
 * v1.0 has no companion process serving thumbnails, and ComfyUI's HTTP API
 * exposes no model preview endpoint. An empty path makes `Picture` render its
 * neutral placeholder instead of a broken image.
 */
export const modelPath = (_kind: string, _name: string) => "";
