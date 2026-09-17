/**
 * Design tokens for the whole photobooth app.
 * Mobile, admin panel, and marketing materials should reference these values.
 */

export const COLORS = {
  primary: '#FF4DA6',
  primaryDark: '#E91E63',
  secondary: '#00BCD4',
  background: '#0A0A1F',
  surface: '#1A1A2E',
  card: '#252544',
  text: '#FFFFFF',
  textSecondary: '#B8B8D0',
  success: '#00E676',
  warning: '#FFD600',
  error: '#FF5252',
} as const;

export const GRADIENT: string[] = ['#FF4DA6', '#7B61FF', '#00BCD4'];

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  round: 9999,
} as const;

export type AppFont = {
  fontFamily?: string;
  fontSize: number;
  fontWeight?: '400' | '600' | '700';
};

export type AppFonts = Record<'heading' | 'subheading' | 'body' | 'caption', AppFont>;

/**
 * Builds the font presets. When the bundled Poppins files finish loading we
 * point at the real font family names; before that we fall back to the
 * platform font so the UI never blocks on font loading.
 */
export function buildFonts(loaded: boolean): AppFonts {
  return {
    heading: {
      fontFamily: loaded ? 'Poppins_700Bold' : undefined,
      fontSize: 28,
      fontWeight: '700',
    },
    subheading: {
      fontFamily: loaded ? 'Poppins_600SemiBold' : undefined,
      fontSize: 20,
      fontWeight: '600',
    },
    body: {
      fontFamily: loaded ? 'Poppins_400Regular' : undefined,
      fontSize: 16,
      fontWeight: '400',
    },
    caption: {
      fontFamily: loaded ? 'Poppins_400Regular' : undefined,
      fontSize: 12,
      fontWeight: '400',
    },
  };
}
