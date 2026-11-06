import { locale, t } from "./i18n";

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return t("à l'instant");
  const m = s / 60; if (m < 60) return t("il y a {n} min", { n: Math.round(m) });
  const h = m / 60; if (h < 36) return t("il y a {n} h", { n: Math.round(h) });
  const d = h / 24; if (d < 45) return t("il y a {n} j", { n: Math.round(d) });
  const mo = d / 30.4; if (mo < 18) return t("il y a {n} mois", { n: Math.round(mo) });
  const y = Math.round(d / 365);
  return t(y > 1 ? "il y a {n} ans" : "il y a {n} an", { n: y });
}
export function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
export const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

// Libellés : fonctions (et non constantes) pour suivre la langue courante.
export const typeLabel = (t_: "skill" | "hook" | "mod") => ({ skill: t("Skills"), hook: t("Hooks"), mod: t("Mods") })[t_];
export const typeSingular = (t_: "skill" | "hook" | "mod") => ({ skill: t("Skill"), hook: t("Hook"), mod: t("Mod") })[t_];
export const typeBlurb = (t_: "skill" | "hook" | "mod") => ({
  skill: t("Dossiers SKILL.md : des savoir-faire que l'agent charge à la demande."),
  hook: t("Automatisations déclenchées par des événements de l'agent."),
  mod: t("Extensions de l'interface ou du comportement : status lines, commandes, panneaux…"),
})[t_];

export const AGENT_META: Record<string, { label: string; short: string }> = {
  "claude-code": { label: "Claude Code", short: "CC" },
  codex: { label: "Codex CLI", short: "CX" },
  cursor: { label: "Cursor", short: "CU" },
  "gemini-cli": { label: "Gemini CLI", short: "GM" },
  windsurf: { label: "Windsurf", short: "WS" },
  "github-copilot": { label: "GitHub Copilot", short: "GH" },
};
export const agentLabel = (a: string) => AGENT_META[a]?.label ?? a;
export const agentShort = (a: string) => AGENT_META[a]?.short ?? a.slice(0, 2).toUpperCase();

export const riskLabel = (r: "low" | "medium" | "high" | "n/a") => ({ low: t("Risque faible"), medium: t("À vérifier"), high: t("Risque élevé"), "n/a": t("Non applicable") })[r];
export const riskShort = (r: "low" | "medium" | "high" | "n/a") => ({ low: t("Faible"), medium: t("Moyen"), high: t("Élevé"), "n/a": t("N/A") })[r];

export function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
