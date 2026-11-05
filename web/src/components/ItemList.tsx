import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Item } from "../lib/types";
import { t } from "../lib/i18n";
import { ItemCard } from "./ItemCard";

const NEW_MS = 7 * 86400000;

/** Liste virtualisée (fenêtre) : 1 à 2 colonnes selon la largeur, hauteurs mesurées. */
export function ItemList({ items, terms, lang, onOpen }: { items: Item[]; terms: string[]; lang: "fr" | "en"; onOpen: (id: string) => void }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const el = parentRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setCols(e.contentRect.width >= 760 ? 2 : 1));
    ro.observe(el); setOffset(el.offsetTop);
    return () => ro.disconnect();
  }, []);

  const rows = Math.ceil(items.length / cols);
  const v = useWindowVirtualizer({ count: rows, estimateSize: () => 156, overscan: 6, scrollMargin: offset, gap: 12 });

  // Retour en haut quand la liste change (nouvelle recherche / filtre).
  const first = items[0]?.id;
  useEffect(() => { v.scrollToOffset(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [first, items.length]);

  const now = Date.now();
  return (
    <div ref={parentRef} role="list" aria-label={t("Résultats")}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} data-index={row.index} ref={v.measureElement} role="presentation"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${row.start - v.options.scrollMargin}px)` }}
            className={`grid gap-3 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {Array.from({ length: cols }, (_, c) => items[row.index * cols + c]).map((it, c) =>
              it ? (
                <div key={it.id} role="listitem" className="min-w-0">
                  <ItemCard item={it} terms={terms} lang={lang} onOpen={onOpen} index={row.index * cols + c}
                    isNew={now - Date.parse(it.firstSeen) < NEW_MS} />
                </div>
              ) : <div key={`e${c}`} />,
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
