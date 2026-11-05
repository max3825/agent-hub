import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowUpDown, Sparkles, SlidersHorizontal, TrendingUp, X, Zap } from "lucide-react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { Tabs } from "./components/Tabs";
import { FiltersPanel } from "./components/FiltersPanel";
import { ItemList } from "./components/ItemList";
import { CollectionsRow } from "./components/CollectionsRow";
import { EmptyState, SkeletonCard } from "./components/ui";
import { loadCollections } from "./lib/details";
import { useFavorites } from "./lib/favorites";
import { TYPE_LABEL } from "./lib/format";
import { useUiState } from "./lib/state";
import { useTheme } from "./lib/theme";
import { emptyFilters, type Collection, type Item, type ItemType, type SortKey } from "./lib/types";
import { useQuery, useSearchEngine } from "./search/useSearch";

const Drawer = lazy(() => import("./components/Drawer").then((m) => ({ default: m.Drawer })));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const About = lazy(() => import("./components/About"));
const FavoritesPage = lazy(() => import("./components/FavoritesPage"));
const StatsPage = lazy(() => import("./components/StatsPage"));

const REPO_URL = "https://github.com/agent-hub/agent-hub";
const SORTS: [SortKey, string][] = [["relevance", "Pertinence"], ["stars", "Étoiles"], ["trending", "Tendance"], ["recent", "Dernier commit"], ["new", "Nouveautés"], ["created", "Création"]];

