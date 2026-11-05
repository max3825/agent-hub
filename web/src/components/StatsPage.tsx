import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import type { CrawlStats } from "../lib/types";
import { loadStats } from "../lib/details";
import { timeAgo, TYPE_LABEL } from "../lib/format";
import { EmptyState } from "./ui";

const REASONS: Record<string, string> = { low_stars: "Pas assez d'étoiles", inactive: "Inactifs", archived: "Archivés", fork: "Forks" };
const ADAPTERS: Record<string, string> = { github_topics: "Topics GitHub", marketplaces: "Marketplaces", awesome_lists: "Listes « awesome »", skills_sh: "skills.sh", github_code_search: "Recherche de code" };

function Card({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return <div className="card-surface p-4"><div className="text-2xl font-semibold tabular-nums">{value}</div><div className="mt-0.5 text-sm text-muted">{label}</div>{hint && <div className="mt-1 text-[11px] text-subtle">{hint}</div>}</div>;
}
function Bars({ data, labels }: { data: Record<string, number>; labels?: Record<string, string> }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <ul className="space-y-2">
      {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
        <li key={k} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-muted">{labels?.[k] ?? k}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="w-10 text-right tabular-nums">{v}</span>
        </li>
      ))}
    </ul>
  );
}

export default function StatsPage({ onBack }: { onBack: () => void }) {
  const [s, setS] = useState<CrawlStats | null | undefined>(undefined);
  useEffect(() => { loadStats().then(setS); }, []);
  const dur = (n?: number) => (n === undefined ? "—" : n >= 60 ? `${Math.floor(n / 60)} min ${n % 60} s` : `${n} s`);

  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-4xl px-4 py-10">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Retour à l'annuaire</button>
      <h1 className="text-3xl font-semibold tracking-tight">Santé du crawl</h1>
      <p className="mt-2 text-[15px] text-muted">Ce que le dernier passage du robot a trouvé, écarté ou raté. Utile pour juger de la fiabilité de l'annuaire.</p>

      {s === undefined ? <p className="mt-10 text-sm text-muted">Chargement…</p> : s === null ? (
        <EmptyState title="Statistiques indisponibles" hint="Aucun fichier stats.json n'a été publié avec cette version du site." />
      ) : (
        <div className="mt-8 space-y-10">
          {s.demo && <p className="rounded-md border border-line bg-surface-2/50 p-3 text-[13px] text-muted"><strong className="text-ink">Chiffres de démonstration</strong> — ils illustrent la page ; lancez le crawler pour voir les vrais.</p>}
          {s.truncated && (
            <p className="flex gap-2 rounded-md border border-warn/35 bg-warn/10 p-3 text-[13px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />Le budget de temps a été atteint : {s.stale_cache ?? 0} dépôt(s) reprennent leur dernière analyse connue. Le prochain passage continuera.</p>
          )}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="éléments publiés" value={s.total.toLocaleString("fr-FR")} hint={`mis à jour ${timeAgo(s.generatedAt)}`} />
            <Card label="dépôts parcourus" value={s.repos ?? "—"} hint={s.analyzed !== undefined ? `${s.analyzed} analysés · ${s.from_cache ?? 0} depuis le cache` : undefined} />
            <Card label="doublons retirés" value={s.duplicates_removed ?? "—"} />
            <Card label="durée du crawl" value={dur(s.duration_s)} hint={s.requests ? `${s.requests.toLocaleString("fr-FR")} requêtes` : undefined} />
          </section>

          <section><h2 className="mb-3 text-lg font-semibold">Contenu</h2>
            <Bars data={{ skill: s.counts.skill, hook: s.counts.hook, mod: s.counts.mod }} labels={{ skill: TYPE_LABEL.skill, hook: TYPE_LABEL.hook, mod: TYPE_LABEL.mod }} /></section>

          {s.adapters && (
            <section><h2 className="mb-3 text-lg font-semibold">Sources</h2>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {Object.entries(s.adapters).map(([k, a]) => (
                  <li key={k} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {a.error ? <XCircle className="h-4 w-4 text-danger" aria-label="en échec" /> : <CheckCircle2 className="h-4 w-4 text-ok" aria-label="ok" />}
                    <span className="flex-1">{ADAPTERS[k] ?? k}{a.error && <span className="ml-2 text-xs text-danger">{a.error}</span>}</span>
                    <span className="tabular-nums text-muted">{a.candidates.toLocaleString("fr-FR")} candidats</span>
                  </li>
                ))}
              </ul></section>
          )}

          <div className="grid gap-10 sm:grid-cols-2">
            {s.rejected_by_reason && Object.keys(s.rejected_by_reason).length > 0 && <section><h2 className="mb-3 text-lg font-semibold">Dépôts écartés</h2><Bars data={s.rejected_by_reason} labels={REASONS} /></section>}
            {s.by_origin && <section><h2 className="mb-3 text-lg font-semibold">Origine des éléments</h2><Bars data={s.by_origin} /></section>}
            <section><h2 className="mb-3 text-lg font-semibold">Niveaux de risque</h2><Bars data={s.risk} labels={{ low: "Faible", medium: "À vérifier", high: "Élevé", "n/a": "Non applicable" }} /><p className="mt-2 text-[11px] text-subtle">Analyse heuristique, pas un audit.</p></section>
            <section><h2 className="mb-3 text-lg font-semibold">Qualité des données</h2>
              <ul className="space-y-1.5 text-sm text-muted">
                {s.exact_created !== undefined && <li><span className="tabular-nums text-ink">{Math.round((s.exact_created / Math.max(1, s.total)) * 100)} %</span> des dates de création sont exactes (1er commit) ; les autres sont approximées.</li>}
                {s.mods_dropped_low_confidence !== undefined && <li><span className="tabular-nums text-ink">{s.mods_dropped_low_confidence}</span> mods écartés pour détection trop incertaine.</li>}
                {s.errors !== undefined && <li><span className="tabular-nums text-ink">{s.errors}</span> dépôt(s) en erreur ou inaccessibles.</li>}
              </ul></section>
          </div>
        </div>
      )}
    </motion.main>
  );
}
