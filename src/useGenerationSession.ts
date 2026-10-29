import { t as tr } from "./i18n";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from "react";
import { api, imagePath, imageUrl, native, type Queue, type History } from "./api";
import { getClientId, writeStored } from "./sessionStorage";
import { mapConcurrent, pollingDelay } from "./asyncPool";
import { openComfySocket, percentOf } from "./comfySocket";
import type { ViewItem } from "./viewTypes";

export const clientId = getClientId();

/**
 * v1.14 default save: every freshly generated image can drop straight into the
 * device gallery (Pictures / 绘画) without a trip to the gallery page. A failed
 * save never interrupts the render: the image still lives on the ComfyUI server.
 */
async function persist(items: ViewItem[]) {
  for (const item of items) {
    try {
      const dataUrl = await imageUrl(item.path);
      await native("save_image", { dataUrl, filename: item.name });
    } catch {
      /* the render stays available in the gallery either way */
    }
  }
}

/**
 * v1.0 talks straight to a ComfyUI server: the queue and the history are the
 * only sources of truth, so there is no companion event stream any more.
 *
 * v1.15: the polling effect no longer restarts on every render. `onOnline` and
 * `onError` arrive as inline closures from App, so listing them as effect
 * dependencies tore the loop down and restarted it (immediately re-polling) on
 * every state change — a generate() burst turned that into a poll storm that
 * froze the app. They now live in refs, and a module-wide `active` lock stops a
 * restarted loop from overlapping an in-flight poll.
 */
