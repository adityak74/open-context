import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConversionPipeline from '../ConversionPipeline';
import { AppProvider } from '../../store/context';
import type { PipelineState } from '../../types/preferences';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <AppProvider>
      {children}
    </AppProvider>
  </MemoryRouter>
);

describe('ConversionPipeline', () => {
  it('should render pipeline component', () => {
    render(<TestWrapper><ConversionPipeline /></TestWrapper>);

    expect(screen.getByText('Conversion Pipeline')).toBeInTheDocument();
    expect(screen.getByText(/Monitor the progress/i)).toBeInTheDocument();
  });

  it('should render all pipeline stages', () => {
    render(<TestWrapper><ConversionPipeline /></TestWrapper>);

    expect(screen.getByText('Uploading')).toBeInTheDocument();
    expect(screen.getByText('Parsing')).toBeInTheDocument();
    expect(screen.getByText('Normalizing')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('should render legend badges', () => {
    render(<TestWrapper><ConversionPipeline /></TestWrapper>);

    expect(screen.getByText('Legend:')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    render(<TestWrapper><ConversionPipeline /></TestWrapper>);

    expect(screen.getAllByText('Conversations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Selected').length).toBeGreaterThan(0);
  });

  it('should show idle state message', () => {
    render(<TestWrapper><ConversionPipeline /></TestWrapper>);

    expect(screen.getByText('No conversion in progress.')).toBeInTheDocument();
    expect(screen.getByText(/Go to the Conversations tab/i)).toBeInTheDocument();
  });
});

describe('ConversionPipeline with different states', () => {
  it('should render pipeline in idle state', () => {
    render(<TestWrapper><ConversionPipeline /></TestWrapper>);
    
    const stages = ['Uploading', 'Parsing', 'Normalizing', 'Complete'];
    stages.forEach(stage => {
      expect(screen.getByText(stage)).toBeInTheDocument();
    });
  });
});
