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

  it('coalesces duplicate active messages even after the dedup window', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    const id1 = act(() =>
      result.current.show({ description: 'Persistent error', duration: 5000 }),
    );
    act(() => vi.advanceTimersByTime(4000));
    const id2 = act(() =>
      result.current.show({ description: 'Persistent error', duration: 5000 }),
    );

    expect(id1).toBeTruthy();
    expect(id2).toBe('');
    expect(result.current.toasts).toHaveLength(1);
  });

  it('allows identical messages after the dedup window once dismissed', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id1 = '';
    act(() => {
      id1 = result.current.show({ description: 'Error occurred' });
    });
    act(() => result.current.dismiss(id1));
    act(() => vi.advanceTimersByTime(4000));
    const id2 = act(() => result.current.show({ description: 'Error occurred' }));

    expect(id2).toBeTruthy();
    expect(result.current.toasts).toHaveLength(1);
  });
});

describe('Toast cap and queue', () => {
  it('caps visible toasts at five and queues the rest', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    const ids: string[] = [];
    for (let i = 0; i < 7; i++) {
      act(() => {
        ids.push(result.current.show({ description: `Toast ${i}` }));
      });
    }

    expect(result.current.toasts).toHaveLength(5);
    expect(ids.every(Boolean)).toBe(true);
    expect(result.current.toasts.map((toast) => toast.description)).toEqual([
      'Toast 0',
      'Toast 1',
      'Toast 2',
      'Toast 3',
      'Toast 4',
    ]);
  });

  it('promotes queued toasts as visible ones dismiss', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let firstId = '';

    act(() => {
      firstId = result.current.show({ description: 'First toast', duration: 1000 });
      for (let i = 1; i < 6; i++) {
        result.current.show({ description: `Toast ${i}`, duration: 5000 });
      }
    });

    expect(result.current.toasts).toHaveLength(5);
    expect(result.current.toasts.some((t) => t.description === 'Toast 5')).toBe(false);

    act(() => result.current.dismiss(firstId));

    expect(result.current.toasts).toHaveLength(5);
    expect(result.current.toasts.at(-1)?.description).toBe('Toast 5');

    // Auto-dismiss promotes queued toasts too
    act(() => {
      result.current.show({ description: 'Toast 6', duration: 2000 });
    });
    expect(result.current.toasts).toHaveLength(5);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].description).toBe('Toast 6');
  });
});

describe('Toast dismissal', () => {
  it('auto-dismisses after the configured timeout', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.show({ description: 'Temporary toast', duration: 1000 });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(999));
    expect(result.current.toasts).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('shows and dismisses a single toast normally', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id = '';

    act(() => {
      id = result.current.show({ description: 'One toast', duration: 0 });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].description).toBe('One toast');

    act(() => result.current.dismiss(id));

    expect(result.current.toasts).toHaveLength(0);
  });
});
