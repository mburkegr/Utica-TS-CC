/**
 * Runtime `downloads` capability (published-page contract 0.2.52).
 * `claude.use("downloads")` resolves the namespace or null; null hides the
 * download affordance and the page falls back to copy-to-clipboard.
 */
import React from "react";

type DownloadsNs = { save(req: { filename: string; data: string | Blob }): Promise<{ status: string }> };

let pending: Promise<DownloadsNs | null> | null = null;
/** Resolves the namespace once per page; a missing runtime is never cached, so a later-arriving runtime is still picked up. */
export function resolveDownloads(): Promise<DownloadsNs | null> {
  const c = (globalThis as any).claude;
  if (!c || typeof c.use !== "function") return Promise.resolve(null);
  if (!pending) {
    pending = Promise.resolve(c.use("downloads")).then((ns: any) => (ns && typeof ns.save === "function" ? (ns as DownloadsNs) : null)).catch(() => null);
  }
  return pending;
}

export function useDownloads(): DownloadsNs | null {
  const [ns, setNs] = React.useState<DownloadsNs | null>(null);
  React.useEffect(() => { let alive = true; resolveDownloads().then((d) => { if (alive) setNs(d); }); return () => { alive = false; }; }, []);
  return ns;
}

/** Offer a CSV to the viewer. Returns a short status for the UI; "declined" is silent. */
export async function saveCsv(ns: DownloadsNs, filename: string, csv: string): Promise<"saved" | "declined" | "error"> {
  try { await ns.save({ filename, data: new Blob([csv], { type: "text/csv" }) }); return "saved"; }
  catch (e: any) { return e && e.code === "declined" ? "declined" : "error"; }
}

export function copyText(text: string): Promise<boolean> {
  try { return (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => true).catch(() => false); } catch { return Promise.resolve(false); }
}
