import type { Facets, Filters, Item, ItemType, Manifest, SortKey } from "../lib/types";

export type ToWorker =
  | { kind: "init"; baseUrl: string; priority: ItemType }
  | { kind: "query"; reqId: number; q: string; type: ItemType | "all"; filters: Filters; sort: SortKey; limit?: number; semantic?: boolean }
  | { kind: "similar"; reqId: number; id: string; limit: number };

export type FromWorker =
  | { kind: "manifest"; manifest: Manifest }
  | { kind: "items"; items: Item[]; loaded: number; total: number }
  | { kind: "done" }
  | { kind: "semantic"; ready: boolean }
  | { kind: "similar"; reqId: number; indices: Uint32Array }
  | { kind: "error"; message: string }
  | { kind: "result"; reqId: number; indices: Uint32Array; total: number; terms: string[]; facets: Facets; counts: Record<ItemType, number>; semanticUsed: boolean };
