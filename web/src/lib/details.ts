import type { CrawlStats, Collection, ItemDetail } from "./types";

const base = () => new URL(import.meta.env.BASE_URL, document.baseURI).href + "index/";
const buckets = new Map<string, Promise<Record<string, ItemDetail>>>();

/** Aperçu + sommaire d'une fiche : un petit fichier par préfixe d'id (2 caractères), mis en cache. */
export async function loadDetail(id: string): Promise<ItemDetail | null> {
  const b = id.slice(0, 2);
  if (!buckets.has(b)) buckets.set(b, fetch(`${base()}detail/${b}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return (await buckets.get(b)!)[id] ?? null;
}

export const loadStats = (): Promise<CrawlStats | null> => fetch(`${base()}stats.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export const loadCollections = (): Promise<Collection[]> => fetch(`${base()}collections.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
