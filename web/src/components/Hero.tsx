import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { timeAgo, typeLabel } from "../lib/format";
import { locale, t } from "../lib/i18n";
import { TYPES, type ItemType, type Manifest } from "../lib/types";
import { TYPE_BG, TYPE_TEXT } from "./ui";

function Counter({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString(locale()));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span>{text}</motion.span>;
}

export function Hero({ manifest }: { manifest: Manifest | null }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:py-14">
        <h1 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
          {t("Tout ce qui étend vos agents de code,")} <span className="text-muted">{t("au même endroit.")}</span>
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-[15px] text-muted">
          {t("Un méta-annuaire des skills, hooks et mods pour Claude Code, Codex, Cursor et consorts — agrégés depuis GitHub, skills.sh et les marketplaces, mis à jour toutes les 12 heures.")}
        </p>
        <div className="mt-7 flex min-h-10 flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          {TYPES.map((ty: ItemType) => (
            <div key={ty} className="flex items-baseline gap-2">
              <span className={`h-2 w-2 translate-y-[-1px] rounded-full ${TYPE_BG[ty]}`} aria-hidden="true" />
              <span className={`text-2xl font-semibold tabular-nums ${TYPE_TEXT[ty]}`}>{manifest ? <Counter value={manifest.counts[ty]} /> : "—"}</span>
              <span className="text-muted">{typeLabel(ty).toLowerCase()}</span>
            </div>
          ))}
          {manifest && (
            <span className="text-xs text-subtle" title={new Date(manifest.generatedAt).toLocaleString(locale())}>
              · {t("mis à jour {when}", { when: timeAgo(manifest.generatedAt) })}
            </span>
          )}
        </div>
        <p className="mt-4 min-h-5 text-xs text-muted">
          {manifest?.demo && (<><strong className="text-ink">{t("Données de démonstration")}</strong> — {t("entrées fictives. Lancez")} <code className="font-mono">python -m crawler</code> {t("puis")} <code className="font-mono">npm run dev:real</code> {t("pour voir les vraies données.")}</>)}
        </p>
      </div>
    </section>
  );
}