export function useGenerationSession(
  server: string,
  epoch: number,
  generation: RefObject<number>,
  onOnline: (value: boolean) => void,
  onError: (value: string) => void,
  autoSave?: RefObject<boolean>,
) {
  const [queue, setQueue] = useState<Queue>({
    queue_running: [],
    queue_pending: [],
  });
  const [jobs, setJobs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(tr("Prêt à créer"));
  const [preview, setPreview] = useState("");
  const [results, setResults] = useState<ViewItem[]>([]);
  const jobsRef = useRef<string[]>([]),
    cursor = useRef(0),
    missing = useRef(new Map<string, number>()),
    savedImages = useRef(new Set<string>()),
    busy = useRef(false),
    onlineRef = useRef(onOnline),
    errorRef = useRef(onError);
  onlineRef.current = onOnline;
  errorRef.current = onError;
  const wakeRef = useRef<() => void>(() => {});
  const previewUrl = useRef("");
  // True while the socket is pushing real preview frames; the polling fallback
  // must not overwrite them with its 1.5 s snapshot.
  const socketPreview = useRef(false);
  const track = useCallback((ids: string[], url: string) => {
    const start = !jobsRef.current.length && ids.length > 0;
    jobsRef.current = ids;
    setJobs(ids);
    if (url) writeStored("tasks:" + url, ids);
    if (start) wakeRef.current();
  }, []);
  /**
   * v1.16: real progress and real preview frames come from ComfyUI's `/ws`
   * channel instead of being inferred from history polling. The polling loop
   * stays as the source of truth for *what exists* on the server (it survives
   * reconnects and reloads), while the socket only animates the render bar.
   */
  useEffect(() => {
    if (!server) return;
    const swapPreview = (blob: Blob) => {
      const next = URL.createObjectURL(blob);
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = next;
      socketPreview.current = true;
      setPreview(next);
    };
    const socket = openComfySocket(server, clientId, {
      onProgress: (report) => setProgress(percentOf(report.value, report.max)),
      onStart: () => setProgress(0),
      onNode: (node) => setPhase(tr("Nœud {0}", [node])),
      onPreview: swapPreview,
      onError: (message) => errorRef.current(message),
    });
    return () => {
      socket.close();
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = "";
      }
      socketPreview.current = false;
    };
  }, [server, epoch]);
  useEffect(() => {
    if (!server) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const version = generation.current;
    const valid = () => !stopped && version === generation.current;
    async function poll() {
      // One poll at a time across restarts: a torn-down loop may still have a
      // request in flight, and stacking another poll on top floods the server.
      if (busy.current || !valid()) return;
      busy.current = true;
      const polled = [...jobsRef.current];
      try {
        const q = await api<Queue>("/api/queue");
        if (!valid()) return;
        setQueue(q);
        onlineRef.current(true);
        if (polled.length) {
          const running = q.queue_running.length > 0;
          setPhase(
            running
              ? tr("Votre serveur compose l’image")
              : tr("En attente du GPU"),
          );
        }
        if (!polled.length) return;
        const histories = await mapConcurrent(polled, 3, async (id) => {
          if (!valid()) throw new Error(tr("Session terminée"));
          return { id, entry: (await api<History>("/api/history/" + id))[id] };
        });
        if (!valid()) return;
        const done = new Set<string>(),
          found: ViewItem[] = [];
        let failed = false;
        let live = "";
        for (const { id, entry } of histories) {
          /*
           * PreviewImage / SaveImage nodes emit `temp` images while the job is
           * still running, and hand-imported workflows often only have those.
           * Feed the newest one to the Atelier preview so the render panel
           * follows the workflow's own preview node.
           */
          if (entry && !entry.status?.completed) {
            for (const output of Object.values(entry.outputs ?? {}))
              for (const image of output.images ?? [])
                if (image.type !== "output") live = imagePath(image);
          }
          if (
            entry?.status?.completed ||
            entry?.status?.status_str === "error"
          ) {
            done.add(id);
            found.push(
              ...Object.values(entry.outputs ?? {}).flatMap((o) =>
                (o.images ?? [])
                  .filter((i) => i.type === "output")
                  .map((i) => ({ path: imagePath(i), name: i.filename })),
              ),
            );
            if (entry.status.status_str === "error") {
              failed = true;
              errorRef.current(
                String(
                  entry.status.messages?.find(
                    (m) => m[0] === "execution_error",
                  )?.[1]?.exception_message ??
                    tr("Génération interrompue ou échouée."),
                ),
              );
            }
          } else if (
            !q.queue_running.some((j) => j[1] === id) &&
            !q.queue_pending.some((j) => j[1] === id)
          ) {
            const count = (missing.current.get(id) ?? 0) + 1;
            missing.current.set(id, count);
            if (count >= 3) {
              done.add(id);
              failed = true;
              errorRef.current(
                tr("Une tâche a disparu de la file et de l’historique du serveur."),
              );
            }
          } else missing.current.delete(id);
        }
        if (live && !socketPreview.current) setPreview(live);
        if (done.size) {
          const remaining = jobsRef.current.filter((id) => !done.has(id));
          track(remaining, server);
          if (found.length)
            setResults((old) => {
              const next = [...found, ...old].slice(0, 160);
              writeStored("results:" + server, next);
              return next;
            });
          // Never hand the same render to the gallery twice, even when a poll
          // overlaps with the default-save loop still writing the last batch.
          const fresh = found.filter((item) => !savedImages.current.has(item.path));
          for (const item of fresh) savedImages.current.add(item.path);
          if (fresh.length && autoSave?.current) void persist(fresh);
          setPreview("");
          socketPreview.current = false;
          if (previewUrl.current) {
            URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = "";
          }
          setProgress(remaining.length ? 0 : failed ? 0 : 100);
          setPhase(
            remaining.length
              ? tr("{0} lot(s) restant(s)", [remaining.length])
              : failed
                ? tr("Traitement terminé avec une erreur")
                : tr("Génération terminée"),
          );
        }
      } catch {
        if (valid()) {
          onlineRef.current(false);
          if (jobsRef.current.length)
            setPhase(tr("Connexion perdue · reprise automatique"));
        }
      } finally {
        busy.current = false;
        if (!stopped)
          timer = setTimeout(
            poll,
            pollingDelay(jobsRef.current.length > 0, document.hidden),
          );
      }
    }
    const wake = () => {
      clearTimeout(timer);
      void poll();
    };
    wakeRef.current = wake;
    const visible = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", visible);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wakeRef.current = () => {};
      document.removeEventListener("visibilitychange", visible);
    };
  }, [server, epoch, track, generation, autoSave]);
  const reset = () => {
    cursor.current = 0;
    missing.current.clear();
    savedImages.current.clear();
    socketPreview.current = false;
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = "";
    }
    track([], "");
    setQueue({ queue_running: [], queue_pending: [] });
    setResults([]);
    setPreview("");
    setProgress(0);
    setPhase(tr("Prêt à créer"));
  };
  return {
    queue,
    jobs,
    jobsRef,
    track,
    cursor,
    progress,
    setProgress,
    phase,
    setPhase,
    preview,
    setPreview,
    results,
    setResults,
    reset,
  };
}
