/**
 * Investment-grade PDF template for lead memos.
 * Shared by MemosTab and MemosPanel exports.
 */

import { extractCompanyInfo, getBrandingLabel } from './memo-utils';

interface MemoSection {
  title: string;
  content: string;
  key?: string;
}

interface MemoPdfOptions {
  sections: MemoSection[];
  memoType: string;
  dealTitle: string;
  branding?: string;
  content?: Record<string, unknown>;
}

const LOGO_URL = '/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png';

function renderMarkdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

export function buildMemoPdfHtml(options: MemoPdfOptions): string {
  const { sections, memoType, dealTitle, branding, content } = options;
  const brandName = getBrandingLabel(branding || 'sourceco');
  const isAnonymous = memoType === 'anonymous_teaser';
  const company = content ? extractCompanyInfo(content) : null;
  const subtitle = isAnonymous ? 'Anonymous Teaser' : 'Lead Memo';

  const filteredSections = sections.filter(
    (s) => s.key !== 'header_block' && s.key !== 'contact_information'
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${subtitle} - ${dealTitle}</title>
<style>
  @page {
    margin: 1in 1in 0.75in 1in;
    size: letter;
  }
  @page {
    @top-left { content: ''; }
    @top-right { content: ''; }
    @top-center { content: ''; }
    @bottom-left { content: ''; }
    @bottom-right { content: ''; }
    @bottom-center { content: ''; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    line-height: 1.65;
    font-size: 10.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Letterhead */
  .letterhead {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 20px;
    margin-bottom: 28px;
    border-bottom: 1.5px solid #1a1a2e;
  }
  .letterhead img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
  .letterhead-name {
    font-size: 14pt;
    font-weight: 600;
    letter-spacing: 3px;
    color: #1a1a2e;
    text-transform: uppercase;
  }

  /* Title block */
  .title-block {
    margin-bottom: 32px;
  }
  .deal-title {
    font-size: 22pt;
    font-weight: 700;
    color: #1a1a2e;
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin: 0 0 6px 0;
  }
  .memo-subtitle {
    font-size: 10pt;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 2px;
    font-weight: 400;
  }
  .company-details {
    margin-top: 10px;
    font-size: 9.5pt;
    color: #666;
    line-height: 1.5;
  }

  /* Sections */
  .section {
    margin-bottom: 22px;
    page-break-inside: avoid;
  }
  .section h2 {
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #1a1a2e;
    margin: 0 0 10px 0;
    padding: 0;
    border: none;
  }
  .section-content {
    font-size: 10.5pt;
    color: #333;
    line-height: 1.65;
  }
  .section-content p { margin: 0 0 8px 0; }
  .section-content strong { font-weight: 600; color: #1a1a1a; }
  .section-content li {
    margin-bottom: 4px;
    margin-left: 16px;
    list-style: disc;
  }

  /* Tables */
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #e0e0e0; padding: 6px 10px; text-align: left; font-size: 9.5pt; }
  th { background: #f7f7f7; font-weight: 600; color: #1a1a2e; }

  /* Footer */
  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #e5e5e5;
    text-align: center;
    font-size: 8pt;
    color: #aaa;
    letter-spacing: 0.5px;
  }

  @media print {
    body { margin: 0; padding: 0; }
  }
</style>
</head>
<body>
  <div class="letterhead">
    <img src="${LOGO_URL}" alt="${brandName}" />
    <span class="letterhead-name">${brandName.toUpperCase()}</span>
  </div>

  <div class="title-block">
    <div class="deal-title">${dealTitle}</div>
    <div class="memo-subtitle">${subtitle}</div>
    ${company && !isAnonymous && (company.company_address || company.company_website || company.company_phone) ? `
    <div class="company-details">
      ${company.company_address ? `${company.company_address}<br>` : ''}
      ${company.company_website ? `${company.company_website}<br>` : ''}
      ${company.company_phone ? `${company.company_phone}` : ''}
    </div>` : ''}
  </div>

  ${filteredSections.map((s) => `
  <div class="section">
    <h2>${s.title}</h2>
    <div class="section-content">${renderMarkdownToHtml(s.content)}</div>
  </div>`).join('')}

  <div class="footer">Confidential</div>
</body>
</html>`;
}

export function openPrintWindow(html: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    setTimeout(() => printWindow.print(), 300);
  };
}
