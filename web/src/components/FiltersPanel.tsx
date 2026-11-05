import { RotateCcw } from "lucide-react";
import { agentLabel, RISK_META } from "../lib/format";
import { emptyFilters, type Facets, type Filters, type RiskLevel } from "../lib/types";

const ACTIVITY = [[0, "Peu importe"], [30, "30 jours"], [90, "3 mois"], [365, "1 an"]] as const;
const STARS = [0, 10, 100, 500, 1000];

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="border-b border-line py-4 first:pt-0 last:border-0">
      <legend className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-subtle">{title}</legend>
      {children}
      {hint && <p className="mt-2 text-[11px] leading-snug text-subtle">{hint}</p>}
    </fieldset>
  );
}

function Check({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="group flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-muted hover:text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 rounded border-line-strong accent-[rgb(var(--accent))]" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-[11px] tabular-nums text-subtle">{count}</span>}
    </label>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function FiltersPanel({ facets, filters, onChange }: { facets: Facets; filters: Filters; onChange: (f: Filters) => void }) {
  const active = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  return (
    <div className="text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filtres</h2>
        {active && (
          <button onClick={() => onChange({ ...emptyFilters })} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Réinitialiser
          </button>
        )}
      </div>

      <Group title="Agent compatible">
        {facets.agents.map(([a, n]) => <Check key={a} label={agentLabel(a)} count={n} checked={filters.agents.includes(a)} onChange={() => onChange({ ...filters, agents: toggle(filters.agents, a) })} />)}
      </Group>

      <Group title="Niveau de risque" hint="Heuristique automatique (motifs de commandes suspects). Ce n'est pas un audit : relisez toujours le code avant d'installer.">
        {facets.risks.map(([r, n]) => <Check key={r} label={RISK_META[r as RiskLevel]?.label ?? r} count={n} checked={filters.risks.includes(r as RiskLevel)} onChange={() => onChange({ ...filters, risks: toggle(filters.risks, r as RiskLevel) })} />)}
      </Group>

      <Group title="Dernière activité">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dernière activité">
          {ACTIVITY.map(([d, l]) => (
            <button key={d} role="radio" aria-checked={filters.activityDays === d} onClick={() => onChange({ ...filters, activityDays: d })}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${filters.activityDays === d ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      </Group>

      <Group title="Étoiles minimum">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Étoiles minimum">
          {STARS.map((s) => (
            <button key={s} role="radio" aria-checked={filters.minStars === s} onClick={() => onChange({ ...filters, minStars: s })}
              className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors ${filters.minStars === s ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>{s === 0 ? "Toutes" : `${s}+`}</button>
          ))}
        </div>
      </Group>

      <Group title="Licence">
        {facets.licenses.map(([l, n]) => <Check key={l} label={l} count={n} checked={filters.licenses.includes(l)} onChange={() => onChange({ ...filters, licenses: toggle(filters.licenses, l) })} />)}
      </Group>

      <Group title="Tags">
        <div className="flex flex-wrap gap-1.5">
          {facets.tags.map(([t, n]) => (
            <button key={t} aria-pressed={filters.tags.includes(t)} onClick={() => onChange({ ...filters, tags: toggle(filters.tags, t) })}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${filters.tags.includes(t) ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>
              {t} <span className="text-subtle">{n}</span>
            </button>
          ))}
        </div>
      </Group>
    </div>
  );
}
