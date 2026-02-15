import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PreferencesEditor from '../PreferencesEditor';
import ContextViewer from '../ContextViewer';
import ConversionPipeline from '../ConversionPipeline';
import VendorExport from '../VendorExport';
import { AppProvider } from '../../store/context';

// Mock file system APIs
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe('PreferencesEditor', () => {
  const renderWithProviders = () => {
    return render(
      <MemoryRouter>
        <AppProvider>
          <PreferencesEditor />
        </AppProvider>
      </MemoryRouter>
    );
  };

  it('should render without crashing', () => {
    renderWithProviders();
    expect(document.body).toBeInTheDocument();
  });

  it('should render the component title', () => {
    renderWithProviders();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
  });

  it('should render preference sections', () => {
    renderWithProviders();
    expect(screen.getByText('Communication Style')).toBeInTheDocument();
    expect(screen.getByText('Technical Profile')).toBeInTheDocument();
    expect(screen.getByText('Work Context')).toBeInTheDocument();
    expect(screen.getByText('Personal Context')).toBeInTheDocument();
  });
});

describe('ContextViewer', () => {
  const renderWithProviders = () => {
    return render(
      <MemoryRouter>
        <AppProvider>
          <ContextViewer />
        </AppProvider>
      </MemoryRouter>
    );
  };

  it('should render without crashing', () => {
    renderWithProviders();
    expect(document.body).toBeInTheDocument();
  });

  it('should render the component title', () => {
    renderWithProviders();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
  });
});

describe('ConversionPipeline', () => {
  const renderWithProviders = () => {
    return render(
      <MemoryRouter>
        <AppProvider>
          <ConversionPipeline />
        </AppProvider>
      </MemoryRouter>
    );
  };

  it('should render without crashing', () => {
    renderWithProviders();
    expect(document.body).toBeInTheDocument();
  });

  it('should render the component title', () => {
    renderWithProviders();
    expect(screen.getByText('Conversion Pipeline')).toBeInTheDocument();
  });
});

describe('VendorExport', () => {
  const renderWithProviders = () => {
    return render(
      <MemoryRouter>
        <AppProvider>
          <VendorExport />
        </AppProvider>
      </MemoryRouter>
    );
  };

  it('should render without crashing', () => {
    renderWithProviders();
    expect(document.body).toBeInTheDocument();
  });

  it('should render the component title', () => {
    renderWithProviders();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('should render vendor options', () => {
    renderWithProviders();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
  });
});
