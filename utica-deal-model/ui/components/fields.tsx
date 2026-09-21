import React from "react";
import { FootnoteMarker, useFootnote } from "./footnotes";

export function NumberField({ label, value, onChange, step = 1, min, max, decimals, prefix, suffix, disabled, width, help }: {
  label?: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; decimals?: number;
  prefix?: string; suffix?: string; disabled?: boolean; width?: number; help?: string;
}) {
  const [text, setText] = React.useState<string>(String(value));
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => { if (!focused) setText(decimals !== undefined ? value.toFixed(decimals) : String(value)); }, [value, decimals, focused]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v)) { let c = v; if (min !== undefined) c = Math.max(min, c); if (max !== undefined) c = Math.min(max, c); onChange(c); }
    setFocused(false);
  };
  return (
    <label className="field" title={help} style={width ? { width } : undefined}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input">
        {prefix && <span className="affix">{prefix}</span>}
        <input type="number" inputMode="decimal" step={step} value={text} disabled={disabled}
          onFocus={() => setFocused(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        {suffix && <span className="affix">{suffix}</span>}
      </span>
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, width }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <label className="field" style={width ? { width } : undefined}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input"><input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></span>
    </label>
  );
}

export function MonthField({ label, value, onChange, min, max, disabled, help }: { label?: string; value: string; onChange: (iso: string) => void; min?: string; max?: string; disabled?: boolean; help?: string }) {
  return (
    <label className="field" title={help}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input"><input type="month" value={value.slice(0, 7)} min={min?.slice(0, 7)} max={max?.slice(0, 7)} disabled={disabled}
        onChange={(e) => { if (e.target.value) onChange(`${e.target.value}-01`); }} /></span>
    </label>
  );
}

export function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="toggle" title={help}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange, width }: { label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; width?: number }) {
  return (
    <label className="field" style={width ? { width } : undefined}>
      {label && <span className="field-label">{label}</span>}
      <span className="field-input"><select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></span>
    </label>
  );
}

export function Section({ title, children, right, note }: { title: string; children: React.ReactNode; right?: React.ReactNode; note?: string }) {
  const n = useFootnote(note);
  return (
    <section className="section">
      <header className="section-head"><h3>{title}<FootnoteMarker n={n} /></h3>{right}</header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Row({ children }: { children: React.ReactNode }) { return <div className="row">{children}</div>; }

export function Banner({ kind, children }: { kind: "info" | "warn" | "error"; children: React.ReactNode }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}

/** Two-step inline confirmation; browser modal dialogs (confirm/alert) are blocked inside the artifact iframe. */
export function ConfirmButton({ label, confirmLabel = "Confirm", onConfirm, testId, className = "btn secondary" }: { label: string; confirmLabel?: string; onConfirm: () => void; testId?: string; className?: string }) {
  const [arm, setArm] = React.useState(false);
  React.useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 6000); return () => clearTimeout(t); }, [arm]);
  if (!arm) return <button className={className} data-testid={testId} onClick={() => setArm(true)}>{label}</button>;
  return (
    <span className="confirm">
      <button className="btn primary" data-testid={testId ? `${testId}-confirm` : undefined} onClick={() => { setArm(false); onConfirm(); }}>{confirmLabel}</button>
      <button className="btn secondary" onClick={() => setArm(false)}>Cancel</button>
    </span>
  );
}

/** Collapsible section for reference material and occasional tools. */
export function Disclosure({ title, children, note, defaultOpen = false, testId }: { title: string; children: React.ReactNode; note?: string; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="disclosure">
      <button className="disclosure-head" aria-expanded={open} data-testid={testId} onClick={() => setOpen(!open)}>
        <span className={open ? "chev open" : "chev"} aria-hidden="true">›</span>
        <span className="disclosure-title">{title}</span>
        {note && <span className="muted">{note}</span>}
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </section>
  );
}
