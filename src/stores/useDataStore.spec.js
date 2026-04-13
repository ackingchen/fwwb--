import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';
import { useDataStore } from './useDataStore';
import { useConfigStore } from './useConfigStore';

describe('Data Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('filters detections based on confidence and enabled labels', () => {
    const dataStore = useDataStore();
    const configStore = useConfigStore();

    // Set initial config
    configStore.confidence = 0.90;
    configStore.enabledLabels = ['person', 'vehicle'];

    // Add mock data
    dataStore.detections = [
      { id: '1', score: 0.95, labelKey: 'person' },
      { id: '2', score: 0.85, labelKey: 'person' },
      { id: '3', score: 0.92, labelKey: 'animal' },
      { id: '4', score: 0.91, labelKey: 'vehicle' }
    ];

    expect(dataStore.filteredDetections).toHaveLength(2);
    expect(dataStore.filteredDetections[0].id).toBe('1');
    expect(dataStore.filteredDetections[1].id).toBe('4');
  });

  it('returns default active task if tasks list is empty', () => {
    const dataStore = useDataStore();
    dataStore.tasks = [];
    
    expect(dataStore.activeTask).toEqual({});
  });
});
