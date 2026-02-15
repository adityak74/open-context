import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../Landing';
import { AuthProvider } from '../../store/auth';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithProviders = () => {
    return render(
      <MemoryRouter>
        <AuthProvider>
          <Landing />
        </AuthProvider>
      </MemoryRouter>
    );
  };

  it('should render landing page with hero section', () => {
    renderWithProviders();

    expect(screen.getByText('Your AI context,')).toBeInTheDocument();
    expect(screen.getByText('everywhere you go.')).toBeInTheDocument();
    expect(screen.getByAltText('opencontext')).toBeInTheDocument();
  });

  it('should render all feature items', () => {
    renderWithProviders();

    expect(screen.getByText('Portable context')).toBeInTheDocument();
    expect(screen.getByText('Any-to-any migration')).toBeInTheDocument();
    expect(screen.getByText('Fully local')).toBeInTheDocument();
  });

  it('should render login form', () => {
    renderWithProviders();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('should handle email input', () => {
    renderWithProviders();

    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('should handle password input', () => {
    renderWithProviders();

    const passwordInput = screen.getByLabelText('Password');
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    expect(passwordInput).toHaveValue('password123');
  });

  it('should show loading state during form submission', async () => {
    renderWithProviders();

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: /continue/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Signing in…')).toBeInTheDocument();
  });

  it('should render footer', () => {
    renderWithProviders();

    expect(screen.getByText('opencontext — open source, runs locally')).toBeInTheDocument();
    expect(screen.getByText('No data leaves your machine')).toBeInTheDocument();
  });

  it('should render demo mode note', () => {
    renderWithProviders();

    expect(screen.getByText('Demo mode — any non-empty credentials work.')).toBeInTheDocument();
  });

  it('should have correct description text', () => {
    renderWithProviders();

    expect(screen.getByText(/opencontext migrates your full chat history/i)).toBeInTheDocument();
  });
});
