import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CreateEventForm from '../CreateEventForm';

// Mock dependencies
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/WalletContext', () => ({
  useWallet: () => ({ address: 'GTEST123' }),
}));
vi.mock('@/hooks/useCreatorEvents', () => ({
  useCreatorEvents: () => ({
    createEvent: vi.fn().mockResolvedValue({ eventId: 'e1', inviteCode: 'CODE' }),
  }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('CreateEventForm step gating', () => {
  it('blocks advance when title is empty', () => {
    render(<CreateEventForm />);
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Event title is required.')).toBeInTheDocument();
  });

  it('advances to step 2 when step 1 is valid', () => {
    render(<CreateEventForm />);
    fireEvent.change(screen.getByLabelText('Event Title'), {
      target: { value: 'Test Event' },
    });
    fireEvent.change(screen.getByLabelText('Event Starts At'), {
      target: { value: '2026-09-01T10:00' },
    });
    fireEvent.change(screen.getByLabelText('Event Ends At'), {
      target: { value: '2026-09-02T10:00' },
    });
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Review & Pay Fee')).toBeInTheDocument();
  });
});

describe('CreateEventForm draft', () => {
  it('auto-saves draft to localStorage', () => {
    render(<CreateEventForm />);
    fireEvent.change(screen.getByLabelText('Event Title'), {
      target: { value: 'Drafted Event' },
    });
    const saved = JSON.parse(localStorage.getItem('creator_event_draft') || '{}');
    expect(saved.title).toBe('Drafted Event');
  });

  it('restores draft on mount', () => {
    localStorage.setItem(
      'creator_event_draft',
      JSON.stringify({ title: 'Restored Event', description: '', maxParticipants: 50, startTime: '', endTime: '', prizePool: 0, rewardDistribution: { rank1: 0, rank2: 0, rank3: 0, rank4: 0, rank5: 0 }, entryFee: 0, category: '', bannerUrl: '' }),
    );
    render(<CreateEventForm />);
    expect(screen.getByLabelText('Event Title')).toHaveValue('Restored Event');
  });
});
