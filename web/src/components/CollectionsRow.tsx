import { getLang, t } from "../lib/i18n";
import type { Collection } from "../lib/types";

export function CollectionsRow({ items, active, onPick }: { items: Collection[] | null; active: string; onPick: (c: Collection) => void }) {
  if (items === null) { // chargement : on réserve exactement la hauteur finale (pas de décalage de mise en page)
    return <div className="mb-6" aria-hidden="true"><div className="mb-2 h-4" /><div className="flex gap-2 pb-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[62px] w-48 shrink-0 rounded-lg" />)}</div></div>;
  }
  if (!items.length) return null;
  return (
    <section aria-label={t("Collections thématiques")} className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t("Collections")}</h2>
      <ul className="scroll-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {items.map((c) => {
          const on = active.trim().toLowerCase() === c.query.toLowerCase();
          return (
            <li key={c.id} className="shrink-0">
              <button onClick={() => onPick(c)} aria-pressed={on}
                className={`w-48 rounded-lg border p-3 text-left transition-colors ${on ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/60"}`}>
                <span className="block text-sm font-semibold">{getLang() === "en" ? c.title_en ?? c.title : c.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted">{getLang() === "en" ? c.desc_en ?? c.desc : c.desc}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
