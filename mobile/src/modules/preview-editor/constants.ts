/**
 * Module constants.
 *
 * FILTER_PRESETS is split in two groups and the split is deliberate:
 *  - `renderer: 'gpu'`   presets are pure colour grades, rendered instantly by the
 *    expo-gl fragment shader so the user can scrub between them with no network.
 *  - `renderer: 'cloud'` presets are the AI filters. They cost credits and are
 *    rendered by the backend pipeline (see `finalizePhotoUpload`), so the client
 *    only sends the filter id and shows it as an "AI" chip.
 *
 * The cloud ids must match `filters/{filterId}.slug` seeded by the backend.
 */
import type { FilterPreset, StripFrame, StripVariant, StripVariantId } from './types';

export const MODULE_NAME = 'preview-editor';

/** Must match REGION in functions/src/config/constants.ts. */
export const FUNCTIONS_REGION = 'asia-southeast1';

/** Premium filter ids mirrored from the monetization module. */
export const PREMIUM_FILTER_IDS: string[] = [
  'cyberpunk',
  'oil-painting',
  'pop-art',
  'watercolor',
  'pixel-art',
  'anime-pro',
  'neon-glow',
  'film-noir',
];

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'none',
    name: 'Original',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#B8B8D0',
    grade: {},
  },
  {
    id: 'mono',
    name: 'Mono',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#9E9E9E',
    grade: { grayscale: 1, contrast: 1.08 },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#C08B5C',
    grade: { sepia: 0.85, contrast: 1.04 },
  },
  {
    id: 'vivid',
    name: 'Vivid',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#FF4DA6',
    grade: { saturation: 1.45, contrast: 1.12, brightness: 0.03 },
  },
  {
    id: 'cool',
    name: 'Cool',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#00BCD4',
    grade: { tint: [0.86, 0.96, 1.18], tintStrength: 0.35, contrast: 1.05 },
  },
  {
    id: 'warm',
    name: 'Warm',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#FFB300',
    grade: { tint: [1.16, 0.97, 0.82], tintStrength: 0.35 },
  },
  {
    id: 'faded',
    name: 'Faded',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#B0BEC5',
    grade: { contrast: 0.86, saturation: 0.78, brightness: 0.06, vignette: 0.18 },
  },
  {
    id: 'noir',
    name: 'Noir',
    category: 'basic',
    isPremium: false,
    renderer: 'gpu',
    color: '#455A64',
    grade: { grayscale: 1, contrast: 1.35, brightness: -0.05, vignette: 0.4 },
  },
  {
    id: 'dream',
    name: 'Dream',
    category: 'artistic',
    isPremium: false,
    renderer: 'gpu',
    color: '#7B61FF',
    grade: { brightness: 0.08, saturation: 1.1, tint: [1.1, 0.94, 1.14], tintStrength: 0.25, vignette: 0.22 },
  },
  {
    id: 'pop',
    name: 'Pop',
    category: 'artistic',
    isPremium: false,
    renderer: 'gpu',
    color: '#FFD600',
    grade: { saturation: 1.6, contrast: 1.25 },
  },
  {
    id: 'invert',
    name: 'Invert',
    category: 'utility',
    isPremium: false,
    renderer: 'gpu',
    color: '#00E676',
    grade: { invert: 1 },
  },
  // --------------------------------------------------------- AI (server-side)
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    category: 'artistic',
    isPremium: true,
    renderer: 'cloud',
    color: '#00BCD4',
    prompt: 'cyberpunk neon lights, futuristic, blade runner style',
  },
  {
    id: 'oil-painting',
    name: 'Oil Painting',
    category: 'artistic',
    isPremium: true,
    renderer: 'cloud',
    color: '#FF8A65',
    prompt: 'oil painting, impressionist, visible brush strokes',
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    category: 'artistic',
    isPremium: true,
    renderer: 'cloud',
    color: '#FFD600',
    prompt: 'andy warhol pop art, bold primary colours',
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    category: 'artistic',
    isPremium: true,
    renderer: 'cloud',
    color: '#81D4FA',
    prompt: 'watercolour painting, soft washes, artistic edge',
  },
  {
    id: 'pixel-art',
    name: 'Pixel Art',
    category: 'utility',
    isPremium: true,
    renderer: 'cloud',
    color: '#8BC34A',
    prompt: 'pixel art, 8-bit retro game aesthetic',
  },
  {
    id: 'anime-pro',
    name: 'Anime Pro',
    category: 'artistic',
    isPremium: true,
    renderer: 'cloud',
    color: '#FF4081',
    prompt: 'anime style, cel shading, vibrant colours, highly detailed',
  },
  {
    id: 'neon-glow',
    name: 'Neon Glow',
    category: 'seasonal',
    isPremium: true,
    renderer: 'cloud',
    color: '#E040FB',
    prompt: 'neon glow lighting, night club, vivid magenta and cyan',
  },
  {
    id: 'film-noir',
    name: 'Film Noir',
    category: 'artistic',
    isPremium: true,
    renderer: 'cloud',
    color: '#607D8B',
    prompt: '1950s film noir, high contrast black and white, dramatic shadows',
  },
];

