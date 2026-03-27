import { formatCurrency } from '@/lib/currency-utils';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import type { Listing } from '@/types';

interface ExecutiveSummaryGeneratorProps {
  listing: Listing;
}

export const ExecutiveSummaryGenerator = ({ listing }: ExecutiveSummaryGeneratorProps) => {
  const generatePDF = () => {
    // Create a new window with the executive summary content
    const summaryWindow = window.open('', '_blank', 'width=800,height=1200');

    if (!summaryWindow) {
      toast.error('Popup blocked — please allow popups for this site and try again.');
      return;
    }

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Executive Summary - ${listing.title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #ffffff;
              color: #1a1a1a;
              line-height: 1.4;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header { 
              border-bottom: 1px solid #e8e0d6;
              padding-bottom: 30px;
              margin-bottom: 40px;
            }
            .logo { 
              font-size: 14px;
              font-weight: 600;
              color: #d7b65c;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 20px;
            }
            .title { 
              font-size: 28px;
              font-weight: 300;
              color: #1a1a1a;
              margin-bottom: 8px;
              letter-spacing: -0.01em;
            }
            .subtitle { 
              font-size: 14px;
              color: #666;
              margin-bottom: 20px;
            }
            .section { 
              margin-bottom: 32px;
              border-bottom: 1px solid #f5f5f5;
              padding-bottom: 24px;
            }
            .section:last-child { border-bottom: none; margin-bottom: 0; }
            .section-title { 
              font-size: 11px;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              color: #888;
              margin-bottom: 12px;
            }
            .grid { 
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 16px;
            }
            .metric {
              padding: 16px 0;
            }
            .metric-label { 
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              color: #888;
              margin-bottom: 4px;
            }
            .metric-value { 
              font-size: 18px;
              font-weight: 300;
              color: #1a1a1a;
            }
            .description { 
              font-size: 14px;
              color: #444;
              line-height: 1.6;
              margin-bottom: 16px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e8e0d6;
              text-align: center;
              font-size: 12px;
              color: #888;
            }
            @media print {
              body { padding: 20px; }
              .header { page-break-after: avoid; }
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">SourceCo</div>
            <h1 class="title">${listing.title}</h1>
            <p class="subtitle">${listing.location} • ${listing.category}</p>
          </div>

          <div class="section">
            <div class="section-title">Business Overview</div>
            <div class="description">${listing.description || 'No description available'}</div>
          </div>

          <div class="section">
            <div class="section-title">Financial Highlights</div>
            <div class="grid">
              ${
                listing.revenue
                  ? `
                <div class="metric">
                  <div class="metric-label">Annual Revenue</div>
                  <div class="metric-value">${formatCurrency(listing.revenue)}</div>
                </div>
              `
                  : ''
              }
              ${
                listing.ebitda
                  ? `
                <div class="metric">
                  <div class="metric-label">EBITDA</div>
                  <div class="metric-value">${formatCurrency(listing.ebitda)}</div>
                </div>
              `
                  : ''
              }
              ${
                (listing as unknown as { asking_price?: number }).asking_price
                  ? `
                <div class="metric">
                  <div class="metric-label">Asking Price</div>
                  <div class="metric-value">${formatCurrency((listing as unknown as { asking_price?: number }).asking_price!)}</div>
                </div>
              `
                  : ''
              }
              ${
                listing.cash_flow
                  ? `
                <div class="metric">
                  <div class="metric-label">Cash Flow</div>
                  <div class="metric-value">${formatCurrency(listing.cash_flow)}</div>
                </div>
              `
                  : ''
              }
            </div>
          </div>

          ${
            listing.ownership_structure || listing.management_depth
              ? `
            <div class="section">
              <div class="section-title">Current Structure</div>
              ${
                listing.ownership_structure
                  ? `
                <div class="metric">
                  <div class="metric-label">Ownership Type</div>
                  <div class="metric-value">${listing.ownership_structure}</div>
                </div>
              `
                  : ''
              }
              ${
                listing.management_depth
                  ? `
                <div class="metric">
                  <div class="metric-label">Management Depth</div>
                  <div class="metric-value">${listing.management_depth}</div>
                </div>
              `
                  : ''
              }
            </div>
          `
              : ''
          }

          ${
            listing.seller_motivation || listing.timeline_preference
              ? `
            <div class="section">
              <div class="section-title">Transaction Preferences</div>
              ${
                listing.seller_motivation
                  ? `
                <div class="metric">
                  <div class="metric-label">Seller Motivation</div>
                  <div class="metric-value">${listing.seller_motivation}</div>
                </div>
              `
                  : ''
              }
              ${
                listing.timeline_preference
                  ? `
                <div class="metric">
                  <div class="metric-label">Timeline</div>
                  <div class="metric-value">${listing.timeline_preference}</div>
                </div>
              `
                  : ''
              }
            </div>
          `
              : ''
          }

          <div class="footer">
            <p>This executive summary is confidential and proprietary to SourceCo.</p>
            <p>Generated on ${new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}</p>
          </div>
        </body>
      </html>
    `;

    summaryWindow.document.write(content);
    summaryWindow.document.close();

    // Trigger print dialog after a short delay to ensure content is loaded
    setTimeout(() => {
      summaryWindow.print();
    }, 500);
  };

  return (
    <button
      onClick={generatePDF}
      className="group inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-900 transition-colors duration-200"
    >
      <FileDown className="h-3 w-3" />
      <span className="border-b border-slate-300 group-hover:border-slate-600 transition-colors duration-200">
        Download executive summary
      </span>
    </button>
  );
};
