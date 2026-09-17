import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useFonts, Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { COLORS, GRADIENT, SPACING, RADIUS, buildFonts, type AppFonts } from './tokens';

type Theme = {
  colors: typeof COLORS;
  gradient: string[];
  spacing: typeof SPACING;
  radius: typeof RADIUS;
  fonts: AppFonts;
  fontsLoaded: boolean;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const value = useMemo<Theme>(
    () => ({
      colors: COLORS,
      gradient: GRADIENT,
      spacing: SPACING,
      radius: RADIUS,
      fonts: buildFonts(fontsLoaded),
      fontsLoaded,
    }),
    [fontsLoaded]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
