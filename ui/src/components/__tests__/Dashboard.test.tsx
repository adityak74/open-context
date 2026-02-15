import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';
import { AppProvider } from '../../store/context';

describe('Dashboard', () => {
  const renderWithProviders = () => {
    return render(
      <MemoryRouter>
        <AppProvider>
          <Dashboard />
        </AppProvider>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render dashboard with main elements', () => {
    renderWithProviders();

    expect(screen.getByAltText('opencontext')).toBeInTheDocument();
    expect(screen.getByText('Your Context')).toBeInTheDocument();
    expect(screen.getByText('Work & Personal')).toBeInTheDocument();
    expect(screen.getByText('Current Focus')).toBeInTheDocument();
    expect(screen.getByText('Tech Profile')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
    expect(screen.getByText('MCP Server')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    renderWithProviders();

    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Profile complete')).toBeInTheDocument();
  });

  it('should render work and personal card fields', () => {
    renderWithProviders();

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Industry')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
    expect(screen.getByText('Interests')).toBeInTheDocument();
  });

  it('should render current focus card fields', () => {
    renderWithProviders();

    expect(screen.getByText('Top of mind')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Goals')).toBeInTheDocument();
  });

  it('should render tech profile card fields', () => {
    renderWithProviders();

    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('Languages')).toBeInTheDocument();
    expect(screen.getByText('Frameworks')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
  });

  it('should render communication card fields', () => {
    renderWithProviders();

    expect(screen.getByText('Tone')).toBeInTheDocument();
    expect(screen.getByText('Detail')).toBeInTheDocument();
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('should render MCP server tools', () => {
    renderWithProviders();

    expect(screen.getByText('save_context')).toBeInTheDocument();
    expect(screen.getByText('recall_context')).toBeInTheDocument();
    expect(screen.getByText('list_contexts')).toBeInTheDocument();
    expect(screen.getByText('search_contexts')).toBeInTheDocument();
    expect(screen.getByText('update_context')).toBeInTheDocument();
    expect(screen.getByText('delete_context')).toBeInTheDocument();
  });

  it('should show build step in MCP section', () => {
    renderWithProviders();

    expect(screen.getByText('Build the project')).toBeInTheDocument();
  });

  it('should show copy buttons for commands', () => {
    renderWithProviders();

    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThan(0);
  });

  it('should show default values for empty preferences', () => {
    renderWithProviders();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('should display experience level from preferences', () => {
    renderWithProviders();

    expect(screen.getByText('intermediate')).toBeInTheDocument();
  });

  it('should display communication preferences', () => {
    renderWithProviders();

    expect(screen.getByText('neutral')).toBeInTheDocument();
    expect(screen.getByText('balanced')).toBeInTheDocument();
    expect(screen.getByText('markdown')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });
});
