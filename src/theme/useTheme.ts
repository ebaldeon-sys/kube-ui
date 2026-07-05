import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "kubeui-theme";

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Lee la preferencia guardada; si no hay, cae al esquema del sistema.
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage puede fallar (modo privado); usamos el del sistema.
  }
  return systemTheme();
}

// Aplica el tema como data-theme en <html>. Debe llamarse antes del primer render
// para evitar un parpadeo del tema claro.
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function applyStoredTheme(): void {
  applyTheme(readStoredTheme());
}

// Hook de estado del tema: sincroniza estado de React, <html> y localStorage.
export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignorar fallos de persistencia.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(() => setThemeState((current) => (current === "dark" ? "light" : "dark")), []);

  return { theme, toggleTheme, setTheme };
}
