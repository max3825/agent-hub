// État de l'UI synchronisé avec l'URL : ?type=hook&q=…&agent=…&tag=…&sort=…&item=…&page=about
import { useCallback, useEffect, useState } from "react";
import { emptyFilters, type Filters, type ItemType, type RiskLevel, type SortKey, TYPES } from "./types";

export interface UiState {
  type: ItemType;
  q: string;
  sort: SortKey;
  filters: Filters;
  item: string | null;
  page: "home" | "about";
}

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parseUrl(search: string): UiState {
  const p = new URLSearchParams(search);
  const type = TYPES.includes(p.get("type") as ItemType) ? (p.get("type") as ItemType) : "skill";
  const sort = (["relevance", "stars", "recent", "new"] as const).find((s) => s === p.get("sort")) ?? "relevance";
  return {
    type, q: p.get("q") ?? "", sort,
    filters: {
      agents: list(p.get("agent")), tags: list(p.get("tag")), licenses: list(p.get("lic")),
      risks: list(p.get("risk")) as RiskLevel[],
      activityDays: Number(p.get("act")) || 0, minStars: Number(p.get("stars")) || 0,
    },
    item: p.get("item"),
    page: p.get("page") === "about" ? "about" : "home",
  };
}

export function buildUrl(s: UiState): string {
  const p = new URLSearchParams();
  if (s.page === "about") { p.set("page", "about"); return "?" + p; }
  p.set("type", s.type);
  if (s.q) p.set("q", s.q);
  if (s.sort !== "relevance") p.set("sort", s.sort);
  const f = s.filters;
  if (f.agents.length) p.set("agent", f.agents.join(","));
  if (f.tags.length) p.set("tag", f.tags.join(","));
  if (f.licenses.length) p.set("lic", f.licenses.join(","));
  if (f.risks.length) p.set("risk", f.risks.join(","));
  if (f.activityDays) p.set("act", String(f.activityDays));
  if (f.minStars) p.set("stars", String(f.minStars));
  if (s.item) p.set("item", s.item);
  return "?" + p.toString();
}

export function useUiState() {
  const [state, setState] = useState<UiState>(() => parseUrl(location.search));

  useEffect(() => {
    const onPop = () => setState(parseUrl(location.search));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // `push` : nouvelle entrée d'historique (ouverture d'un détail, changement d'onglet) ; sinon replace (frappe).
  const update = useCallback((patch: Partial<UiState>, push = false) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const url = buildUrl(next);
      if (url !== location.search) (push ? history.pushState : history.replaceState).call(history, null, "", url || location.pathname);
      return next;
    });
  }, []);

  useEffect(() => { document.documentElement.dataset.type = state.type; }, [state.type]);
  return [state, update] as const;
}

export const resetFilters = () => ({ ...emptyFilters });
