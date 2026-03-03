import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useSimplePagination } from './use-simple-pagination';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(BrowserRouter, null, children);

describe('useSimplePagination', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useSimplePagination(), { wrapper });

    expect(result.current.state.page).toBe(1);
    expect(result.current.state.perPage).toBe(20);
    expect(result.current.state.search).toBe('');
    expect(result.current.state.category).toBe('all');
    expect(result.current.state.location).toBe('all');
  });

  it('updates page number', () => {
    const { result } = renderHook(() => useSimplePagination(), { wrapper });

    act(() => {
      result.current.setPage(3);
    });

    expect(result.current.state.page).toBe(3);
  });

  it('updates per page and resets to page 1', () => {
    const { result } = renderHook(() => useSimplePagination(), { wrapper });

    act(() => {
      result.current.setPage(5);
    });

    act(() => {
      result.current.setPerPage(50);
    });

    expect(result.current.state.perPage).toBe(50);
    expect(result.current.state.page).toBe(1);
  });

  it('sets filters and resets to page 1', () => {
    const { result } = renderHook(() => useSimplePagination(), { wrapper });

    act(() => {
      result.current.setPage(3);
    });

    act(() => {
      result.current.setFilters({ search: 'test query' });
    });

    expect(result.current.state.search).toBe('test query');
    expect(result.current.state.page).toBe(1);
  });

  it('resets all filters', () => {
    const { result } = renderHook(() => useSimplePagination(), { wrapper });

    act(() => {
      result.current.setFilters({
        search: 'test',
        category: 'tech',
        location: 'US',
        revenueMin: 100000,
        revenueMax: 5000000,
      });
    });

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.state.search).toBe('');
    expect(result.current.state.category).toBe('all');
    expect(result.current.state.location).toBe('all');
    expect(result.current.state.revenueMin).toBeUndefined();
    expect(result.current.state.revenueMax).toBeUndefined();
    expect(result.current.state.page).toBe(1);
  });

  it('preserves perPage when resetting filters', () => {
    const { result } = renderHook(() => useSimplePagination(), { wrapper });

    act(() => {
      result.current.setPerPage(50);
    });

    act(() => {
      result.current.setFilters({ search: 'test' });
    });

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.state.perPage).toBe(50);
  });
});
