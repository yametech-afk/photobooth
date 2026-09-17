/**
 * Filter catalogue shared with the monetization module.
 * Premium IDs intentionally match PREMIUM_FILTER_IDS in src/modules/monetization/config/plans.js
 */
import type { FilterDefinition } from '../types';

export const FILTER_CATALOG: FilterDefinition[] = [
  { id: 'none', label: 'Original', isPremium: false },
  { id: 'vintage', label: 'Vintage', isPremium: false },
  { id: 'sketch', label: 'Sketch', isPremium: false },
  { id: 'anime', label: 'Anime', isPremium: false },
  { id: 'cyberpunk', label: 'Cyberpunk', isPremium: true },
  { id: 'oil-painting', label: 'Oil Painting', isPremium: true },
  { id: 'pop-art', label: 'Pop Art', isPremium: true },
  { id: 'watercolor', label: 'Watercolor', isPremium: true },
  { id: 'pixel-art', label: 'Pixel Art', isPremium: true },
  { id: 'anime-pro', label: 'Anime Pro', isPremium: true },
  { id: 'neon-glow', label: 'Neon Glow', isPremium: true },
  { id: 'film-noir', label: 'Film Noir', isPremium: true },
];

export function getFilterById(id: string): FilterDefinition | undefined {
  return FILTER_CATALOG.find((f) => f.id === id);
}
