import { memo } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import type { Item } from "../lib/types";
import { timeAgo } from "../lib/format";
import { t } from "../lib/i18n";
import { FavButton } from "./FavButton";
import { AgentPills, ConfidenceBadge, Highlight, RiskBadge, Stars, TrendBadge, TypeBadge } from "./ui";

interface Props { item: Item; terms: string[]; lang: "fr" | "en"; onOpen: (id: string) => void; index: number; isNew?: boolean }

export const ItemCard = memo(function ItemCard({ item, terms, lang, onOpen, index, isNew }: Props) {
  const summary = lang === "fr" ? item.summary : item.summary_en;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index, 8) * 0.025, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }} className="relative h-full"
    >
      <button onClick={() => onOpen(item.id)}
        className="card-surface group flex h-full w-full flex-col p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-2/60">
        <div className="flex items-start gap-2 pr-8">
          <TypeBadge type={item.type} />
          <h3 className="min-w-0 flex-1 truncate font-mono text-[13.5px] font-semibold leading-6"><Highlight text={item.name} terms={terms} /></h3>
          {isNew && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{t("Nouveau")}</span>}
        </div>
        <p className="mt-2 line-clamp-2 text-[13.5px] leading-snug text-muted"><Highlight text={summary} terms={terms} /></p>
        <p className="mt-1 truncate font-mono text-[11px] text-subtle">{item.source.repo}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3">
          <Stars n={item.stars} />
          <TrendBadge d7={item.trend?.d7} />
          <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{timeAgo(item.lastCommit)}</span>
          <div className="ml-auto flex items-center gap-2">
            <ConfidenceBadge value={item.modConfidence} />
            <RiskBadge level={item.risk.level} compactMode />
            <AgentPills agents={item.agents} />
          </div>
        </div>
      </button>
      <FavButton id={item.id} name={item.name} className="absolute right-2 top-2" />
    </motion.div>
  );
});
