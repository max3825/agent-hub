import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ExternalLink, Link2, ShieldAlert, X } from "lucide-react";
import type { Item, ItemDetail } from "../lib/types";
import { agentLabel, fullDate, timeAgo, typeBlurb, riskLabel } from "../lib/format";
import { locale, t } from "../lib/i18n";
import { loadDetail } from "../lib/details";
import { installOptions, shareUrl } from "../lib/install";
import { CopyButton, copyText } from "./CopyButton";
import { FavButton } from "./FavButton";
import { AgentPills, ConfidenceBadge, GithubIcon, RiskBadge, Stars, TrendBadge, TypeBadge } from "./ui";

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-2 text-sm"><dt className="shrink-0 text-subtle">{k}</dt><dd className="min-w-0 truncate text-right text-ink">{children}</dd></div>;
}

function InstallTabs({ item }: { item: Item }) {
  const options = installOptions(item); // pas de useMemo : les notes suivent la langue
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [item.id]);
  const o = options[Math.min(sel, options.length - 1)];
  if (!o) return <p className="rounded-md border border-dashed border-line p-3 text-sm text-muted">{t("Pas de commande d'installation connue : consultez le dépôt source.")}</p>;
  const reason = item.agentSignals?.[o.agent];
  return (
    <div>
      {options.length > 1 && (
        <div role="tablist" aria-label={t("Installer pour")} className="mb-2 flex flex-wrap gap-1">
          {options.map((x, i) => (
            <button key={x.agent} role="tab" aria-selected={i === sel} onClick={() => setSel(i)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${i === sel ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink"}`}>{x.label}</button>
          ))}
        </div>
      )}
      <pre className="scroll-thin overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed" tabIndex={0}><code>{o.commands.join("\n")}</code></pre>
      <p className="mt-1.5 text-[11px] leading-snug text-subtle">
        {o.note}{reason && <> {t("Compatibilité {agent} : {reason}.", { agent: o.label, reason: t(reason) })}</>}
      </p>
      <div className="mt-2"><CopyButton text={o.commands.join("\n")} label={t("Copier la commande d'install")} /></div>
    </div>
  );
}

export function Drawer({ item, lang, onClose, similar, onOpen }: {
  item: Item | null; lang: "fr" | "en"; onClose: () => void; similar: (id: string, n?: number) => Promise<Item[]>; onOpen: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [related, setRelated] = useState<Item[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    setDetail(null); setRelated([]);
    if (!item) return;
    let live = true;
    loadDetail(item.id).then((d) => live && setDetail(d));
    similar(item.id, 6).then((r) => live && setRelated(r));
    panelRef.current?.scrollTo({ top: 0 });
    return () => { live = false; };
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!item) return;
    opener.current = document.activeElement;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && panelRef.current) { // piège de focus
        const f = panelRef.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,[tabindex='0']");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; (opener.current as HTMLElement | null)?.focus?.(); };
  }, [!!item]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = async () => { if (!item) return; await copyText(shareUrl(item.id)); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); };

  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50" key="drawer">
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }} />
          <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="drawer-title"
            className="scroll-thin absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-xl border border-line bg-surface shadow-pop focus:outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[540px] sm:rounded-none sm:rounded-l-xl"
            initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}>
            <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-line bg-surface/95 p-5 backdrop-blur">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><TypeBadge type={item.type} /><RiskBadge level={item.risk.level} /><ConfidenceBadge value={item.modConfidence} /></div>
                <h2 id="drawer-title" className="mt-2 break-words font-mono text-lg font-semibold">{item.name}</h2>
                <p className="mt-0.5 truncate font-mono text-xs text-subtle">{item.source.repo}</p>
              </div>
              <FavButton id={item.id} name={item.name} />
              <button onClick={copyLink} className="icon-btn !h-8 !w-8" aria-label={t("Copier le lien de partage")} title={linkCopied ? t("Lien copié !") : t("Copier le lien de partage")}>
                <Link2 className={`h-4 w-4 ${linkCopied ? "text-ok" : ""}`} />
              </button>
              <button onClick={onClose} className="icon-btn !h-8 !w-8" aria-label={t("Fermer le panneau")}><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-6 p-5">
              <section>
                <p className="text-[15px] leading-relaxed">{lang === "fr" ? item.summary : item.summary_en}</p>
                {item.summary === item.summary_en && <p className="mt-1.5 text-[11px] text-subtle">{t("Résumé dans la langue d'origine (pas de traduction disponible).")}</p>}
                <p className="mt-2 text-xs text-subtle">{typeBlurb(item.type)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
              </section>

              {item.modConfidence !== undefined && item.modConfidence < 0.7 && (
                <p className="rounded-md border border-line bg-surface-2/50 p-3 text-[13px] text-muted">
                  <strong className="text-ink">{t("Détection incertaine ({p} %).", { p: Math.round(item.modConfidence * 100) })}</strong> {t("Il n'existe pas de format standard pour les mods : celui-ci a été repéré par heuristique. Vérifiez le dépôt avant de l'utiliser.")}
                </p>
              )}

              {detail?.preview && (
                <section aria-labelledby="preview-h">
                  <h3 id="preview-h" className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t("Aperçu")}</h3>
                  <blockquote className="max-h-56 overflow-y-auto whitespace-pre-line rounded-md border-l-2 border-accent bg-surface-2/50 px-4 py-3 text-[13px] leading-relaxed text-muted scroll-thin" tabIndex={0}>{detail.preview}</blockquote>
                  {detail.outline && detail.outline.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("Sommaire du fichier")}>{detail.outline.map((h) => <li key={h} className="chip">{h}</li>)}</ul>
                  )}
                  <p className="mt-2 text-[11px] text-subtle">{t("Extrait court du fichier source, sous la licence de son auteur.")} <a className="underline hover:text-ink" href={item.source.url} target="_blank" rel="noreferrer noopener">{t("Lire l'original")}</a>.</p>
                </section>
              )}

              {item.type === "hook" && (
                <section aria-labelledby="hook-warn" className={`rounded-lg border p-4 ${item.risk.level === "high" ? "border-danger/40 bg-danger/10" : "border-warn/30 bg-warn/10"}`}>
                  <h3 id="hook-warn" className="flex items-center gap-2 text-sm font-semibold">
                    {item.risk.level === "high" ? <ShieldAlert className="h-4 w-4 text-danger" /> : <AlertTriangle className="h-4 w-4 text-warn" />}
                    {t("Ce hook exécute des commandes sur votre machine")}
                  </h3>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{t("Un hook s'exécute avec vos droits, automatiquement. Relisez les commandes ci-dessous et le code source avant de l'activer.")}</p>
                  {item.hookCommands && item.hookCommands.length > 0 && (
                    <pre className="scroll-thin mt-3 overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed" tabIndex={0} aria-label={t("Commandes exécutées par le hook")}><code>{item.hookCommands.join("\n")}</code></pre>
                  )}
                  {item.risk.flags.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {item.risk.flags.map((f) => <li key={f} className="flex gap-2 text-[13px]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" /><span>{f}</span></li>)}
                    </ul>
                  )}
                  <p className="mt-3 text-[11px] text-subtle">{t("Niveau « {level} » : analyse heuristique automatique, pas un audit de sécurité.", { level: riskLabel(item.risk.level) })}</p>
                </section>
              )}
              {item.type !== "hook" && item.risk.flags.length > 0 && (
                <section className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-[13px]">
                  <h3 className="mb-1.5 font-semibold">{t("Alertes du scan (heuristique)")}</h3>
                  <ul className="list-disc space-y-1 pl-4">{item.risk.flags.map((f) => <li key={f}>{f}</li>)}</ul>
                </section>
              )}

              <section className="space-y-3" aria-label={t("Installation")}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle">{t("Installation")}</h3>
                <InstallTabs item={item} />
                <a href={item.source.url} target="_blank" rel="noreferrer noopener" className="btn w-full"><GithubIcon />{t("Voir la source")}<ExternalLink className="h-3.5 w-3.5 text-subtle" aria-hidden="true" /></a>
              </section>

              <dl className="divide-y divide-line rounded-lg border border-line px-4">
                <Meta k={t("Étoiles")}><span className="inline-flex items-center gap-2"><Stars n={item.stars} /><TrendBadge d7={item.trend?.d7} /></span></Meta>
                {item.trend && item.trend.d30 > 0 && <Meta k={t("Sur 30 jours")}>+{item.trend.d30.toLocaleString(locale())} ★</Meta>}
                <Meta k={t("Licence")}>{item.license ?? t("Non renseignée")}</Meta>
                {item.createdAt && <Meta k={t("Créé le")}><span title={item.createdExact ? t("Date du premier commit sur ce chemin") : t("Approximation : date de création du dépôt")}>{item.createdExact ? "" : "~ "}{fullDate(item.createdAt)}</span></Meta>}
                <Meta k={t("Dernier commit")}><span title={fullDate(item.lastCommit)}>{timeAgo(item.lastCommit)}</span></Meta>
                <Meta k={t("Repéré le")}>{fullDate(item.firstSeen)}</Meta>
                <Meta k={t("Chemin")}><span className="font-mono text-xs">{item.source.path}</span></Meta>
                <Meta k={t("Origine")}>{item.source.origin}</Meta>
                <Meta k={t("Agents")}><span className="inline-flex items-center gap-2"><AgentPills agents={item.agents} max={6} /><span className="hidden text-xs text-muted sm:inline">{item.agents.map(agentLabel).join(", ")}</span></span></Meta>
              </dl>

              {related.length > 0 && (
                <section aria-labelledby="sim-h">
                  <h3 id="sim-h" className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">{t("Éléments similaires")}</h3>
                  <ul className="space-y-1.5">
                    {related.map((r) => (
                      <li key={r.id}>
                        <button onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2/60">
                          <TypeBadge type={r.type} />
                          <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[13px] font-medium">{r.name}</span><span className="block truncate text-xs text-muted">{lang === "fr" ? r.summary : r.summary_en}</span></span>
                          <Stars n={r.stars} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <p className="text-[11px] leading-snug text-subtle">{t("Agent Hub n'indexe que des métadonnées, un court extrait et un résumé ; le contenu appartient à son auteur et reste soumis à sa licence.")}</p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
