import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Heart, Link2, Trash2 } from "lucide-react";
import type { Item } from "../lib/types";
import { useFavorites } from "../lib/favorites";
import { t } from "../lib/i18n";
import { buildInstallPlan } from "../lib/install";
import { CopyButton, copyText } from "./CopyButton";
import { FavButton } from "./FavButton";
import { EmptyState, RiskBadge, Stars, TypeBadge } from "./ui";
import { useState } from "react";

export default function FavoritesPage({ items, sharedIds, ready, lang, onOpen, onBack }: {
  items: Item[]; sharedIds: string[]; ready: boolean; lang: "fr" | "en"; onOpen: (id: string) => void; onBack: () => void;
}) {
  const fav = useFavorites();
  const [linkOk, setLinkOk] = useState(false);
  const shared = sharedIds.length > 0;
  const ids = shared ? sharedIds : fav.ids;
  const list = useMemo(() => { const m = new Map(items.map((i) => [i.id, i])); return ids.map((id) => m.get(id)).filter((x): x is Item => !!x); }, [items, ids]);
  const plan = useMemo(() => buildInstallPlan(list), [list]);
  const hasRisky = list.some((i) => i.risk.level === "high");

  const share = async () => {
    const u = new URL(location.href); u.search = `?page=favs&ids=${ids.join(",")}`;
    await copyText(u.href); setLinkOk(true); setTimeout(() => setLinkOk(false), 1800);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([plan.shell], { type: "text/x-shellscript" }));
    const a = document.createElement("a"); a.href = url; a.download = "agent-hub-install.sh"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-4xl px-4 py-10">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />{t("Retour à l'annuaire")}</button>
      <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight"><Heart className="h-7 w-7 text-danger" fill="currentColor" aria-hidden="true" />{shared ? t("Sélection partagée") : t("Ma sélection")}</h1>
      <p className="mt-2 text-[15px] text-muted">
        {shared ? t("Une sélection envoyée par lien.") : t("Vos favoris sont stockés dans ce navigateur.")}{" "}
        {t("Exportez-les en un script d'installation, ou partagez-les par lien.")}
      </p>

      {!ready ? <p className="mt-10 text-sm text-muted">{t("Chargement…")}</p> : list.length === 0 ? (
        <EmptyState title={t("Aucun favori pour l'instant")} hint={t("Cliquez sur le cœur d'une carte ou d'une fiche pour la garder ici.")} />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={share} className="btn"><Link2 className="h-4 w-4" />{linkOk ? t("Lien copié !") : t("Copier le lien de partage")}</button>
            {shared && <button onClick={() => fav.addMany(ids)} className="btn btn-primary"><Heart className="h-4 w-4" />{t("Ajouter à mes favoris")}</button>}
            {!shared && <button onClick={() => { if (confirm(t("Vider toute la sélection ?"))) fav.clear(); }} className="btn"><Trash2 className="h-4 w-4" />{t("Vider")}</button>}
          </div>

          <ul className="mt-6 space-y-2">
            {list.map((it) => (
              <li key={it.id} className="card-surface flex items-center gap-3 p-3">
                <button onClick={() => onOpen(it.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <TypeBadge type={it.type} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[13.5px] font-semibold">{it.name}</span><span className="block truncate text-xs text-muted">{lang === "fr" ? it.summary : it.summary_en}</span></span>
                  <RiskBadge level={it.risk.level} compactMode /><Stars n={it.stars} />
                </button>
                <FavButton id={it.id} name={it.name} />
              </li>
            ))}
          </ul>

          <section className="mt-10" aria-labelledby="plan-h">
            <h2 id="plan-h" className="text-lg font-semibold">{t("Script d'installation")}</h2>
            <p className="mt-1 text-[13px] text-muted">{t("Relisez chaque commande avant de l'exécuter.")}{hasRisky && <strong className="text-danger"> {t("Les éléments à risque élevé sont désactivés (commentés) dans le script.")}</strong>}</p>
            <pre className="scroll-thin mt-3 max-h-72 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed" tabIndex={0}><code>{plan.shell}</code></pre>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <CopyButton text={plan.shell} label={t("Copier le script shell")} />
              <button onClick={download} className="btn"><Download className="h-4 w-4" />{t("Télécharger le .sh")}</button>
            </div>
            {plan.claude && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">{t("À saisir dans Claude Code")}</h3>
                <pre className="scroll-thin mt-2 max-h-52 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed" tabIndex={0}><code>{plan.claude}</code></pre>
                <div className="mt-2"><CopyButton text={plan.claude} label={t("Copier les commandes /plugin")} primary={false} /></div>
              </div>
            )}
          </section>
        </>
      )}
    </motion.main>
  );
}
