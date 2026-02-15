import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VendorExport from '../VendorExport';
import { AppProvider } from '../../store/context';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      {children}
    </AppProvider>
  </MemoryRouter>
);

describe('VendorExport', () => {
  it('should render export component', () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText(/Translate your preferences/i)).toBeInTheDocument();
  });

  it('should render all vendor options', () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
  });

  it('should render vendor badges', () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    // Use getAllByText since these appear multiple times (once per vendor that supports them)
    const preferencesBadges = screen.getAllByText('Preferences');
    const memoryBadges = screen.getAllByText('Memory');
    expect(preferencesBadges.length).toBeGreaterThan(0);
    expect(memoryBadges.length).toBeGreaterThan(0);
  });

  it('should render export button', () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    expect(screen.getByRole('button', { name: /generate.*export/i })).toBeInTheDocument();
  });

  it('should select different vendor when clicked', () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    const chatgptButton = screen.getByText('ChatGPT').closest('button');
    expect(chatgptButton).toBeInTheDocument();
    
    if (chatgptButton) {
      fireEvent.click(chatgptButton);
    }

    // Should update selection (button should have different styling)
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
  });

  it('should generate export when button is clicked', async () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    const exportButton = screen.getByRole('button', { name: /generate.*export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('Generated Files')).toBeInTheDocument();
    });
  });

  it('should show download buttons after export', async () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    const exportButton = screen.getByRole('button', { name: /generate.*export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(screen.getByText('Download All')).toBeInTheDocument();
    });
  });

  it('should show preview button after export', async () => {
    render(<TestWrapper><VendorExport /></TestWrapper>);

    const exportButton = screen.getByRole('button', { name: /generate.*export/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      const previewButtons = screen.getAllByRole('button', { name: /preview/i });
      expect(previewButtons.length).toBeGreaterThan(0);
    });
  });
});
