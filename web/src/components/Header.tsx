import { forwardRef } from "react";
import { Heart, Moon, Search, Sun, X } from "lucide-react";
import { t } from "../lib/i18n";
import { GithubIcon, Kbd, Logo } from "./ui";

interface Props {
  q: string; onQ: (v: string) => void; onOpenPalette: () => void;
  theme: "light" | "dark"; onTheme: () => void; onHome: () => void; onAbout: () => void;
  lang: "fr" | "en"; onLang: (l: "fr" | "en") => void; repoUrl: string; favCount: number; onFavs: () => void;
}

export const Header = forwardRef<HTMLInputElement, Props>(function Header(p, ref) {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <a href="?" onClick={(e) => { e.preventDefault(); p.onHome(); }} className="flex shrink-0 items-center gap-2.5 rounded-md" aria-label={t("Agent Hub — accueil")}>
          <Logo />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">Agent Hub</span>
        </a>

        <div className="relative mx-auto w-full max-w-xl" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input ref={ref} type="search" value={p.q} onChange={(e) => p.onQ(e.target.value)}
            placeholder={t("Rechercher un skill, un hook, un mod…")} aria-label={t("Rechercher dans tout l'annuaire")}
            autoComplete="off" spellCheck={false}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-20 text-sm shadow-card placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20 [&::-webkit-search-cancel-button]:hidden" />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {p.q && <button onClick={() => p.onQ("")} className="rounded p-1 text-subtle hover:text-ink" aria-label={t("Effacer la recherche")}><X className="h-4 w-4" /></button>}
            <button onClick={p.onOpenPalette} className="hidden items-center gap-0.5 sm:flex" aria-label={t("Ouvrir la palette de commandes")}>
              <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>K</Kbd>
            </button>
          </div>
        </div>

        <nav className="flex shrink-0 items-center gap-0.5" aria-label={t("Actions")}>
          <button onClick={p.onAbout} className="hidden rounded-md px-2.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink md:block">{t("À propos")}</button>
          <button onClick={p.onFavs} className="icon-btn relative" aria-label={t("Ma sélection ({n})", { n: p.favCount })} title={t("Ma sélection")}>
            <Heart className="h-4 w-4" fill={p.favCount ? "currentColor" : "none"} />
            {p.favCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-bg">{p.favCount}</span>}
          </button>
          <div role="group" aria-label={t("Langue de l'interface et des résumés")} className="mx-1 flex rounded-md border border-line p-0.5 font-mono text-[11px] font-semibold">
            {(["fr", "en"] as const).map((l) => (
              <button key={l} onClick={() => p.onLang(l)} aria-pressed={p.lang === l} lang={l}
                className={`rounded px-1.5 py-1 transition-colors ${p.lang === l ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={p.onTheme} className="icon-btn" aria-label={p.theme === "dark" ? t("Passer au thème clair") : t("Passer au thème sombre")}>
            {p.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <a href={p.repoUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label={t("Voir le code sur GitHub")}><GithubIcon /></a>
        </nav>
      </div>
    </header>
  );
});
