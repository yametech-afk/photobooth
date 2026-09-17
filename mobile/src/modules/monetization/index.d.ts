/**
 * Type declarations for the monetization module (plain JS — see index.js).
 * The runtime entry point is `index.js`; this file only describes the surface
 * consumed by TypeScript core files (App.tsx, RootNavigator.tsx).
 * The module's own docs (README) remain the source of truth for behavior.
 */
import type { ReactElement, ReactNode } from 'react';

export interface SubscriptionState {
  uid: string | null;
  /** Live users/{uid} Firestore document (plan + entitlements). */
  userDoc: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  entitlements: Record<string, boolean>;
  plan: { id: string; name: string; priceLabel: string };
  /** True when the server-granted premium entitlement is active. */
  isPremium: boolean;
  remaining: { limit: number; used: number; remaining: number; unlimited: boolean };
  busy: boolean;
  lastError: string | null;
  paywallVisible: boolean;
  openPaywall(): void;
  closePaywall(): void;
  purchase(platform?: 'apple' | 'google'): Promise<{ ok: boolean; error?: string }>;
  restore(): Promise<{ ok: boolean; error?: string }>;
}

export function useSubscription(): SubscriptionState;

/** UX-only entitlement check — the server remains authoritative. */
export function canUseFilter(user: unknown, filterId: string): boolean;

export function SubscriptionProvider(props: { children: ReactNode }): ReactElement;

export function PaywallModal(props: {
  visible: boolean;
  /** 'quota' (default) or 'filter' — changes the subtitle copy. */
  source?: string;
  onClose(): void;
}): ReactElement;

/** Real premium hub screen (route: `Premium`). Navigates to `EventBooking`. */
export function PremiumScreen(props: { navigation: { navigate(route: string): void } }): ReactElement;

/** B2B event packages / booking (route: `EventBooking`). */
export function EventBookingScreen(props: { navigation: { goBack(): void } }): ReactElement;

export const PLANS: Record<string, unknown>;
export const USAGE_LIMITS: Record<string, { photosPerDay: number; maxFileSizeMB: number }>;
export const PREMIUM_FILTER_IDS: string[];
export const EVENT_PACKAGES: { id: string; name: string; price: number; includes: string[] }[];