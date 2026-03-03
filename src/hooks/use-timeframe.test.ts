import { describe, it, expect } from 'vitest';
import { TIMEFRAME_PRESETS } from './use-timeframe';

// We test the exported constants and types since the hook itself
// requires react-router-dom's useSearchParams which needs a Router context

describe('TIMEFRAME_PRESETS', () => {
  it('contains expected preset options', () => {
    const keys = TIMEFRAME_PRESETS.map((p) => p.key);
    expect(keys).toContain('today');
    expect(keys).toContain('last_7d');
    expect(keys).toContain('last_14d');
    expect(keys).toContain('last_30d');
    expect(keys).toContain('last_90d');
    expect(keys).toContain('all_time');
    expect(keys).toContain('custom');
  });

  it('has labels for all presets', () => {
    TIMEFRAME_PRESETS.forEach((preset) => {
      expect(preset.label).toBeTruthy();
      expect(typeof preset.label).toBe('string');
    });
  });

  it('has exactly 7 presets', () => {
    expect(TIMEFRAME_PRESETS.length).toBe(7);
  });

  it('has human-readable labels', () => {
    const todayPreset = TIMEFRAME_PRESETS.find((p) => p.key === 'today');
    expect(todayPreset?.label).toBe('Today');

    const last7d = TIMEFRAME_PRESETS.find((p) => p.key === 'last_7d');
    expect(last7d?.label).toBe('Last 7 days');

    const allTime = TIMEFRAME_PRESETS.find((p) => p.key === 'all_time');
    expect(allTime?.label).toBe('All time');
  });
});
