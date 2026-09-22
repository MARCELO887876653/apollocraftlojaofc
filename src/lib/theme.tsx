import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

type Theme = {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  border: string;
  radius: number;
  font: string;
  darkMode: boolean;
};

/** Escurece/clareia uma cor hex misturando com outra (para muted, accent...). */
function mix(fg: string, bg: string, amount: number): string {
  const f = fg.replace("#", "").match(/.{2}/g)?.map((x) => parseInt(x, 16)) ?? [0, 0, 0];
  const b = bg.replace("#", "").match(/.{2}/g)?.map((x) => parseInt(x, 16)) ?? [0, 0, 0];
  const out = f.map((c, i) => Math.round(c * amount + b[i] * (1 - amount)));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Aplica o tema dinâmico da loja. As variáveis do Tailwind v4 aqui usam o
 * formato oklch(...) OU cores CSS válidas — nunca números crus, senão o
 * background/card fica transparente e o conteúdo "vaza" por cima dos dialogs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useQuery(api.settings.getTheme) as Theme | undefined;

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;
    const bg = theme.background || "#0b0d12";
    const fg = theme.foreground || "#e6e8ee";
    const primary = theme.primary || "#6366f1";
    const secondary = theme.secondary || "#181c26";

    const c = (hex: string) => hex; // cores hex são CSS válido

    root.style.setProperty("--radius", `${theme.radius ?? 12}px`);
    root.style.setProperty("--background", c(bg));
    root.style.setProperty("--foreground", c(fg));
    root.style.setProperty("--card", c(theme.card || "#12151c"));
    root.style.setProperty("--card-foreground", c(fg));
    root.style.setProperty("--popover", c(theme.card || "#12151c"));
    root.style.setProperty("--popover-foreground", c(fg));
    root.style.setProperty("--primary", c(primary));
    root.style.setProperty("--primary-foreground", c(theme.primaryForeground || "#ffffff"));
    root.style.setProperty("--secondary", c(secondary));
    root.style.setProperty("--secondary-foreground", c(theme.secondaryForeground || fg));
    root.style.setProperty("--muted", c(mix(fg, bg, 0.06)));
    root.style.setProperty("--muted-foreground", c(mix(fg, bg, 0.6)));
    root.style.setProperty("--accent", c(mix(primary, bg, 0.16)));
    root.style.setProperty("--accent-foreground", c(fg));
    root.style.setProperty("--border", c(theme.border || mix(fg, bg, 0.14)));
    root.style.setProperty("--input", c(theme.border || mix(fg, bg, 0.14)));
    root.style.setProperty("--ring", c(primary));
    // Sidebar acompanha o tema da loja
    root.style.setProperty("--sidebar", c(theme.card || "#12151c"));
    root.style.setProperty("--sidebar-foreground", c(fg));
    root.style.setProperty("--sidebar-primary", c(primary));
    root.style.setProperty("--sidebar-primary-foreground", c(theme.primaryForeground || "#ffffff"));
    root.style.setProperty("--sidebar-accent", c(mix(primary, bg, 0.16)));
    root.style.setProperty("--sidebar-accent-foreground", c(fg));
    root.style.setProperty("--sidebar-border", c(theme.border || mix(fg, bg, 0.14)));
    root.style.setProperty("--sidebar-ring", c(primary));

    // Sempre escuro na ApolloCraft
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }, [theme]);

  return <>{children}</>;
}
