import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';

// Mock the @docuseal/react module
vi.mock('@docuseal/react', () => ({
  DocusealForm: ({
    src,
    onComplete,
    onDecline,
    onLoad,
  }: {
    src: string;
    onComplete?: (data: Record<string, unknown>) => void;
    onDecline?: () => void;
    onLoad?: () => void;
  }) => (
    <div data-testid="docuseal-form" data-src={src}>
      <button data-testid="mock-complete" onClick={() => onComplete?.({ signed: true })}>
        Complete
      </button>
      <button data-testid="mock-decline" onClick={() => onDecline?.()}>
        Decline
      </button>
      <button data-testid="mock-load" onClick={() => onLoad?.()}>
        Load
      </button>
    </div>
  ),
}));

import { DocuSealSigningPanel } from './DocuSealSigningPanel';

describe('DocuSealSigningPanel', () => {
  const defaultProps = {
    embedSrc: 'https://docuseal.com/embed/test-form-123',
  };

  it('renders with loading state initially', () => {
    render(<DocuSealSigningPanel {...defaultProps} />);
    expect(screen.getByText('Loading signing form...')).toBeInTheDocument();
  });

  it('renders the DocuSeal form with correct src', () => {
    render(<DocuSealSigningPanel {...defaultProps} />);
    const form = screen.getByTestId('docuseal-form');
    expect(form).toBeInTheDocument();
    expect(form.getAttribute('data-src')).toBe(defaultProps.embedSrc);
  });

  it('renders custom title and description', () => {
    render(
      <DocuSealSigningPanel
        {...defaultProps}
        title="Sign NDA"
        description="Review the NDA below."
      />,
    );
    expect(screen.getByText('Sign NDA')).toBeInTheDocument();
    expect(screen.getByText('Review the NDA below.')).toBeInTheDocument();
  });

  it('renders default title and description', () => {
    render(<DocuSealSigningPanel {...defaultProps} />);
    expect(screen.getByText('Sign Document')).toBeInTheDocument();
    expect(screen.getByText('Please review and sign the document below.')).toBeInTheDocument();
  });

  it('shows signed state after form completion', () => {
    const onCompleted = vi.fn();
    render(<DocuSealSigningPanel {...defaultProps} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByTestId('mock-complete'));

    expect(screen.getByText('Document signed successfully.')).toBeInTheDocument();
    expect(screen.getByText('Your access has been updated.')).toBeInTheDocument();
    expect(onCompleted).toHaveBeenCalledWith({ signed: true });
  });

  it('shows declined state after form decline', () => {
    const onDeclined = vi.fn();
    render(<DocuSealSigningPanel {...defaultProps} onDeclined={onDeclined} />);

    fireEvent.click(screen.getByTestId('mock-decline'));

    expect(screen.getByText('Document Declined')).toBeInTheDocument();
    expect(screen.getByText(/You've declined to sign/)).toBeInTheDocument();
    expect(onDeclined).toHaveBeenCalled();
  });

  it('hides loading indicator after form loads', () => {
    render(<DocuSealSigningPanel {...defaultProps} />);

    // Before load
    expect(screen.getByText('Loading signing form...')).toBeInTheDocument();

    // Trigger load
    fireEvent.click(screen.getByTestId('mock-load'));

    // Loading text should be gone
    expect(screen.queryByText('Loading signing form...')).not.toBeInTheDocument();
  });

  it('does not render title/description when title is empty string', () => {
    render(<DocuSealSigningPanel {...defaultProps} title="" />);
    // The title section should not render
    expect(screen.queryByText('Sign Document')).not.toBeInTheDocument();
  });
});
