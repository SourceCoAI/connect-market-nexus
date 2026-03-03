import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import ListingCardTitle from './ListingCardTitle';

// Mock Link to avoid react-router-dom context resolution mismatch in jsdom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
      [key: string]: unknown;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
});

describe('ListingCardTitle', () => {
  it('renders the title text', () => {
    render(<ListingCardTitle title="HVAC Business" />);
    expect(screen.getByText('HVAC Business')).toBeInTheDocument();
  });

  it('renders title as h3 element', () => {
    render(<ListingCardTitle title="Test Title" />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Test Title');
  });

  it('shows pending status when connection is pending', () => {
    render(
      <ListingCardTitle title="Business" connectionExists={true} connectionStatus="pending" />,
    );
    expect(screen.getByText('Request Pending')).toBeInTheDocument();
    expect(screen.getByText('View Status')).toBeInTheDocument();
  });

  it('shows rejected status when connection is rejected', () => {
    render(
      <ListingCardTitle title="Business" connectionExists={true} connectionStatus="rejected" />,
    );
    expect(screen.getByText('Not Selected')).toBeInTheDocument();
  });

  it('does not show status when no connection exists', () => {
    render(<ListingCardTitle title="Business" connectionExists={false} />);
    expect(screen.queryByText('Request Pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Not Selected')).not.toBeInTheDocument();
  });

  it('does not show status indicator for approved connections', () => {
    render(
      <ListingCardTitle title="Business" connectionExists={true} connectionStatus="approved" />,
    );
    // Approved badge is rendered on the image, not in title
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
  });

  it('applies grid view type styling', () => {
    render(<ListingCardTitle title="Business" viewType="grid" />);
    const heading = screen.getByRole('heading');
    expect(heading.classList.contains('text-[20px]')).toBe(true);
  });

  it('applies list view type styling', () => {
    render(<ListingCardTitle title="Business" viewType="list" />);
    const heading = screen.getByRole('heading');
    expect(heading.classList.contains('text-[18px]')).toBe(true);
  });
});