export const GPU_FILTERS = FILTER_PRESETS.filter((f) => f.renderer === 'gpu');

export function getFilterPreset(filterId: string): FilterPreset {
  return FILTER_PRESETS.find((f) => f.id === filterId) ?? FILTER_PRESETS[0];
}

export const STRIP_VARIANTS: StripVariant[] = [
  {
    id: 'classic4',
    name: 'Classic 4-Cut',
    slots: 4,
    columns: 1,
    cellRatio: 4 / 3,
    description: 'Tradisyonal na photobooth strip — apat na pahaba na kuha.',
  },
  {
    id: 'film3',
    name: 'Film 3-Frame',
    slots: 3,
    columns: 1,
    cellRatio: 3 / 2,
    description: 'Parang 35mm film roll, tatlong landscape frames.',
  },
  {
    id: 'duo2',
    name: 'Duo 2-Up',
    slots: 2,
    columns: 1,
    cellRatio: 1,
    description: 'Dalawang square na kuha — mabilis i-share sa feed.',
  },
  {
    id: 'grid6',
    name: 'Grid 6',
    slots: 6,
    columns: 2,
    cellRatio: 1,
    description: 'Anim na kuha sa 2×3 grid para sa group shots.',
  },
  {
    id: 'polaroid1',
    name: 'Polaroid',
    slots: 1,
    columns: 1,
    cellRatio: 1,
    description: 'Isang kuha na may makapal na puting frame.',
  },
];

export const STRIP_FRAMES: StripFrame[] = [
  { id: 'retro', name: 'Retro', background: '#FFF3E0', accent: '#FF8A65', textColor: '#4E342E' },
  { id: 'neon', name: 'Neon', background: '#12102B', accent: '#FF4DA6', textColor: '#FFFFFF' },
  { id: 'film', name: 'Film', background: '#1C1C1C', accent: '#FFD600', textColor: '#F5F5F5' },
  { id: 'clean', name: 'Clean', background: '#FFFFFF', accent: '#00BCD4', textColor: '#1A1A2E' },
  { id: 'event', name: 'Event', background: '#1A1A2E', accent: '#7B61FF', textColor: '#FFFFFF' },
];

export function getStripVariant(id: StripVariantId): StripVariant {
  return STRIP_VARIANTS.find((v) => v.id === id) ?? STRIP_VARIANTS[0];
}

export function getStripFrame(id: StripFrame['id']): StripFrame {
  return STRIP_FRAMES.find((f) => f.id === id) ?? STRIP_FRAMES[0];
}

export const LIMITS = {
  /** Matches STORAGE_PATHS.userPhoto upload limits in storage.rules. */
  maxUploadBytes: 10 * 1024 * 1024,
  allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as string[],
  /** Gallery page size (Firestore `limit()`). */
  galleryPageSize: 24,
  /** Export quality ceiling for 4K-capable premium plans. */
  maxResizeLongEdge: 4096,
  defaultResizeLongEdge: 2048,
  stripCaptureQuality: 0.95,
  /** Share link TTL bounds enforced by createPhotoShare (1h .. 336h). */
  shareTtlHours: { min: 1, max: 336, default: 72 },
  uploadAttempts: 3,
};

export const CREDITS = {
  photo_capture: 1,
  strip_export: 1,
  extra_ai_render: 1,
};

/** Deep link prefix for public share pages (matches backend http endpoint `/s/{token}`). */
export const SHARE_BASE_URL = 'https://photobooth.example/s';