import { useCallback, useState } from 'react';

export function useMessageSelection<T extends { id: string }>() {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const enterSelection = useCallback((initialId?: string) => {
    setSelectionMode(true);
    setSelectedIds(initialId ? [initialId] : []);
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback((items: T[]) => {
    setSelectedIds(items.map((i) => i.id));
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds]);

  return {
    selectionMode,
    selectedIds,
    selectedCount: selectedIds.length,
    enterSelection,
    exitSelection,
    toggle,
    selectAll,
    isSelected,
    setSelectedIds,
  };
}
