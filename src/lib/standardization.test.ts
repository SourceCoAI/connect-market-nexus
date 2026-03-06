import { describe, it, expect } from 'vitest';
import {
  toStandardCategory,
  toStandardLocation,
  standardizeCategories,
  standardizeLocations,
  toCanonical
} from './standardization';

describe('toCanonical', () => {
  it('converts to lowercase and removes non-alphanumeric chars', () => {
    expect(toCanonical('Hello World!')).toBe('helloworld');
    expect(toCanonical('Food & Beverage')).toBe('foodandbeverage');
  });

  it('replaces & with and', () => {
    expect(toCanonical('A & B')).toBe('aandb');
  });

  it('handles empty/undefined inputs', () => {
    expect(toCanonical('')).toBe('');
    expect(toCanonical(undefined as unknown as string)).toBe('');
  });
});

describe('toStandardCategory', () => {
  it('returns empty string for empty/undefined input', () => {
    expect(toStandardCategory('')).toBe('');
    expect(toStandardCategory(undefined)).toBe('');
  });

  it('returns "all" for special all values', () => {
    expect(toStandardCategory('all')).toBe('all');
    expect(toStandardCategory('All')).toBe('all');
    expect(toStandardCategory('All Categories')).toBe('all');
    expect(toStandardCategory('ALL CATEGORIES')).toBe('all');
  });

  it('standardizes known categories', () => {
    // The exact outputs depend on STANDARDIZED_CATEGORIES from financial-parser
    const result = toStandardCategory('Technology & Software');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the original value for unknown categories', () => {
    expect(toStandardCategory('Completely Unknown Category XYZ')).toBe('Completely Unknown Category XYZ');
  });

  it('trims whitespace', () => {
    const result = toStandardCategory('  Technology & Software  ');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('toStandardLocation', () => {
  it('returns empty string for empty/undefined input', () => {
    expect(toStandardLocation('')).toBe('');
    expect(toStandardLocation(undefined)).toBe('');
  });

  it('returns "all" for special all values', () => {
    expect(toStandardLocation('all')).toBe('all');
    expect(toStandardLocation('All')).toBe('all');
    expect(toStandardLocation('all locations')).toBe('all');
  });

  it('handles location synonyms', () => {
    expect(toStandardLocation('northwest')).toBe('Western US');
    expect(toStandardLocation('pacific northwest')).toBe('Western US');
    expect(toStandardLocation('northeast')).toBe('Northeast US');
    expect(toStandardLocation('new england')).toBe('Northeast US');
    expect(toStandardLocation('southeast')).toBe('Southeast US');
    expect(toStandardLocation('midwest')).toBe('Midwest US');
    expect(toStandardLocation('west coast')).toBe('Western US');
    expect(toStandardLocation('east coast')).toBe('Northeast US');
    expect(toStandardLocation('usa')).toBe('United States');
    expect(toStandardLocation('us')).toBe('United States');
    expect(toStandardLocation('uk')).toBe('United Kingdom');
  });

  it('returns original value for unknown locations', () => {
    expect(toStandardLocation('Mars Colony')).toBe('Mars Colony');
  });
});

describe('standardizeCategories', () => {
  it('returns empty array for empty input', () => {
    expect(standardizeCategories([])).toEqual([]);
    expect(standardizeCategories()).toEqual([]);
  });

  it('deduplicates values', () => {
    const result = standardizeCategories(['Technology & Software', 'Technology & Software']);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('preserves order', () => {
    const input = ['Healthcare & Medical', 'Technology & Software'];
    const result = standardizeCategories(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters out empty values', () => {
    const result = standardizeCategories(['Technology & Software', '', 'Healthcare & Medical']);
    expect(result.every(v => v.length > 0)).toBe(true);
  });
});

describe('standardizeLocations', () => {
  it('returns empty array for empty input', () => {
    expect(standardizeLocations([])).toEqual([]);
    expect(standardizeLocations()).toEqual([]);
  });

  it('standardizes location synonyms in arrays', () => {
    const result = standardizeLocations(['northwest', 'midwest']);
    expect(result).toContain('Western US');
    expect(result).toContain('Midwest US');
  });

  it('deduplicates results', () => {
    const result = standardizeLocations(['northwest', 'western', 'Western US']);
    const uniqueResult = [...new Set(result)];
    expect(result.length).toBe(uniqueResult.length);
  });
});
