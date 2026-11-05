export type ItemType = "skill" | "hook" | "mod";
export type RiskLevel = "low" | "medium" | "high" | "n/a";

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  summary: string;
  summary_en: string;
  tags: string[];
  source: { repo: string; url: string; path: string; origin: string };
  stars: number;
  license: string | null;
  lastCommit: string;
  firstSeen: string;
  agents: string[];
  install: string | null;
  contentHash: string;
  risk: { level: RiskLevel; flags: string[] };
  /** Extension optionnelle : commandes shell déclarées par un hook (affichées dans le panneau de détail). */
  hookCommands?: string[];
}

export interface Manifest {
  version: number;
  generatedAt: string;
  total: number;
  counts: Record<ItemType, number>;
  shards: { file: string; type: ItemType; count: number }[];
  demo?: boolean;
}

export type SortKey = "relevance" | "stars" | "recent" | "new";

export interface Filters {
  agents: string[];
  tags: string[];
  licenses: string[];
  risks: RiskLevel[];
  /** Dernier commit il y a au plus N jours (0 = pas de filtre). */
  activityDays: number;
  minStars: number;
}

export interface Facets {
  agents: [string, number][];
  tags: [string, number][];
  licenses: [string, number][];
  risks: [string, number][];
}

export const emptyFilters: Filters = { agents: [], tags: [], licenses: [], risks: [], activityDays: 0, minStars: 0 };
export const TYPES: ItemType[] = ["skill", "hook", "mod"];
