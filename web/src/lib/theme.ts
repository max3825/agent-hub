import { useCallback, useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
  );
  useEffect(() => {
    // Suit le système tant que l'utilisateur n'a pas choisi explicitement.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try { if (localStorage.getItem("ah-theme")) return; } catch { /* ignore */ }
      const t = mq.matches ? "dark" : "light";
      document.documentElement.dataset.theme = t; setTheme(t);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const toggle = useCallback(() => {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("ah-theme", t); } catch { /* ignore */ }
    setTheme(t);
  }, [theme]);
  return { theme, toggle };
}
