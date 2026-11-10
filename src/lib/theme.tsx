import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'logi_theme';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark() ? 'dark' : 'light';
}

// Colour palettes, independent of light/dark. Tokens live in index.css.
export const PALETTES = [
  { id: 'graphite', label: 'Graphite', swatch: '#9aa1ad' },
  { id: 'cobalt', label: 'Cobalt', swatch: '#4f83dc' },
  { id: 'pine', label: 'Pine', swatch: '#2a9d8f' },
  { id: 'iris', label: 'Iris', swatch: '#8b74e8' },
  { id: 'heritage', label: 'Heritage', swatch: '#b0476b' },
  { id: 'molten', label: 'Molten', swatch: '#f26b1d' },
] as const;

export type Palette = (typeof PALETTES)[number]['id'];

const PALETTE_STORAGE_KEY = 'logi_palette';

function getInitialPalette(): Palette {
  const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
  return PALETTES.find(p => p.id === stored)?.id ?? 'graphite';
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const [palette, setPalette] = useState<Palette>(getInitialPalette);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
    localStorage.setItem(PALETTE_STORAGE_KEY, palette);
  }, [palette]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggleTheme, palette, setPalette }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
