import React from "react";
import { useDownloads, saveCsv, copyText } from "../adapters/downloads";

/** Download (runtime capability) plus copy-to-clipboard fallback for one CSV. */
export function ExportButtons({ filename, csv, label = "CSV" }: { filename: string; csv: () => string; label?: string }) {
  const dl = useDownloads();
  const [msg, setMsg] = React.useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  return (
    <span className="export">
      {dl && <button className="btn secondary" data-download={filename} onClick={async () => { const r = await saveCsv(dl, filename, csv()); if (r === "saved") flash("Saved"); else if (r === "error") flash("Download unavailable"); }}>Download {label}</button>}
      <button className="btn secondary" onClick={async () => flash((await copyText(csv())) ? "Copied" : "Copy failed")}>Copy {label}</button>
      {msg && <span className="status">{msg}</span>}
    </span>
  );
}
