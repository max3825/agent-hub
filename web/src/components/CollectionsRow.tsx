import type { Collection } from "../lib/types";

export function CollectionsRow({ items, active, onPick }: { items: Collection[]; active: string; onPick: (c: Collection) => void }) {
  if (!items.length) return null;
  return (
    <section aria-label="Collections thématiques" className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">Collections</h2>
      <ul className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {items.map((c) => {
          const on = active.trim().toLowerCase() === c.query.toLowerCase();
          return (
            <li key={c.id} className="shrink-0">
              <button onClick={() => onPick(c)} aria-pressed={on}
                className={`w-48 rounded-lg border p-3 text-left transition-colors ${on ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/60"}`}>
                <span className="block text-sm font-semibold">{c.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{c.desc}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
