import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, CornerDownLeft, Heart, Info, Moon, Search, Sun } from "lucide-react";
import type { Item } from "../lib/types";
import type { Engine } from "../search/useSearch";
import { emptyFilters } from "../lib/types";
import { t } from "../lib/i18n";
import { Highlight, Kbd, TypeBadge } from "./ui";

interface Action { id: string; label: string; icon: React.ReactNode; run: () => void }
interface Props {
  open: boolean; onClose: () => void; engine: Engine; lang: "fr" | "en"; theme: "light" | "dark";
  onPick: (it: Item) => void; onToggleTheme: () => void; onAbout: () => void; onFavs: () => void; onStats: () => void;
}

export default function CommandPalette({ open, onClose, engine, lang, theme, onPick, onToggleTheme, onAbout, onFavs, onStats }: Props) {
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqRef = useRef(0);

  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const my = ++reqRef.current;
    engine.run(q, "all", emptyFilters, "relevance", 8).then((r) => {
      if (my !== reqRef.current) return;
      setItems(Array.from(r.indices, (i) => engine.itemsRef.current[i]).filter(Boolean)); setTerms(r.terms); setSel(0);
    });
  }, [q, open, engine.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions: Action[] = q ? [] : [
    { id: "theme", label: theme === "dark" ? t("Passer au thème clair") : t("Passer au thème sombre"), icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, run: onToggleTheme },
    { id: "favs", label: t("Ma sélection (favoris)"), icon: <Heart className="h-4 w-4" />, run: onFavs },
    { id: "stats", label: t("Santé du crawl"), icon: <Activity className="h-4 w-4" />, run: onStats },
    { id: "about", label: t("À propos / Comment ça marche"), icon: <Info className="h-4 w-4" />, run: onAbout },
  ];
  const total = items.length + actions.length;
  const activate = (i: number) => {
    if (i < items.length) onPick(items[i]); else actions[i - items.length]?.run();
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % Math.max(total, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + total) % Math.max(total, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (total) activate(sel); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  useEffect(() => { document.getElementById(`cp-opt-${sel}`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.15 }} />
          <motion.div role="dialog" aria-modal="true" aria-label={t("Palette de commandes")}
            className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-surface shadow-pop"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }} transition={{ duration: 0.16 }}>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 text-subtle" aria-hidden="true" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                role="combobox" aria-expanded="true" aria-controls="cp-list" aria-activedescendant={total ? `cp-opt-${sel}` : undefined} aria-label={t("Rechercher")}
                placeholder={t("Chercher partout : skills, hooks, mods…")} autoComplete="off" spellCheck={false}
                className="h-12 flex-1 bg-transparent text-[15px] placeholder:text-subtle focus:outline-none" />
              <Kbd>Esc</Kbd>
            </div>
            <ul id="cp-list" role="listbox" className="scroll-thin max-h-[50vh] overflow-y-auto p-2">
              {items.map((it, i) => (
                <li key={it.id} id={`cp-opt-${i}`} role="option" aria-selected={sel === i} onMouseMove={() => setSel(i)} onClick={() => activate(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${sel === i ? "bg-surface-2" : ""}`}>
                  <TypeBadge type={it.type} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[13px] font-medium"><Highlight text={it.name} terms={terms} /></div>
                    <div className="truncate text-xs text-muted">{lang === "fr" ? it.summary : it.summary_en}</div>
                  </div>
                  {sel === i && <CornerDownLeft className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />}
                </li>
              ))}
              {actions.map((a, j) => {
                const i = items.length + j;
                return (
                  <li key={a.id} id={`cp-opt-${i}`} role="option" aria-selected={sel === i} onMouseMove={() => setSel(i)} onClick={() => activate(i)}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${sel === i ? "bg-surface-2" : ""}`}>
                    <span className="text-muted">{a.icon}</span>{a.label}
                  </li>
                );
              })}
              {q && items.length === 0 && <li role="presentation" className="px-3 py-8 text-center text-sm text-muted">{t("Aucun résultat pour « {q} »", { q })}</li>}
            </ul>
            <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-subtle">
              <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> {t("naviguer")}</span>
              <span className="inline-flex items-center gap-1"><Kbd>↵</Kbd> {t("ouvrir")}</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
