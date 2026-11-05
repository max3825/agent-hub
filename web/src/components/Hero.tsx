import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { timeAgo, TYPE_LABEL } from "../lib/format";
import { TYPES, type ItemType, type Manifest } from "../lib/types";
import { TYPE_BG, TYPE_TEXT } from "./ui";

function Counter({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString("fr-FR"));
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
          Tout ce qui étend vos agents de code, <span className="text-muted">au même endroit.</span>
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-[15px] text-muted">
          Un méta-annuaire des skills, hooks et mods pour Claude Code, Codex, Cursor et consorts — agrégés depuis GitHub, skills.sh et les marketplaces, mis à jour toutes les 12 heures.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          {TYPES.map((t: ItemType) => (
            <div key={t} className="flex items-baseline gap-2">
              <span className={`h-2 w-2 translate-y-[-1px] rounded-full ${TYPE_BG[t]}`} aria-hidden="true" />
              <span className={`text-2xl font-semibold tabular-nums ${TYPE_TEXT[t]}`}>{manifest ? <Counter value={manifest.counts[t]} /> : "—"}</span>
              <span className="text-muted">{TYPE_LABEL[t].toLowerCase()}</span>
            </div>
          ))}
          {manifest && (
            <span className="text-xs text-subtle" title={new Date(manifest.generatedAt).toLocaleString("fr-FR")}>
              · mis à jour {timeAgo(manifest.generatedAt)}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
