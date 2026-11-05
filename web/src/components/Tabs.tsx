import { motion } from "framer-motion";
import { typeBlurb, typeLabel } from "../lib/format";
import { locale, t as tr } from "../lib/i18n";
import { TYPES, type ItemType } from "../lib/types";
import { TYPE_TEXT } from "./ui";

export function Tabs({ type, counts, onChange }: { type: ItemType; counts: Record<ItemType, number>; onChange: (t: ItemType) => void }) {
  const onKey = (e: React.KeyboardEvent) => {
    const i = TYPES.indexOf(type);
    if (e.key === "ArrowRight") onChange(TYPES[(i + 1) % 3]);
    else if (e.key === "ArrowLeft") onChange(TYPES[(i + 2) % 3]);
    else return;
    e.preventDefault();
  };
  return (
    <div role="tablist" aria-label={tr("Type d'extension")} onKeyDown={onKey} className="flex gap-1 border-b border-line">
      {TYPES.map((ty) => {
        const active = ty === type;
        return (
          <button key={ty} role="tab" id={`tab-${ty}`} aria-selected={active} aria-controls="results-panel" tabIndex={active ? 0 : -1}
            onClick={() => onChange(ty)} title={typeBlurb(ty)}
            className={`relative -mb-px flex items-center gap-2 px-3.5 py-3 text-sm font-medium transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}>
            {typeLabel(ty)}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${active ? `bg-surface-2 ${TYPE_TEXT[ty]}` : "bg-surface-2/60 text-subtle"}`}>{counts[ty].toLocaleString(locale())}</span>
            {active && <motion.span layoutId="tab-underline" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}
