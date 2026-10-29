/**
 * ComfyUI publishes live progress on `<ws(s)://host>/ws?clientId=<id>`, but the
 * v1.15 app only ever polled `/api/queue` + `/api/history`. That is why the
 * render bar jumped 0 → 100 and the "live preview" was a 1.5 s snapshot: the
 * polling loop was the whole story. This module is the missing channel.
 *
 * Two frame shapes arrive on that socket:
 *  - text JSON, `{type, data}` — `status`, `execution_start`, `executing`,
 *    `progress`, `progress_state`, `execution_error`, `execution_cached`, …
 *  - binary previews — 4-byte big-endian event type (1 = preview), 4-byte
 *    image type, then the encoded image bytes. ComfyUI sends those from
 *    PreviewImage while a job runs.
 */

export interface ProgressReport {
  value: number;
  max: number;
  node?: string;
}

export interface SocketHandlers {
  onProgress?: (report: ProgressReport) => void;
  onNode?: (node: string) => void;
  onPreview?: (blob: Blob) => void;
  onStart?: (promptId: string) => void;
  onError?: (message: string) => void;
  onStatus?: (open: boolean) => void;
}

const PREVIEW_EVENT = 1;

/** Percentage that never moves backwards or overshoots the bar. */
export function percentOf(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

/**
 * Split a binary preview frame into its image payload. Returns null for any
 * frame that is not a preview (ComfyUI may add further binary events later),
 * so the caller can ignore it rather than render garbage.
 */
export function parsePreviewFrame(buffer: ArrayBuffer): Blob | null {
  if (buffer.byteLength <= 8) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0) !== PREVIEW_EVENT) return null;
  const body = new Uint8Array(buffer, 8);
  if (!body.length) return null;
  return new Blob([body], { type: mimeOfImageType(view.getUint32(4)) });
}

function mimeOfImageType(kind: number): string {
  // 1 = PNG, 2 = JPEG, 3 = WEBP in ComfyUI's preview encoder.
  if (kind === 2) return "image/jpeg";
  if (kind === 3) return "image/webp";
  return "image/png";
}

/** Normalise a user-typed server address into a websocket endpoint. */
export function socketUrl(server: string, clientId: string): string {
  const trimmed = (server || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const base = trimmed.replace(/^http(s?):\/\//i, (_all, secure: string) =>
    secure ? "wss://" : "ws://",
  );
  const scheme = /^wss?:\/\//i.test(base) ? base : `ws://${base}`;
  return `${scheme}/ws?clientId=${encodeURIComponent(clientId)}`;
}

export interface Connection {
  send(type: string, data?: Record<string, unknown>): void;
  close(): void;
}

export function openComfySocket(
  server: string,
  clientId: string,
  handlers: SocketHandlers,
): Connection {
  const url = socketUrl(server, clientId);
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (closed || !url) return;
    try {
      socket = new WebSocket(url);
    } catch {
      schedule();
      return;
    }
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      retry = 0;
      handlers.onStatus?.(true);
    };
    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        handleText(event.data);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        const blob = parsePreviewFrame(event.data);
        if (blob) handlers.onPreview?.(blob);
      }
    };
    socket.onclose = () => {
      handlers.onStatus?.(false);
      schedule();
    };
    socket.onerror = () => {
      // `onclose` always follows, so reconnection lives there.
      handlers.onStatus?.(false);
    };
  };

  const schedule = () => {
    if (closed || !url) return;
    // 1 s, 2 s, 4 s… capped, so a sleeping PC does not spin the socket.
    const wait = Math.min(15_000, 1_000 * 2 ** Math.min(retry++, 4));
    clearTimeout(timer);
    timer = setTimeout(connect, wait);
  };

  const handleText = (raw: string) => {
    let payload: { type?: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      return;
    }
    const type = payload.type ?? "";
    const data = payload.data ?? {};
    if (type === "progress") {
      const value = Number(data.value ?? 0);
      const max = Number(data.max ?? 0);
      if (max > 0)
        handlers.onProgress?.({
          value,
          max,
          node: typeof data.node === "string" ? data.node : undefined,
        });
      return;
    }
    if (type === "progress_state") {
      const nodes = data.nodes as
        | Record<string, { value?: number; max?: number; state?: string }>
        | undefined;
      // Concurrency-safe fallback: sum every running node's step counter.
      let value = 0;
      let max = 0;
      for (const node of Object.values(nodes ?? {})) {
        if (node?.state !== "running") continue;
        value += Number(node.value ?? 0);
        max += Number(node.max ?? 0);
      }
      if (max > 0) handlers.onProgress?.({ value, max });
      return;
    }
    if (type === "executing") {
      const node = data.node;
      if (typeof node === "string" && node) handlers.onNode?.(node);
      return;
    }
    if (type === "execution_start") {
      if (typeof data.prompt_id === "string")
        handlers.onStart?.(data.prompt_id);
      return;
    }
    if (type === "execution_error") {
      const message =
        (data.exception_message as string | undefined) ??
        (data.exception_type as string | undefined);
      if (message) handlers.onError?.(message);
    }
  };

  connect();
  return {
    send(type, data = {}) {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type, data, client_id: clientId }));
    },
    close() {
      closed = true;
      clearTimeout(timer);
      socket?.close();
      socket = null;
    },
  };
}
