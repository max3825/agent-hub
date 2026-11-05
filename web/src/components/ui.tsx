import { memo, useMemo, type ReactNode } from "react";
import { AlertTriangle, HelpCircle, ShieldAlert, ShieldCheck, Star, TrendingUp } from "lucide-react";
import type { ItemType, RiskLevel } from "../lib/types";
import { riskLabel, riskShort, typeSingular, agentLabel, agentShort, compact, escapeRegExp } from "../lib/format";
import { locale, t } from "../lib/i18n";

export const TYPE_TEXT: Record<ItemType, string> = { skill: "text-skill", hook: "text-hook", mod: "text-mod" };
export const TYPE_BG: Record<ItemType, string> = { skill: "bg-skill", hook: "bg-hook", mod: "bg-mod" };
const TYPE_SOFT: Record<ItemType, string> = {
  skill: "bg-skill/10 text-skill border-skill/25",
  hook: "bg-hook/10 text-hook border-hook/25",
  mod: "bg-mod/10 text-mod border-mod/25",
};

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <rect x="7" y="8" width="18" height="4" rx="2" className="fill-skill" style={{ filter: "brightness(1.05)" }} />
      <rect x="7" y="14" width="13" height="4" rx="2" className="fill-hook" />
      <rect x="7" y="20" width="16" height="4" rx="2" className="fill-mod" />
    </svg>
  );
}

export function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export const TypeBadge = memo(function TypeBadge({ type }: { type: ItemType }) {
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TYPE_SOFT[type]}`}>{typeSingular(type)}</span>;
});

const RISK_STYLE: Record<RiskLevel, string> = {
  low: "text-ok border-ok/30 bg-ok/10",
  medium: "text-warn border-warn/35 bg-warn/10",
  high: "text-danger border-danger/40 bg-danger/10",
  "n/a": "text-subtle border-line",
};
export function RiskBadge({ level, compactMode = false }: { level: RiskLevel; compactMode?: boolean }) {
  if (level === "n/a") return null;
  const Icon = level === "low" ? ShieldCheck : level === "medium" ? AlertTriangle : ShieldAlert;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${RISK_STYLE[level]}`}
      title={t("Estimation heuristique automatique — ce n'est pas un audit de sécurité.")}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {compactMode ? riskShort(level) : riskLabel(level)}
    </span>
  );
}

export function AgentPills({ agents, max = 4 }: { agents: string[]; max?: number }) {
  const shown = agents.slice(0, max);
  return (
    <ul className="flex items-center -space-x-1" aria-label={t("Agents compatibles : {list}", { list: agents.map(agentLabel).join(", ") })}>
      {shown.map((a) => (
        <li key={a} title={agentLabel(a)} aria-hidden="true"
          className="flex h-5 min-w-5 items-center justify-center rounded-full border border-bg bg-surface-2 px-1 font-mono text-[9px] font-semibold text-muted ring-1 ring-line">
          {agentShort(a)}
        </li>
      ))}
      {agents.length > max && <li className="pl-2 text-[11px] text-subtle" aria-hidden="true">+{agents.length - max}</li>}
    </ul>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted" title={t("{n} étoiles GitHub", { n: n.toLocaleString(locale()) })}>
      <Star className="h-3.5 w-3.5" aria-hidden="true" />{compact(n)}
      <span className="sr-only"> {t("étoiles")}</span>
    </span>
  );
}

/** Surligne les termes (insensible à la casse et aux accents simples). */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const re = useMemo(() => {
    const t = terms.filter((x) => x.length > 1).sort((a, b) => b.length - a.length).map(escapeRegExp);
    return t.length ? new RegExp(`(${t.join("|")})`, "gi") : null;
  }, [terms]);
  if (!re) return <>{text}</>;
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="hl">{p}</mark> : p))}</>;
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd>; }

export function SkeletonCard() {
  return (
    <div className="card-surface p-4" aria-hidden="true">
      <div className="flex items-center gap-2"><div className="skeleton h-4 w-12 rounded" /><div className="skeleton h-4 w-40 rounded" /></div>
      <div className="skeleton mt-3 h-3 w-full rounded" /><div className="skeleton mt-2 h-3 w-3/4 rounded" />
      <div className="mt-4 flex gap-3"><div className="skeleton h-3 w-10 rounded" /><div className="skeleton h-3 w-16 rounded" /></div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
      <svg viewBox="0 0 120 90" className="mb-5 h-24 w-32" aria-hidden="true">
        <rect x="14" y="18" width="92" height="14" rx="7" className="fill-surface-2 stroke-line" />
        <rect x="14" y="38" width="64" height="14" rx="7" className="fill-surface-2 stroke-line" />
        <rect x="14" y="58" width="78" height="14" rx="7" className="fill-surface-2 stroke-line" />
        <circle cx="94" cy="62" r="16" className="fill-bg stroke-accent" strokeWidth="2.5" />
        <path d="M105 74l10 10" className="stroke-accent" strokeWidth="3" strokeLinecap="round" />
        <path d="M88 56l12 12M100 56L88 68" className="stroke-subtle" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}


/** Gain d'étoiles sur 7 jours (si connu et positif). */
export function TrendBadge({ d7 }: { d7?: number }) {
  if (!d7 || d7 <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ok" title={t("Étoiles gagnées depuis le relevé d'il y a ~7 jours")}>
      <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />+{d7.toLocaleString(locale())}<span className="sr-only"> {t("étoiles cette semaine")}</span>
    </span>
  );
}

/** Mods : la détection repose sur des heuristiques ; en dessous de 0,7 de confiance, on le dit. */
export function ConfidenceBadge({ value }: { value?: number }) {
  if (value === undefined || value >= 0.7) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] text-subtle"
      title={t("Confiance de la détection : {p} %. Ce mod a été repéré par heuristique ; vérifiez la source.", { p: Math.round(value * 100) })}>
      <HelpCircle className="h-3 w-3" aria-hidden="true" />{t("Détection incertaine")}
    </span>
  );
}
