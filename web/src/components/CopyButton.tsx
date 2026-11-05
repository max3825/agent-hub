import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

export function copyText(text: string) {
  return navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  });
}

export function CopyButton({ text, label, primary = true, className = "" }: { text: string; label: string; primary?: boolean; className?: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => { await copyText(text); setOk(true); setTimeout(() => setOk(false), 1800); };
  return (
    <button onClick={copy} className={`btn ${primary ? "btn-primary" : ""} w-full ${ok ? "!bg-ok !text-bg !border-transparent" : ""} ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={ok ? "ok" : "idle"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="inline-flex items-center gap-2">
          {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{ok ? "Copié !" : label}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" role="status">{ok ? "Copié dans le presse-papiers" : ""}</span>
    </button>
  );
}
