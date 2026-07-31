'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  mounted: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);
  const userChose = useRef(false);

  useEffect(() => {
    setMounted(true);
    // Read the theme that was set by the inline script (respects system pref on first visit)
    const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setThemeState(currentTheme);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);

    // Only persist when the user explicitly toggled (not on initial detection)
    if (userChose.current) {
      localStorage.setItem('theme', theme);
      localStorage.setItem('theme-user-set', '1');
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    userChose.current = true;
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const setTheme = (newTheme: Theme) => {
    userChose.current = true;
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
