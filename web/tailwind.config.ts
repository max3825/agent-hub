import type { Config } from "tailwindcss";

// Tous les tokens de design passent par des variables CSS (src/index.css),
// ce qui permet les thèmes clair/sombre sans dupliquer les classes.
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c("bg"), surface: c("surface"), "surface-2": c("surface-2"),
        line: c("line"), "line-strong": c("line-strong"),
        ink: c("ink"), muted: c("muted"), subtle: c("subtle"),
        accent: c("accent"),
        skill: c("skill"), hook: c("hook"), mod: c("mod"),
        ok: c("ok"), warn: c("warn"), danger: c("danger"),
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Inter Fallback"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', '"Mono Fallback"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: { sm: "6px", md: "10px", lg: "14px", xl: "20px" },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        ring: "0 0 0 3px rgb(var(--accent) / 0.35)",
      },
      spacing: { gutter: "1rem" },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: { shimmer: "shimmer 1.6s infinite" },
    },
  },
  plugins: [],
} satisfies Config;
