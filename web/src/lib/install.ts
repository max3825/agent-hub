// Commandes d'installation par agent.
// Claude Code : commande de l'index (plugin / skills CLI). Autres agents : copie du dossier source via `degit`
// (outil réel : `npx degit owner/repo/chemin#branche cible`) vers un dossier CONVENTIONNEL — à vérifier dans la
// documentation de l'agent : les conventions évoluent vite.
import type { Item } from "./types";
import { agentLabel } from "./format";
import { t } from "./i18n";

export interface InstallOption { agent: string; label: string; commands: string[]; kind: "claude" | "shell"; note?: string }

// Dossier cible conventionnel selon l'agent et la NATURE de l'élément (tag de la règle de détection).
// Tout ce qui n'est pas listé renvoie à « adapter depuis la source » plutôt que d'inventer un chemin.
function targetDir(agent: string, item: Item): string | undefined {
  if (item.type === "skill") return { "claude-code": "~/.claude/skills", codex: "~/.codex/skills", "github-copilot": ".github/skills" }[agent];
  if (agent === "github-copilot" && item.type === "mod") {
    if (item.tags.includes("slash-command")) return ".github/prompts";
    if (item.tags.includes("subagents")) return ".github/agents";
    return undefined;
  }
  if (agent !== "claude-code" || item.type !== "mod") return undefined;
  if (item.tags.includes("slash-command")) return "~/.claude/commands";
  if (item.tags.includes("subagents")) return "~/.claude/agents";
  if (item.tags.includes("output-style")) return "~/.claude/output-styles";
  return undefined;
}

function branchOf(url: string): string | null {
  const m = url.match(/\/(?:tree|blob)\/([^/]+)\//);
  return m ? m[1] : null;
}

/** Commande shell qui récupère le dossier (ou fichier) source vers `target`. */
export function fetchSource(item: Item, target: string): string {
  const { repo, path, url } = item.source;
  const branch = branchOf(url);
  if (url.includes("/blob/") && branch) return `mkdir -p ${target} && curl -fsSL -o ${target}/${path.split("/").pop()} https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  const sub = path && path !== "." ? `/${path}` : "";
  return `npx degit ${repo}${sub}${branch && branch !== "main" ? `#${branch}` : ""} ${target}/${item.name}`;
}

export function installOptions(item: Item): InstallOption[] {
  // Les skills (format SKILL.md ouvert) sont aussi proposés pour GitHub Copilot même sans signal détecté.
  const agents = item.type === "skill" && !item.agents.includes("github-copilot") ? [...item.agents, "github-copilot"] : item.agents;
  return agents.map((agent): InstallOption => {
    const label = agentLabel(agent);
    if (agent === "claude-code" && item.install) {
      const lines = item.install.split("\n");
      const slash = lines.every((l) => l.startsWith("/"));
      return { agent, label, commands: lines, kind: slash ? "claude" : "shell", note: slash ? t("À saisir dans Claude Code.") : undefined };
    }
    const dir = targetDir(agent, item);
    if (dir) return { agent, label, commands: [fetchSource(item, dir)], kind: "shell", note: agent === "github-copilot" ? t("Dossier du dépôt courant (.github/…) : à lancer à la racine du projet, puis commitez-le. Vérifiez la documentation de GitHub Copilot.") : t("Chemin conventionnel : vérifiez la documentation de l'agent.") };
    return {
      agent, label, commands: [fetchSource(item, ".")], kind: "shell",
      note: item.type === "skill"
        ? t("Copie le dossier source dans le répertoire courant ; placez-le ensuite là où {agent} charge ses skills (voir sa documentation).", { agent: label })
        : t("Ce type d'élément dépend du format de l'agent : récupérez la source et adaptez-la pour {agent}.", { agent: label }),
    };
  });
}

/** Plan d'installation d'une sélection : commandes shell (script .sh) et commandes à saisir dans Claude Code. */
export function buildInstallPlan(items: Item[]): { shell: string; claude: string } {
  const shell: string[] = ["#!/usr/bin/env bash", t("# Généré par Agent Hub — RELISEZ chaque commande avant de l'exécuter."), "set -euo pipefail", ""];
  const claude: string[] = [];
  for (const it of items) {
    const opt = installOptions(it).find((o) => o.agent === "claude-code") ?? installOptions(it)[0];
    if (!opt) continue;
    const risky = it.risk.level === "high";
    const head = `# ${it.name} (${it.type}) — ${it.source.repo}${it.risk.level !== "n/a" ? ` — ${t("risque")} : ${it.risk.level}` : ""}`;
    if (opt.kind === "claude") claude.push(head, ...opt.commands.map((c) => (risky ? `# ${t("[RISQUE ÉLEVÉ, désactivé]")} ${c}` : c)), "");
    else shell.push(head, ...opt.commands.map((c) => (risky ? `# ${t("[RISQUE ÉLEVÉ, désactivé]")} ${c}` : c)), "");
  }
  return { shell: shell.join("\n"), claude: claude.join("\n").trim() };
}

export const shareUrl = (id: string) => new URL(`i/${id}/`, new URL(import.meta.env.BASE_URL, document.baseURI)).href;
