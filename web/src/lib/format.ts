export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return "à l'instant";
  const m = s / 60; if (m < 60) return `il y a ${Math.round(m)} min`;
  const h = m / 60; if (h < 36) return `il y a ${Math.round(h)} h`;
  const d = h / 24; if (d < 45) return `il y a ${Math.round(d)} j`;
  const mo = d / 30.4; if (mo < 18) return `il y a ${Math.round(mo)} mois`;
  return `il y a ${Math.round(d / 365)} an${d / 365 >= 1.5 ? "s" : ""}`;
}
export function compact(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
export const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export const TYPE_LABEL = { skill: "Skills", hook: "Hooks", mod: "Mods" } as const;
export const TYPE_SINGULAR = { skill: "Skill", hook: "Hook", mod: "Mod" } as const;
export const TYPE_BLURB = {
  skill: "Dossiers SKILL.md : des savoir-faire que l'agent charge à la demande.",
  hook: "Automatisations déclenchées par des événements de l'agent.",
  mod: "Extensions de l'interface ou du comportement : status lines, commandes, panneaux…",
} as const;

export const AGENT_META: Record<string, { label: string; short: string }> = {
  "claude-code": { label: "Claude Code", short: "CC" },
  codex: { label: "Codex CLI", short: "CX" },
  cursor: { label: "Cursor", short: "CU" },
  "gemini-cli": { label: "Gemini CLI", short: "GM" },
  windsurf: { label: "Windsurf", short: "WS" },
};
export const agentLabel = (a: string) => AGENT_META[a]?.label ?? a;
export const agentShort = (a: string) => AGENT_META[a]?.short ?? a.slice(0, 2).toUpperCase();

export const RISK_META = {
  low: { label: "Risque faible", short: "Faible" },
  medium: { label: "À vérifier", short: "Moyen" },
  high: { label: "Risque élevé", short: "Élevé" },
  "n/a": { label: "Non applicable", short: "N/A" },
} as const;

export function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
