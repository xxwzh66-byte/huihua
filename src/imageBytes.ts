/** Decode a `data:image/...;base64,…` URL into raw bytes. */
export function dataUrlBytes(url: string): Uint8Array {
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("not a data url");
  return Uint8Array.from(atob(url.slice(comma + 1)), (c) => c.charCodeAt(0));
}
