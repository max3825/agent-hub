import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
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
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Retour à l'annuaire</button>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Comment ça marche</h1>
      <p className="mt-3 text-[15px] text-muted">Agent Hub est un annuaire statique : un robot parcourt des sources publiques, normalise ce qu'il trouve, puis le site est reconstruit. Rien n'est hébergé ici que des métadonnées et un lien.</p>

      <Section title="Les trois types">
        <p><strong className="text-skill">Skills</strong> — un dossier contenant un <C>SKILL.md</C> (standard Agent Skills) que l'agent charge quand c'est pertinent.</p>
        <p><strong className="text-hook">Hooks</strong> — des automatisations déclenchées par des événements (<C>hooks/hooks.json</C>, scripts shell). Ils s'exécutent sur votre machine.</p>
        <p><strong className="text-mod">Mods</strong> — extensions de l'interface ou du comportement : status lines, slash commands, sous-agents, styles de sortie, thèmes… Il n'existe pas de format standard : la détection est <em>configurable</em> (<C>crawler/sources.yaml</C>) et donc approximative.</p>
      </Section>

      <Section title="Sources et fréquence">
        <p>Dépôts GitHub trouvés via des topics (<C>claude-code</C>, <C>agent-skills</C>…) et la recherche de code, marketplaces de plugins (<C>marketplace.json</C>), listes « awesome » et, de façon optionnelle, l'annuaire skills.sh.</p>
        <p>Une GitHub Action relance le tout <strong className="text-ink">toutes les 12 heures</strong>, régénère l'index, reconstruit et redéploie le site. La date de dernière mise à jour s'affiche sous le titre.</p>
        <p>Les résumés sont courts, générés automatiquement (ou repris de la description de l'auteur) : en cas de doute, la source fait foi. <button onClick={onStats} className="underline hover:text-ink">Voir la santé du dernier crawl</button>.</p>
      </Section>

      <Section title="Le niveau de risque : une heuristique, pas un audit">
        <p>Chaque entrée est passée au crible de motifs simples : <C>curl … | sh</C>, <C>eval</C>, <C>rm -rf</C>, lecture de <C>~/.ssh</C>, <C>.env</C> ou de jetons, envoi réseau suspect, base64 douteux.</p>
        <p><strong className="text-ink">Limites :</strong> un « risque faible » ne garantit rien (code obfusqué, dépendances compromises, scripts appelés indirectement) ; un « risque élevé » peut être un faux positif (par exemple une liste de commandes interdites). Lisez toujours le code d'un hook avant de l'activer.</p>
      </Section>

      <Section title="Proposer une source">
        <p>Ouvrez une <em>pull request</em> qui ajoute votre dépôt, marketplace ou liste « awesome » dans <C>crawler/sources.yaml</C>, ou ouvrez une issue avec le lien. Les dépôts sont filtrés selon un nombre minimal d'étoiles, l'absence d'archivage et une activité récente.</p>
        <a href={repoUrl} target="_blank" rel="noreferrer" className="btn mt-2 inline-flex"><GithubIcon />Ouvrir le dépôt du projet</a>
      </Section>

      <Section title="Licences et respect des auteurs">
        <p>Agent Hub n'affiche que des métadonnées (nom, résumé, étoiles, licence) et renvoie vers la source. Aucun contenu complet n'est copié.</p>
      </Section>
    </motion.main>
  );
}
