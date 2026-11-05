import { Heart } from "lucide-react";
import { useFavorites } from "../lib/favorites";
import { t } from "../lib/i18n";

export function FavButton({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  const { has, toggle } = useFavorites();
  const on = has(id);
  return (
    <button onClick={(e) => { e.stopPropagation(); toggle(id); }} aria-pressed={on}
      aria-label={on ? t("Retirer {name} des favoris", { name }) : t("Ajouter {name} aux favoris", { name })} title={on ? t("Retirer des favoris") : t("Ajouter aux favoris")}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface-2 ${on ? "text-danger" : "text-subtle hover:text-ink"} ${className}`}>
      <Heart className="h-4 w-4" fill={on ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
