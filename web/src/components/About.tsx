import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { t } from "../lib/i18n";
import { GithubIcon } from "./ui";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-t border-line py-8">
    <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
    <div className="space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
  </section>
);
const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-ink">{children}</code>;

export default function About({ onBack, repoUrl, onStats }: { onBack: () => void; repoUrl: string; onStats: () => void }) {
  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-3xl px-4 py-10">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />{t("Retour à l'annuaire")}</button>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("Comment ça marche")}</h1>
      <p className="mt-3 text-[15px] text-muted">{t("Agent Hub est un annuaire statique : un robot parcourt des sources publiques, normalise ce qu'il trouve, puis le site est reconstruit. Rien n'est hébergé ici que des métadonnées, un court extrait et un lien.")}</p>

      <Section title={t("Les trois types")}>
        <p><strong className="text-skill">Skills</strong> — {t("un dossier contenant un")} <C>SKILL.md</C> {t("(standard Agent Skills) que l'agent charge quand c'est pertinent.")}</p>
        <p><strong className="text-hook">Hooks</strong> — {t("des automatisations déclenchées par des événements")} (<C>hooks/hooks.json</C>, {t("scripts shell")}). {t("Ils s'exécutent sur votre machine.")}</p>
        <p><strong className="text-mod">Mods</strong> — {t("extensions de l'interface ou du comportement : status lines, slash commands, sous-agents, styles de sortie, thèmes… Il n'existe pas de format standard : la détection est configurable (crawler/sources.yaml), donc approximative, et chaque mod reçoit un score de confiance.")}</p>
      </Section>

      <Section title={t("Sources et fréquence")}>
        <p>{t("Dépôts GitHub trouvés via des topics et la recherche de code, marketplaces de plugins, listes « awesome » et, de façon optionnelle, l'annuaire skills.sh.")}</p>
        <p>{t("Une GitHub Action relance le tout")} <strong className="text-ink">{t("toutes les 12 heures")}</strong>{t(", régénère l'index, reconstruit et redéploie le site. La date de dernière mise à jour s'affiche sous le titre.")}</p>
        <p>{t("Les résumés sont courts, générés automatiquement (ou repris de la description de l'auteur) : en cas de doute, la source fait foi.")} <button onClick={onStats} className="underline hover:text-ink">{t("Voir la santé du dernier crawl")}</button>.</p>
      </Section>

      <Section title={t("Le niveau de risque : une heuristique, pas un audit")}>
        <p>{t("Chaque entrée est passée au crible de motifs simples :")} <C>curl … | sh</C>, <C>eval</C>, <C>rm -rf</C>, {t("lecture de")} <C>~/.ssh</C>, <C>.env</C> {t("ou de jetons, envoi réseau suspect, base64 douteux.")}</p>
        <p><strong className="text-ink">{t("Limites :")}</strong> {t("un « risque faible » ne garantit rien (code obfusqué, dépendances compromises, scripts appelés indirectement) ; un « risque élevé » peut être un faux positif (par exemple une liste de commandes interdites). Lisez toujours le code d'un hook avant de l'activer.")}</p>
      </Section>

      <Section title={t("Proposer une source")}>
        <p>{t("Ouvrez une pull request qui ajoute votre dépôt, marketplace ou liste « awesome » dans crawler/sources.yaml, ou ouvrez une issue avec le lien. Les dépôts sont filtrés selon un nombre minimal d'étoiles, l'absence d'archivage et une activité récente.")}</p>
        <a href={repoUrl} target="_blank" rel="noreferrer" className="btn mt-2 inline-flex"><GithubIcon />{t("Ouvrir le dépôt du projet")}</a>
      </Section>

      <Section title={t("Licences et respect des auteurs")}>
        <p>{t("Agent Hub n'affiche que des métadonnées (nom, résumé, étoiles, licence), un court extrait et un lien vers la source. Aucun contenu complet n'est copié.")}</p>
      </Section>
    </motion.main>
  );
}
