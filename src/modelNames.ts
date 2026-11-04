export const shortName = (s: string) =>
  s
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(safetensors|ckpt|pt|pth)$/i, "")
    .replace(/_/g, " ");