export default function App() {
  const [ui, update] = useUiState();
  const { theme, toggle } = useTheme();
  const [lang, setLang] = useState<"fr" | "en">(() => { try { return localStorage.getItem("ah-lang") === "en" ? "en" : "fr"; } catch { return "fr"; } });
  const [palette, setPalette] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const engine = useSearchEngine(ui.type);
  const res = useQuery(engine, ui.q, ui.type, ui.filters, ui.sort, ui.semantic);
  const favs = useFavorites();
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => { loadCollections().then(setCollections); }, []);
  const counts = engine.manifest?.counts ?? res.counts;

  // ⌘K / Ctrl+K partout ; « / » focalise la recherche.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey);
  }, []);

  const openItem = useCallback((id: string) => update({ item: id }, true), [update]);
  const closeItem = useCallback(() => update({ item: null }), [update]);
  const selected = useMemo<Item | null>(
    () => (ui.item ? engine.itemsRef.current.find((i) => i.id === ui.item) ?? null : null),
    [ui.item, engine.version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Lien direct vers une fiche (?item=…) : on aligne l'onglet sur le type de l'élément.
  useEffect(() => { if (selected && ui.page === "home" && selected.type !== ui.type) update({ type: selected.type }); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const changeLang = () => setLang((l) => { const n = l === "fr" ? "en" : "fr"; try { localStorage.setItem("ah-lang", n); } catch { /* */ } return n; });
  const goHome = () => update({ page: "home", q: "", filters: { ...emptyFilters }, item: null, sort: "relevance" }, true);
  const goAbout = () => update({ page: "about", item: null }, true);
  const goFavs = () => update({ page: "favs", item: null, ids: [] }, true);
  const goStats = () => update({ page: "stats", item: null }, true);
  const pickCollection = (c: Collection) => update({ q: ui.q.trim().toLowerCase() === c.query.toLowerCase() ? "" : c.query, sort: "relevance", filters: { ...emptyFilters } });
  const changeType = (t: ItemType) => update({ type: t, filters: { ...ui.filters, tags: [] } }, true);

  useEffect(() => { document.title = ui.page === "about" ? "Comment ça marche — Agent Hub" : "Agent Hub — skills, hooks et mods pour agents IA de code"; }, [ui.page]);

  const hasFilters = JSON.stringify(ui.filters) !== JSON.stringify(emptyFilters);
  const activeCount = (ui.filters.newDays ? 1 : 0) + (ui.filters.sureOnly ? 1 : 0) + ui.filters.agents.length + ui.filters.tags.length + ui.filters.licenses.length + ui.filters.risks.length + (ui.filters.activityDays ? 1 : 0) + (ui.filters.minStars ? 1 : 0);
  const initialLoading = engine.loaded === 0 && !engine.error;

  return (
    <div className="min-h-dvh">
      <a href="#results-panel" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">Aller aux résultats</a>
      <Header ref={searchRef} q={ui.q} onQ={(q) => update({ q, page: "home" })} onOpenPalette={() => setPalette(true)}
        theme={theme} onTheme={toggle} onHome={goHome} onAbout={goAbout} lang={lang} onLang={changeLang} repoUrl={REPO_URL} favCount={favs.ids.length} onFavs={goFavs} />

      {ui.page === "about" ? (
        <Suspense fallback={null}><About onBack={goHome} repoUrl={REPO_URL} onStats={goStats} /></Suspense>
      ) : ui.page === "stats" ? (
        <Suspense fallback={null}><StatsPage onBack={goHome} /></Suspense>
      ) : ui.page === "favs" ? (
        <Suspense fallback={null}><FavoritesPage items={engine.itemsRef.current} sharedIds={ui.ids} ready={engine.done || engine.loaded > 0} lang={lang} onOpen={openItem} onBack={goHome} /></Suspense>
      ) : (
        <>
          <Hero manifest={engine.manifest} />
          <main className="mx-auto min-h-[85vh] max-w-7xl px-4 pb-24 pt-6">
            {!ui.q || collections.some((c) => c.query.toLowerCase() === ui.q.trim().toLowerCase()) ? <CollectionsRow items={collections} active={ui.q} onPick={pickCollection} /> : null}
            <Tabs type={ui.type} counts={counts} onChange={changeType} />

            <div className="mt-5 flex items-center gap-2">
              <button onClick={() => setFiltersOpen(true)} className="btn lg:hidden" aria-haspopup="dialog">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Filtres{activeCount > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-bg">{activeCount}</span>}
              </button>
              <p className="text-sm text-muted" aria-live="polite" role="status">
                <span className="font-medium tabular-nums text-ink">{res.total.toLocaleString("fr-FR")}</span> résultat{res.total > 1 ? "s" : ""}
                {ui.q && <> pour « <span className="text-ink">{ui.q}</span> »</>}
                {!engine.done && !engine.error && <span className="ml-2 text-subtle">· chargement de l'index…</span>}
                {ui.q && res.semanticUsed && <span className="ml-2 text-subtle">· par sens + mots-clés</span>}
              </p>
              <div className="ml-auto flex items-center gap-2">
              <button aria-pressed={ui.filters.newDays === 7} onClick={() => update({ filters: { ...ui.filters, newDays: ui.filters.newDays === 7 ? 0 : 7 } })}
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs sm:inline-flex ${ui.filters.newDays === 7 ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink"}`}><Zap className="h-3.5 w-3.5" aria-hidden="true" />Nouveautés</button>
              <button aria-pressed={ui.sort === "trending"} onClick={() => update({ sort: ui.sort === "trending" ? "relevance" : "trending" })}
                className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs sm:inline-flex ${ui.sort === "trending" ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink"}`}><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />En hausse</button>
              {engine.manifest?.semantic && (
                <button aria-pressed={ui.semantic} onClick={() => update({ semantic: !ui.semantic })} disabled={!engine.semReady}
                  title={engine.semReady ? "Recherche par sens (LSA) : trouve aussi des synonymes et des formulations proches. Approximative sur un petit corpus." : "Chargement du modèle de recherche par sens…"}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs disabled:opacity-50 ${ui.semantic && engine.semReady ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink"}`}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Sens</button>
              )}
              <label className="inline-flex items-center gap-2 text-sm text-muted">
                <ArrowUpDown className="h-4 w-4" aria-hidden="true" /><span className="sr-only sm:not-sr-only">Trier</span>
                <select value={ui.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}
                  className="rounded-md border border-line-strong bg-surface py-1.5 pl-2 pr-7 text-sm text-ink">
                  {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              </div>
            </div>

            <div className="mt-5 grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)]">
              <aside className="hidden lg:block" aria-label="Filtres">
                <div className="scroll-thin sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2">
                  <FiltersPanel facets={res.facets} filters={ui.filters} type={ui.type} onChange={(filters) => update({ filters })} />
                </div>
              </aside>

              <div id="results-panel" role="tabpanel" aria-labelledby={`tab-${ui.type}`} tabIndex={-1} className="min-w-0 focus:outline-none">
                <h2 className="sr-only">Résultats : {TYPE_LABEL[ui.type]}</h2>
                {engine.error ? (
                  <EmptyState title="Impossible de charger l'index" hint={`${engine.error}. Vérifiez votre connexion ou relancez le chargement.`}
                    action={<button className="btn btn-primary" onClick={engine.retry}><AlertCircle className="h-4 w-4" />Réessayer</button>} />
                ) : initialLoading ? (
                  <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Chargement">{Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)}</div>
                ) : res.items.length === 0 && !res.pending ? (
                  <EmptyState title="Rien ne correspond"
                    hint={ui.q ? `Aucun ${ui.type} pour « ${ui.q} ». Essayez un terme plus court ou une autre orthographe.` : "Aucun élément avec ces filtres."}
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        {ui.q && (["skill", "hook", "mod"] as ItemType[]).filter((t) => t !== ui.type && res.counts[t] > 0).map((t) => (
                          <button key={t} className="btn btn-primary" onClick={() => changeType(t)}>{res.counts[t]} dans {TYPE_LABEL[t]}</button>
                        ))}
                        {(hasFilters || ui.q) && <button className="btn" onClick={() => update({ q: "", filters: { ...emptyFilters } })}><X className="h-4 w-4" />Tout effacer</button>}
                      </div>} />
                ) : (
                  <motion.div key={ui.type} initial={{ opacity: 0 }} animate={{ opacity: res.pending ? 0.6 : 1 }} transition={{ duration: 0.15 }}>
                    <ItemList items={res.items} terms={res.terms} lang={lang} onOpen={openItem} />
                  </motion.div>
                )}
              </div>
            </div>
          </main>
        </>
      )}

      <footer className="border-t border-line py-8 text-center text-xs text-subtle">
        Agent Hub · métadonnées, courts extraits et liens · le niveau de risque est une heuristique, pas un audit.
        <span className="mt-2 flex justify-center gap-4"><button onClick={goStats} className="underline hover:text-ink">Santé du crawl</button><button onClick={goAbout} className="underline hover:text-ink">À propos</button></span>
      </footer>

      <Suspense fallback={null}>
        <Drawer item={selected} lang={lang} onClose={closeItem} similar={engine.similar} onOpen={openItem} />
        {palette && (
          <CommandPalette open={palette} onClose={() => setPalette(false)} engine={engine} lang={lang} theme={theme}
            onPick={(it) => update({ type: it.type, item: it.id, page: "home" }, true)} onToggleTheme={toggle} onAbout={goAbout} onFavs={goFavs} onStats={goStats} />
        )}
      </Suspense>

      <AnimatePresence>
        {filtersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtres">
            <motion.div className="absolute inset-0 bg-black/55" onClick={() => setFiltersOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="scroll-thin absolute inset-y-0 left-0 w-[88%] max-w-sm overflow-y-auto border-r border-line bg-surface p-5"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}>
              <button onClick={() => setFiltersOpen(false)} className="icon-btn absolute right-3 top-3" aria-label="Fermer les filtres"><X className="h-5 w-5" /></button>
              <FiltersPanel facets={res.facets} filters={ui.filters} type={ui.type} onChange={(filters) => update({ filters })} />
              <button onClick={() => setFiltersOpen(false)} className="btn btn-primary sticky bottom-0 mt-4 w-full">Voir {res.total} résultat{res.total > 1 ? "s" : ""}</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
