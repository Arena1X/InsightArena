import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToastProvider, useToast } from '../ToastContext';

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Toast dedup', () => {
  it('deduplicates identical messages within the window', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    const id1 = act(() => result.current.show({ description: 'Error occurred' }));
    const id2 = act(() => result.current.show({ description: 'Error occurred' }));

    expect(id1).toBeTruthy();
    expect(id2).toBe('');
    expect(result.current.toasts).toHaveLength(1);
  });

  it('allows identical messages after the dedup window', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.show({ description: 'Error occurred' }));
    act(() => vi.advanceTimersByTime(4000));
    const id2 = act(() => result.current.show({ description: 'Error occurred' }));

    expect(id2).toBeTruthy();
    expect(result.current.toasts).toHaveLength(2);
  });
});

describe('Toast cap', () => {
  it('caps concurrent toasts at MAX_TOASTS (5)', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    for (let i = 0; i < 7; i++) {
      act(() => result.current.show({ description: `Toast ${i}` }));
    }

    expect(result.current.toasts.length).toBeLessThanOrEqual(5);
  });
});
