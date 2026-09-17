/**
 * Filter selection hook + premium gating.
 * Bridges to the monetization module via an injectable PremiumFilterGate —
 * the screen passes the real adapter (src/modules/monetization -> canUseFilter / PaywallModal).
 */
import { useCallback, useMemo, useState } from 'react';
import { FILTER_CATALOG } from '../filters/filterCatalog';
import type { FilterDefinition, PremiumFilterGate } from '../types';

const FALLBACK_GATE: PremiumFilterGate = {
  canUseFilter: () => false, // fail-closed: without a gate, premium filters stay locked
  lockedFilterIds: () => FILTER_CATALOG.filter((f) => f.isPremium).map((f) => f.id),
};

export function useFilterSelection(gate?: PremiumFilterGate) {
  const activeGate = gate ?? FALLBACK_GATE;
  const [selectedId, setSelectedId] = useState<string>('none');
  const [pendingLockedId, setPendingLockedId] = useState<string | null>(null);

  const selected = useMemo(
    () => FILTER_CATALOG.find((f) => f.id === selectedId) as FilterDefinition,
    [selectedId]
  );

  const isFilterLocked = useCallback(
    (filterId: string) => !activeGate.canUseFilter(filterId),
    [activeGate]
  );

  /**
   * Select a filter. Locked filters do NOT become active — instead the caller
   * is told to open the paywall (onLockedFilterTouched), matching the
   * monetization module's FilterLock interaction.
   */
  const selectFilter = useCallback(
    (filterId: string): { selected: boolean; locked: boolean } => {
      const filter = FILTER_CATALOG.find((f) => f.id === filterId);
      if (!filter) return { selected: false, locked: false };
      if (activeGate.canUseFilter(filterId)) {
        setSelectedId(filterId);
        setPendingLockedId(null);
        return { selected: true, locked: false };
      }
      setPendingLockedId(filterId);
      activeGate.onLockedFilterTouched?.(filterId);
      return { selected: false, locked: true };
    },
    [activeGate]
  );

  /** Call after a successful premium unlock so the filter becomes usable immediately. */
  const unlockAndSelect = useCallback((filterId: string) => {
    setSelectedId(filterId);
    setPendingLockedId(null);
  }, []);

  return {
    catalog: FILTER_CATALOG,
    selectedId,
    selected,
    pendingLockedId,
    isFilterLocked,
    selectFilter,
    unlockAndSelect,
    lockedFilterIds: activeGate.lockedFilterIds(),
  };
}
