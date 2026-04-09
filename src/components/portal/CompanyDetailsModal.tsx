import DOMPurify from 'dompurify';
import {
  Building2,
  MapPin,
  DollarSign,
  Globe,
  ExternalLink,
  FileText,
  ArrowRight,
  Users,
  Star,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { PortalDealPush, TeaserSection } from '@/types/portal';

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

interface CompanyDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  push: PortalDealPush;
  portalSlug: string;
}

export function CompanyDetailsModal({
  open,
  onOpenChange,
  push,
  portalSlug,
}: CompanyDetailsModalProps) {
  const snapshot = push.deal_snapshot;
  if (!snapshot) return null;

  const hasMemoHtml = !!snapshot.memo_html;
  const hasTeaserSections =
    snapshot.teaser_sections && snapshot.teaser_sections.length > 0;

  const metrics = [
    snapshot.industry && {
      icon: Building2,
      label: 'Industry',
      value: snapshot.industry,
    },
    snapshot.geography && {
      icon: MapPin,
      label: 'Location',
      value: snapshot.geography,
    },
    snapshot.revenue != null && {
      icon: DollarSign,
      label: 'Revenue',
      value: formatCurrency(snapshot.revenue),
    },
    snapshot.ebitda != null && {
      icon: DollarSign,
      label: 'EBITDA',
      value: formatCurrency(snapshot.ebitda),
    },
    snapshot.linkedin_employee_count != null && {
      icon: Users,
      label: 'Employees',
      value: snapshot.linkedin_employee_count.toLocaleString(),
    },
    snapshot.google_rating != null && snapshot.google_review_count != null && {
      icon: Star,
      label: 'Google Reviews',
      value: `${snapshot.google_rating.toFixed(1)} (${snapshot.google_review_count.toLocaleString()})`,
    },
  ].filter(Boolean) as { icon: typeof Building2; label: string; value: string }[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {snapshot.headline || 'Untitled Deal'}
          </DialogTitle>
        </DialogHeader>

        {/* Key Metrics */}
        {metrics.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {metrics.map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <m.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="font-medium text-sm">{m.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {snapshot.website && (
                <div className="mt-4 pt-3 border-t">
                  <a
                    href={
                      snapshot.website.startsWith('http')
                        ? snapshot.website
                        : `https://${snapshot.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    <Globe className="h-4 w-4" />
                    {snapshot.website
                      .replace(/^https?:\/\//, '')
                      .replace(/\/$/, '')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Executive Summary */}
        {snapshot.executive_summary && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Executive Summary
            </h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {snapshot.executive_summary}
            </p>
          </div>
        )}

        {/* Lead Memo */}
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold mb-3">
            <FileText className="h-4 w-4" />
            Lead Memo
          </h3>
          {hasMemoHtml ? (
            <div
              className="prose prose-sm max-w-none
                prose-headings:text-foreground prose-p:text-muted-foreground
                prose-strong:text-foreground prose-li:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(snapshot.memo_html!) }}
            />
          ) : hasTeaserSections ? (
            <div className="space-y-5">
              {snapshot.teaser_sections!.map((section: TeaserSection) => (
                <div key={section.key}>
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {section.title}
                  </h4>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          ) : snapshot.business_description ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {snapshot.business_description.replace(/<[^>]*>/g, '')}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No lead memo available yet.
            </p>
          )}
        </div>

        {/* View Full Deal link */}
        <div className="pt-2 border-t">
          <Link
            to={`/portal/${portalSlug}/deals/${push.id}`}
            onClick={() => onOpenChange(false)}
          >
            <Button variant="outline" className="w-full gap-2">
              View Full Deal Details
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
