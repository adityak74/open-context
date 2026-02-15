import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AppProvider, useAppState, defaultPreferences } from '../context';
import React from 'react';
import type { UserPreferences, NormalizedConversation, PipelineState } from '../../types/preferences';

// Helper component to test the hook
function TestComponent() {
  const { state, dispatch } = useAppState();
  return (
    <div>
      <div data-testid="preferences">{JSON.stringify(state.preferences)}</div>
      <div data-testid="conversations">{JSON.stringify(state.conversations)}</div>
      <div data-testid="pipeline">{JSON.stringify(state.pipeline)}</div>
      <button
        data-testid="set-preferences"
        onClick={() =>
          dispatch({
            type: 'SET_PREFERENCES',
            payload: { ...defaultPreferences, customInstructions: 'test' },
          })
        }
      >
        Set Preferences
      </button>
      <button
        data-testid="update-preferences"
        onClick={() =>
          dispatch({
            type: 'UPDATE_PREFERENCES',
            payload: { customInstructions: 'updated' },
          })
        }
      >
        Update Preferences
      </button>
      <button
        data-testid="set-conversations"
        onClick={() =>
          dispatch({
            type: 'SET_CONVERSATIONS',
            payload: [
              {
                id: '1',
                title: 'Test',
                created: '2024-01-01',
                updated: '2024-01-01',
                messages: [],
                selected: false,
              },
            ],
          })
        }
      >
        Set Conversations
      </button>
      <button data-testid="toggle-conversation" onClick={() => dispatch({ type: 'TOGGLE_CONVERSATION', payload: '1' })}>
        Toggle Conversation
      </button>
      <button
        data-testid="update-conversation"
        onClick={() =>
          dispatch({
            type: 'UPDATE_CONVERSATION',
            payload: { id: '1', updates: { title: 'Updated' } },
          })
        }
      >
        Update Conversation
      </button>
      <button data-testid="delete-conversation" onClick={() => dispatch({ type: 'DELETE_CONVERSATION', payload: '1' })}>
        Delete Conversation
      </button>
      <button data-testid="set-pipeline" onClick={() => dispatch({ type: 'SET_PIPELINE', payload: { stage: 'parsing', progress: 50 } })}>
        Set Pipeline
      </button>
      <button data-testid="reset-pipeline" onClick={() => dispatch({ type: 'RESET_PIPELINE' })}>
        Reset Pipeline
      </button>
    </div>
  );
}

describe('AppProvider and useAppState', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>;

  it('should provide default state', () => {
    render(<TestComponent />, { wrapper });

    const prefsEl = screen.getByTestId('preferences');
    const prefs = JSON.parse(prefsEl.textContent || '{}');
    expect(prefs.communicationStyle.tone).toBe('neutral');
    expect(prefs.technicalProfile.experienceLevel).toBe('intermediate');
  });

  it('should handle SET_PREFERENCES', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-preferences'));

    const prefsEl = screen.getByTestId('preferences');
    const prefs = JSON.parse(prefsEl.textContent || '{}');
    expect(prefs.customInstructions).toBe('test');
  });

  it('should handle UPDATE_PREFERENCES', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-preferences'));
    fireEvent.click(screen.getByTestId('update-preferences'));

    const prefsEl = screen.getByTestId('preferences');
    const prefs = JSON.parse(prefsEl.textContent || '{}');
    expect(prefs.customInstructions).toBe('updated');
  });

  it('should handle SET_CONVERSATIONS', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-conversations'));

    const convsEl = screen.getByTestId('conversations');
    const convs = JSON.parse(convsEl.textContent || '[]');
    expect(convs).toHaveLength(1);
    expect(convs[0].title).toBe('Test');
  });

  it('should handle TOGGLE_CONVERSATION', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-conversations'));
    fireEvent.click(screen.getByTestId('toggle-conversation'));

    const convsEl = screen.getByTestId('conversations');
    const convs = JSON.parse(convsEl.textContent || '[]');
    expect(convs[0].selected).toBe(true);
  });

  it('should handle UPDATE_CONVERSATION', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-conversations'));
    fireEvent.click(screen.getByTestId('update-conversation'));

    const convsEl = screen.getByTestId('conversations');
    const convs = JSON.parse(convsEl.textContent || '[]');
    expect(convs[0].title).toBe('Updated');
  });

  it('should handle DELETE_CONVERSATION', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-conversations'));
    fireEvent.click(screen.getByTestId('delete-conversation'));

    const convsEl = screen.getByTestId('conversations');
    const convs = JSON.parse(convsEl.textContent || '[]');
    expect(convs).toHaveLength(0);
  });

  it('should handle SET_PIPELINE', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-pipeline'));

    const pipelineEl = screen.getByTestId('pipeline');
    const pipeline = JSON.parse(pipelineEl.textContent || '{}');
    expect(pipeline.stage).toBe('parsing');
    expect(pipeline.progress).toBe(50);
  });

  it('should handle RESET_PIPELINE', () => {
    render(<TestComponent />, { wrapper });

    fireEvent.click(screen.getByTestId('set-pipeline'));
    fireEvent.click(screen.getByTestId('reset-pipeline'));

    const pipelineEl = screen.getByTestId('pipeline');
    const pipeline = JSON.parse(pipelineEl.textContent || '{}');
    expect(pipeline.stage).toBe('idle');
    expect(pipeline.progress).toBe(0);
  });

  it('should throw error when useAppState is used outside AppProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    function ComponentWithoutProvider() {
      try {
        useAppState();
        return <div>No error</div>;
      } catch (e) {
        return <div data-testid="error">{(e as Error).message}</div>;
      }
    }

    render(<ComponentWithoutProvider />);
    expect(screen.getByTestId('error').textContent).toBe('useAppState must be used within AppProvider');

    consoleError.mockRestore();
  });
});

