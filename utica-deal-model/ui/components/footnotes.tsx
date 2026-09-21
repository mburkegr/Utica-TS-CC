import React from "react";

/**
 * Footnotes. Explanatory text passed to a Section as `note` is not printed
 * under the heading; it is numbered, marked with a superscript beside the
 * heading, and collected in a list at the foot of the screen.
 *
 * Numbering follows reading order: the scope hands out a fresh registry on
 * every pass (a new context value, so every useFootnote consumer re-renders in
 * tree order), sections register synchronously as they render, and the list,
 * which sits last in the tree, sees the finished set. Sections that mount or
 * unmount without the scope re-rendering (a disclosure opening) ask for one
 * more pass, which renumbers everything.
 */
interface Registry { order: string[]; index: Map<string, number>; bump: () => void }
const FootnoteContext = React.createContext<Registry | null>(null);

export function FootnoteScope({ resetKey, children }: { resetKey: string; children: React.ReactNode }) {
  const [version, setVersion] = React.useState(0);
  const bump = React.useCallback(() => setVersion((v) => v + 1), []);
  // New object per pass (and per screen) so consumers re-render and re-register.
  const registry = React.useMemo<Registry>(() => ({ order: [], index: new Map(), bump }), [bump, version, resetKey]);
  registry.order.length = 0;
  registry.index.clear();
  return <FootnoteContext.Provider value={registry}>{children}</FootnoteContext.Provider>;
}

/** Register a note and get its number, or null when there is no note or no scope. */
export function useFootnote(text?: string): number | null {
  const reg = React.useContext(FootnoteContext);
  // Mount and unmount only: ask for one renumbering pass. The bump is read
  // through a ref so this effect never re-runs when the registry changes,
  // which would otherwise loop.
  const bumpRef = React.useRef<(() => void) | undefined>(undefined);
  bumpRef.current = reg?.bump;
  const has = Boolean(reg && text);
  React.useEffect(() => {
    if (!has) return;
    bumpRef.current?.();
    return () => bumpRef.current?.();
  }, [has]);
  if (!reg || !text) return null;
  const existing = reg.index.get(text);
  if (existing !== undefined) return existing;
  const n = reg.order.length + 1;
  reg.order.push(text);
  reg.index.set(text, n);
  return n;
}

export function FootnoteMarker({ n }: { n: number | null }) {
  if (n === null) return null;
  return <sup className="fn-mark"><a href={`#fn-${n}`}>{n}</a></sup>;
}

/** Renders after the screen's sections, so it sees every note registered in this pass. */
export function FootnoteList() {
  const reg = React.useContext(FootnoteContext);
  if (!reg || reg.order.length === 0) return null;
  return (
    <section className="footnotes" aria-label="Notes">
      <h4>Notes</h4>
      <ol>{reg.order.map((t, i) => <li key={t} id={`fn-${i + 1}`}>{t}</li>)}</ol>
    </section>
  );
}
