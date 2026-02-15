import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { ScrollArea, ScrollBar } from '../scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../select';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../tooltip';

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock PointerEvent
global.PointerEvent = vi.fn() as unknown as typeof PointerEvent;

describe('ScrollArea', () => {
  it('should render ScrollArea with content', () => {
    render(
      <ScrollArea data-testid="scroll-area">
        <div>Content</div>
      </ScrollArea>
    );
    expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <ScrollArea className="custom-scroll" data-testid="scroll-area">
        Content
      </ScrollArea>
    );
    expect(screen.getByTestId('scroll-area')).toHaveClass('custom-scroll');
  });
});

describe('ScrollBar', () => {
  it('ScrollBar exists as an export', () => {
    // ScrollBar is tested implicitly through ScrollArea usage
    expect(ScrollBar).toBeDefined();
  });
});

describe('Select Components', () => {
  it('should render Select with trigger', () => {
    render(
      <Select>
        <SelectTrigger data-testid="select-trigger">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByTestId('select-trigger')).toBeInTheDocument();
    expect(screen.getByText('Select an option')).toBeInTheDocument();
  });

  it('should render Select with different sizes', () => {
    render(
      <Select>
        <SelectTrigger size="sm" data-testid="select-sm">Small</SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByTestId('select-sm')).toHaveAttribute('data-size', 'sm');

    render(
      <Select>
        <SelectTrigger size="default" data-testid="select-default">Default</SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByTestId('select-default')).toHaveAttribute('data-size', 'default');
  });



  it('should apply custom className to SelectTrigger', () => {
    render(
      <Select>
        <SelectTrigger className="custom-trigger" data-testid="trigger">
          Select
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByTestId('trigger')).toHaveClass('custom-trigger');
  });
});

describe('Tooltip Components', () => {
  it('should render Tooltip with all parts', () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger data-testid="tooltip-trigger">Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByTestId('tooltip-trigger')).toBeInTheDocument();
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('should render TooltipProvider', () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(container).toBeInTheDocument();
  });
});
