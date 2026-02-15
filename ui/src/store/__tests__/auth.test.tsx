import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth';

// Create a mock storage that works like real sessionStorage
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    _getStore: () => store,
  };
};

describe('AuthProvider', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    Object.defineProperty(window, 'sessionStorage', {
      value: mockStorage,
      writable: true,
    });
  });

  describe('initial state', () => {
    it('should initialize as not authenticated when no session exists', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStorage.getItem).toHaveBeenCalledWith('opencontext_authed');
    });

    it('should initialize as authenticated when session exists', () => {
      mockStorage.getItem.mockReturnValue('true');

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('login', () => {
    it('should authenticate with valid credentials', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      let success = false;
      act(() => {
        success = result.current.login('test@example.com', 'password123');
      });

      expect(success).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
      expect(mockStorage.setItem).toHaveBeenCalledWith('opencontext_authed', 'true');
    });

    it('should reject empty email', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      let success = true;
      act(() => {
        success = result.current.login('', 'password123');
      });

      expect(success).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStorage.setItem).not.toHaveBeenCalled();
    });

    it('should reject empty password', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      let success = true;
      act(() => {
        success = result.current.login('test@example.com', '');
      });

      expect(success).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStorage.setItem).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only email', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      let success = true;
      act(() => {
        success = result.current.login('   ', 'password123');
      });

      expect(success).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should reject whitespace-only password', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      let success = true;
      act(() => {
        success = result.current.login('test@example.com', '   ');
      });

      expect(success).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should trim whitespace from email and password', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      let success = false;
      act(() => {
        success = result.current.login('  test@example.com  ', '  password123  ');
      });

      expect(success).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('should clear authentication state', () => {
      mockStorage.getItem.mockReturnValue('true');

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current.isAuthenticated).toBe(true);

      act(() => {
        result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStorage.removeItem).toHaveBeenCalledWith('opencontext_authed');
    });

    it('should handle logout when already logged out', () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      act(() => {
        result.current.logout();
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(mockStorage.removeItem).toHaveBeenCalledWith('opencontext_authed');
    });
  });
});

describe('useAuth', () => {
  it('should throw error when used outside AuthProvider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within AuthProvider');

    consoleError.mockRestore();
  });
});
