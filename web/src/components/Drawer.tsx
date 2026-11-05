import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Copy, ExternalLink, ShieldAlert, X } from "lucide-react";
import type { Item } from "../lib/types";
import { agentLabel, fullDate, timeAgo, TYPE_BLURB, RISK_META } from "../lib/format";
import { AgentPills, GithubIcon, RiskBadge, Stars, TypeBadge } from "./ui";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    setOk(true); setTimeout(() => setOk(false), 1800);
  };
  return (
    <button onClick={copy} className={`btn btn-primary w-full ${ok ? "!bg-ok !text-bg" : ""}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={ok ? "ok" : "idle"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="inline-flex items-center gap-2">
          {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{ok ? "Copié !" : label}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" role="status">{ok ? "Commande copiée dans le presse-papiers" : ""}</span>
    </button>
  );
}

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-2 text-sm"><dt className="text-subtle">{k}</dt><dd className="min-w-0 truncate text-right text-ink">{children}</dd></div>;
}

export function Drawer({ item, lang, onClose }: { item: Item | null; lang: "fr" | "en"; onClose: () => void }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

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
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50" key="drawer">
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }} />
          <motion.aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="drawer-title"
            className="scroll-thin absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-xl border border-line bg-surface shadow-pop focus:outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[520px] sm:rounded-none sm:rounded-l-xl"
            initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}>
            <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-surface/95 p-5 backdrop-blur">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><TypeBadge type={item.type} /><RiskBadge level={item.risk.level} /></div>
                <h2 id="drawer-title" className="mt-2 break-words font-mono text-lg font-semibold">{item.name}</h2>
                <p className="mt-0.5 truncate font-mono text-xs text-subtle">{item.source.repo}</p>
              </div>
              <button onClick={onClose} className="icon-btn -mr-2 -mt-1" aria-label="Fermer le panneau"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-6 p-5">
              <section>
                <p className="text-[15px] leading-relaxed">{lang === "fr" ? item.summary : item.summary_en}</p>
                <p className="mt-2 text-xs text-subtle">{TYPE_BLURB[item.type]}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
              </section>

              {item.type === "hook" && (
                <section aria-labelledby="hook-warn" className={`rounded-lg border p-4 ${item.risk.level === "high" ? "border-danger/40 bg-danger/10" : "border-warn/30 bg-warn/10"}`}>
                  <h3 id="hook-warn" className="flex items-center gap-2 text-sm font-semibold">
                    {item.risk.level === "high" ? <ShieldAlert className="h-4 w-4 text-danger" /> : <AlertTriangle className="h-4 w-4 text-warn" />}
                    Ce hook exécute des commandes sur votre machine
                  </h3>
                  <p className="mt-1 text-[13px] leading-snug text-muted">Un hook s'exécute avec vos droits, automatiquement. Relisez les commandes ci-dessous <em>et</em> le code source avant de l'activer.</p>
                  {item.hookCommands && item.hookCommands.length > 0 && (
                    <pre className="scroll-thin mt-3 overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-xs leading-relaxed" tabIndex={0} aria-label="Commandes exécutées par le hook"><code>{item.hookCommands.join("\n")}</code></pre>
                  )}
                  {item.risk.flags.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {item.risk.flags.map((f) => <li key={f} className="flex gap-2 text-[13px]"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" /><span>{f}</span></li>)}
                    </ul>
                  )}
                  <p className="mt-3 text-[11px] text-subtle">Niveau « {RISK_META[item.risk.level].label} » : analyse heuristique automatique, pas un audit de sécurité.</p>
                </section>
              )}
              {item.type !== "hook" && item.risk.flags.length > 0 && (
                <section className="rounded-lg border border-warn/30 bg-warn/10 p-4 text-[13px]">
                  <h3 className="mb-1.5 font-semibold">Alertes du scan (heuristique)</h3>
                  <ul className="list-disc space-y-1 pl-4">{item.risk.flags.map((f) => <li key={f}>{f}</li>)}</ul>
                </section>
              )}

              <section className="space-y-2" aria-label="Installation">
                {item.install ? (
                  <>
                    <pre className="scroll-thin overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-xs" tabIndex={0}><code>{item.install}</code></pre>
                    <CopyButton text={item.install} label="Copier la commande d'install" />
                  </>
                ) : <p className="rounded-md border border-dashed border-line p-3 text-sm text-muted">Pas de commande d'installation connue : consultez le dépôt source.</p>}
                <a href={item.source.url} target="_blank" rel="noreferrer noopener" className="btn w-full"><GithubIcon />Voir la source<ExternalLink className="h-3.5 w-3.5 text-subtle" aria-hidden="true" /></a>
              </section>

              <dl className="divide-y divide-line rounded-lg border border-line px-4">
                <Meta k="Étoiles"><Stars n={item.stars} /></Meta>
                <Meta k="Licence">{item.license ?? "Non renseignée"}</Meta>
                <Meta k="Dernier commit"><span title={fullDate(item.lastCommit)}>{timeAgo(item.lastCommit)}</span></Meta>
                <Meta k="Repéré le">{fullDate(item.firstSeen)}</Meta>
                <Meta k="Chemin"><span className="font-mono text-xs">{item.source.path}</span></Meta>
                <Meta k="Origine">{item.source.origin}</Meta>
                <Meta k="Agents"><span className="inline-flex items-center gap-2"><AgentPills agents={item.agents} max={6} /><span className="hidden text-xs text-muted sm:inline">{item.agents.map(agentLabel).join(", ")}</span></span></Meta>
              </dl>
              <p className="text-[11px] leading-snug text-subtle">Agent Hub n'indexe que des métadonnées et un résumé ; le contenu appartient à son auteur et reste soumis à sa licence.</p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
