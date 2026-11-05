// Internationalisation minimaliste : le texte français sert de CLÉ, `en` fournit la traduction anglaise.
// `t("Ma sélection")` → "My selection" en anglais, inchangé en français (et si une traduction manque).
// Variables : t("{n} résultats", { n: 3 }). La langue est un petit store externe (useLang) : tout composant
// qui l'utilise se re-rend au changement ; l'index de recherche n'est PAS rechargé.
import { useSyncExternalStore } from "react";
import { en } from "./strings.en";

export type Lang = "fr" | "en";
const KEY = "ah-lang";

function initial(): Lang {
  try { const v = localStorage.getItem(KEY); if (v === "fr" || v === "en") return v; } catch { /* ignore */ }
  return (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr")) ? "fr" : "en";
}

let current: Lang = initial();
const subs = new Set<() => void>();

export const getLang = () => current;
export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getLang, () => "fr" as Lang);
  return [lang, setLang];
}

export function t(fr: string, vars?: Record<string, string | number>): string {
  let s = current === "en" ? (en[fr] ?? fr) : fr;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
/** Pluriel simple : plural(n, "résultat", "résultats") (en anglais, la table doit fournir les deux formes). */
export const plural = (n: number, one: string, many: string) => t(n > 1 ? many : one);
export const locale = () => (current === "fr" ? "fr-FR" : "en-US");

if (typeof document !== "undefined") document.documentElement.lang = current;
