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
  /** Champs optionnels (v2) */
  createdAt?: string;
  createdExact?: boolean;
  trend?: { d7: number; d30: number };
  agentSignals?: Record<string, string>;
  modConfidence?: number;
}

/** Contenu servi à part (index/detail/<id[:2]>.json) : chargé à l'ouverture d'une fiche. */
export interface ItemDetail { preview?: string; outline?: string[] }

export interface CrawlStats {
  generatedAt: string; total: number; counts: Record<ItemType, number>; risk: Record<string, number>;
  repos?: number; analyzed?: number; from_cache?: number; rejected?: number; errors?: number; stale_cache?: number; truncated?: boolean;
  duplicates_removed?: number; mods_dropped_low_confidence?: number; requests?: number; duration_s?: number;
  creation_lookups?: number; exact_created?: number; demo?: boolean;
  rejected_by_reason?: Record<string, number>; quality_filtered?: Record<string, number>; by_origin?: Record<string, number>;
  adapters?: Record<string, { candidates: number; error: string | null }>;
}

export interface Collection { id: string; title: string; desc: string; title_en?: string; desc_en?: string; query: string }

export interface Manifest {
  version: number;
  generatedAt: string;
  total: number;
  counts: Record<ItemType, number>;
  shards: { file: string; type: ItemType; count: number }[];
  demo?: boolean;
  semantic?: boolean;
  details?: boolean;
  stats?: boolean;
}

export type SortKey = "relevance" | "stars" | "recent" | "new" | "trending" | "created";

export interface Filters {
  agents: string[];
  tags: string[];
  licenses: string[];
  risks: RiskLevel[];
  /** Dernier commit il y a au plus N jours (0 = pas de filtre). */
  activityDays: number;
  minStars: number;
  /** Repéré il y a au plus N jours (0 = pas de filtre). */
  newDays: number;
  /** Mods : n'afficher que les détections fiables (confiance ≥ 0,7). */
  sureOnly: boolean;
}

export interface Facets {
  agents: [string, number][];
  tags: [string, number][];
  licenses: [string, number][];
  risks: [string, number][];
}

export const emptyFilters: Filters = { agents: [], tags: [], licenses: [], risks: [], activityDays: 0, minStars: 0, newDays: 0, sureOnly: false };
export const TYPES: ItemType[] = ["skill", "hook", "mod"];
