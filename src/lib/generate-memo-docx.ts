/**
 * Generate a .docx file from AI-generated memo sections.
 *
 * Uses the `docx` npm package for client-side Word document generation.
 * The output is a properly formatted .docx that opens in Microsoft Word
 * or Google Docs for editing before final PDF conversion.
 */

// Lazy-load docx (~300KB) and file-saver — only downloaded when user generates a memo
async function getDocx() {
  const docx = await import('docx');
  return docx;
}
async function getFileSaver() {
  const { saveAs } = await import('file-saver');
  return saveAs;
}

type DocxModule = Awaited<ReturnType<typeof getDocx>>;

interface MemoSection {
  key: string;
  title: string;
  content: string;
}

interface CompanyInfo {
  company_name?: string;
  company_address?: string;
  company_website?: string;
  company_phone?: string;
}

interface GenerateMemoDocxParams {
  sections: MemoSection[];
  memoType: 'anonymous_teaser' | 'full_memo';
  dealTitle: string;
  branding: string;
  companyInfo?: CompanyInfo;
}

/**
 * Convert memo sections into a downloadable .docx file.
 */
export async function generateMemoDocx({
  sections,
  memoType,
  dealTitle,
  branding,
  companyInfo,
}: GenerateMemoDocxParams): Promise<void> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ImageRun,
    HeadingLevel,
    AlignmentType,
    BorderStyle,
  } = await getDocx();
  const saveAs = await getFileSaver();

  const isAnonymous = memoType === 'anonymous_teaser';
  const memoLabel = isAnonymous ? 'Anonymous Teaser' : 'Confidential Lead Memo';
  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build document children
  const children: InstanceType<typeof Paragraph>[] = [];

  // ─── Letterhead with Logo ───
  // Try to fetch the SourceCo logo for embedding
  let logoImageRun: InstanceType<typeof ImageRun> | null = null;
  try {
    const logoResponse = await fetch('/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png');
    if (logoResponse.ok) {
      const logoBuffer = await logoResponse.arrayBuffer();
      logoImageRun = new ImageRun({
        data: new Uint8Array(logoBuffer),
        type: 'png',
        transformation: { width: 50, height: 50 },
      } as any);
    }
  } catch {
    // Logo fetch failed — continue without it
  }

  // Letterhead line with logo + brand name
  const letterheadRuns: (InstanceType<typeof TextRun> | InstanceType<typeof ImageRun>)[] = [];
  if (logoImageRun) {
    letterheadRuns.push(logoImageRun);
    letterheadRuns.push(new TextRun({ text: '  ', size: 28, font: 'Arial' }));
  }
  letterheadRuns.push(
    new TextRun({
      text: branding.toUpperCase(),
      bold: true,
      size: 36,
      font: 'Arial',
      color: '1A1A2E',
      characterSpacing: 80,
    }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 100 },
      border: {
        bottom: { style: BorderStyle.THICK_THIN_SMALL_GAP, size: 3, color: '1A1A2E' },
      },
      children: letterheadRuns,
    }),
  );

  // ─── Company Info Block ───
  // For anonymous teasers, only show the project codename (no address, website, phone)
  if (isAnonymous) {
    if (companyInfo?.company_name) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 40 },
          children: [
            new TextRun({
              text: companyInfo.company_name,
              bold: true,
              size: 26,
              font: 'Arial',
              color: '1A1A2E',
            }),
          ],
        }),
      );
    }
  } else if (
    companyInfo?.company_name ||
    companyInfo?.company_address ||
    companyInfo?.company_website
  ) {
    if (companyInfo.company_name) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 40 },
          children: [
            new TextRun({
              text: companyInfo.company_name,
              bold: true,
              size: 26,
              font: 'Arial',
              color: '1A1A2E',
            }),
          ],
        }),
      );
    }
    const detailLines = [
      companyInfo.company_address,
      companyInfo.company_website,
      companyInfo.company_phone,
    ].filter(Boolean);
    for (const line of detailLines) {
      children.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({
              text: line!,
              size: 20,
              font: 'Arial',
              color: '555555',
            }),
          ],
        }),
      );
    }
  }

  // ─── Memo Type & Date ───
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 50 },
      children: [
        new TextRun({
          text: memoLabel.toUpperCase(),
          size: 18,
          font: 'Arial',
          color: '888888',
          characterSpacing: 100,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: dateStr,
          size: 18,
          font: 'Arial',
          color: '888888',
        }),
      ],
    }),
    // Confidential disclaimer
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      },
      children: [
        new TextRun({
          text: 'CONFIDENTIAL — FOR INTENDED RECIPIENT ONLY',
          size: 16,
          font: 'Arial',
          color: 'CC0000',
          italics: true,
        }),
      ],
    }),
  );

  // ─── Memo Sections (skip header_block and contact_information) ───
  const filteredSections = sections.filter(
    (s) => s.key !== 'header_block' && s.key !== 'contact_information',
  );
  for (const section of filteredSections) {
    // Section heading
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
        },
        children: [
          new TextRun({
            text: section.title,
            bold: true,
            size: 24,
            font: 'Arial',
            color: '1A1A2E',
          }),
        ],
      }),
    );

    // Section content — parse markdown-like formatting
    const contentParagraphs = parseContentToParagraphs(section.content, { Paragraph, TextRun });
    children.push(...contentParagraphs);
  }

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  const fileName = isAnonymous
    ? `Anonymous_Teaser_${sanitizeFileName(dealTitle)}.docx`
    : `Lead_Memo_${sanitizeFileName(dealTitle)}.docx`;
  saveAs(blob, fileName);
}

// ─── Content Parsing Helpers ───

function parseContentToParagraphs(
  content: string,
  docx: Pick<DocxModule, 'Paragraph' | 'TextRun'>,
) {
  const { Paragraph, TextRun } = docx;
  if (!content) return [] as InstanceType<typeof Paragraph>[];

  const paragraphs: InstanceType<typeof Paragraph>[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 50 },
          children: parseInlineFormatting(trimmed.slice(2), TextRun),
        }),
      );
      continue;
    }

    // Table rows (basic markdown table support)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Skip separator rows
      if (trimmed.match(/^\|[\s\-|]+\|$/)) continue;
      // Parse as a regular paragraph for now (tables in docx are complex)
      const cells = trimmed.split('|').filter((c) => c.trim());
      paragraphs.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [
            new TextRun({
              text: cells.join('  |  '),
              size: 20,
              font: 'Arial',
            }),
          ],
        }),
      );
      continue;
    }

    // Regular paragraph
    paragraphs.push(
      new Paragraph({
        spacing: { after: 120 },
        children: parseInlineFormatting(trimmed, TextRun),
      }),
    );
  }

  return paragraphs;
}

function parseInlineFormatting(text: string, TextRun: DocxModule['TextRun']) {
  const runs: InstanceType<typeof TextRun>[] = [];
  // Simple bold/italic parser
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // Bold text
      runs.push(
        new TextRun({
          text: match[2],
          bold: true,
          size: 20,
          font: 'Arial',
        }),
      );
    } else if (match[3]) {
      // Italic text
      runs.push(
        new TextRun({
          text: match[3],
          italics: true,
          size: 20,
          font: 'Arial',
        }),
      );
    } else if (match[4]) {
      // Regular text
      runs.push(
        new TextRun({
          text: match[4],
          size: 20,
          font: 'Arial',
        }),
      );
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 20, font: 'Arial' }));
  }

  return runs;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}