describe('server API persistence', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>;

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches preferences from /api/preferences on mount', async () => {
    render(<TestComponent />, { wrapper });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/preferences');
    });
  });

  it('loads persisted preferences when server returns them', async () => {
    const serverPrefs = { ...defaultPreferences, customInstructions: 'from server' };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => serverPrefs,
    } as Response);

    render(<TestComponent />, { wrapper });

    await waitFor(() => {
      const prefs = JSON.parse(screen.getByTestId('preferences').textContent || '{}');
      expect(prefs.customInstructions).toBe('from server');
    });
  });

  it('falls back to defaults when server returns null', async () => {
    render(<TestComponent />, { wrapper });

    await waitFor(() => {
      const prefs = JSON.parse(screen.getByTestId('preferences').textContent || '{}');
      expect(prefs.communicationStyle.tone).toBe('neutral');
    });
  });

  it('falls back to defaults when server fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    render(<TestComponent />, { wrapper });

    await waitFor(() => {
      const prefs = JSON.parse(screen.getByTestId('preferences').textContent || '{}');
      expect(prefs.communicationStyle.tone).toBe('neutral');
    });
  });

  it('saves preferences to /api/preferences after change (debounced)', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: async () => null } as Response)
        .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

      render(<TestComponent />, { wrapper });

      // Flush the initial load (GET /api/preferences)
      await act(async () => { vi.runAllTimersAsync(); });

      fireEvent.click(screen.getByTestId('set-preferences'));

      // Advance past the 800ms debounce and flush
      await act(async () => { vi.advanceTimersByTime(1000); });
      await act(async () => { vi.runAllTimersAsync(); });

      const calls = vi.mocked(fetch).mock.calls;
      const putCall = calls.find(([url, opts]) => url === '/api/preferences' && (opts as RequestInit)?.method === 'PUT');
      expect(putCall).toBeDefined();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.customInstructions).toBe('test');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not save preferences before initial load completes', async () => {
    vi.useFakeTimers();
    try {
      // fetch never resolves — simulates slow server
      vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}));

      render(<TestComponent />, { wrapper });
      fireEvent.click(screen.getByTestId('set-preferences'));

      await act(async () => { vi.advanceTimersByTime(1000); });

      // Only the initial GET, no PUT
      expect(fetch).toHaveBeenCalledTimes(1);
      expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit | undefined)?.method).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('defaultPreferences export', () => {
  it('should have correct default values', () => {
    expect(defaultPreferences.communicationStyle.tone).toBe('neutral');
    expect(defaultPreferences.communicationStyle.detailLevel).toBe('balanced');
    expect(defaultPreferences.technicalProfile.experienceLevel).toBe('intermediate');
    expect(defaultPreferences.workContext.role).toBe('');
    expect(defaultPreferences.personalContext.interests).toEqual([]);
    expect(defaultPreferences.currentFocus.projects).toEqual([]);
    expect(defaultPreferences.behaviorPreferences.proactiveness).toBe('moderate');
    expect(defaultPreferences.customInstructions).toBe('');
  });
});
