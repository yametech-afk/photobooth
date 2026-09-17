/**
 * FilterPicker — horizontal filter rail with premium lock chips.
 * Controlled component: pass the selection state from useFilterSelection
 * (lifted on the screen so captures carry the right filterId). Locked filters
 * show the lock badge and route the tap through selectFilter -> paywall.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { FilterDefinition } from '../types';

interface FilterPickerProps {
  catalog: FilterDefinition[];
  selectedId: string;
  onSelectFilter: (filterId: string) => { selected: boolean; locked: boolean };
  isFilterLocked: (filterId: string) => boolean;
}

export function FilterPicker({
  catalog,
  selectedId,
  onSelectFilter,
  isFilterLocked,
}: FilterPickerProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {catalog.map((filter) => {
          const locked = isFilterLocked(filter.id);
          const isSelected = selectedId === filter.id;
          return (
            <TouchableOpacity
              key={filter.id}
              onPress={() => onSelectFilter(filter.id)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {locked ? `🔒 ${filter.label}` : filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 130, width: '100%' },
  rail: { paddingHorizontal: 16, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  chipSelected: { backgroundColor: '#FF4DA6', borderColor: '#FF4DA6' },
  chipText: { color: '#fff', fontSize: 13 },
  chipTextSelected: { fontWeight: '700' },
});
