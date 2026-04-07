/**
 * Generate a .docx file from AI-generated memo sections.
 *
 * Investment-grade formatting: clean letterhead, no date, no disclaimers,
 * subtle "Confidential" footer. Matches the PDF template style.
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
    AlignmentType,
    BorderStyle,
    Footer,
  } = await getDocx();
  const saveAs = await getFileSaver();

  const isAnonymous = memoType === 'anonymous_teaser';
  const subtitle = isAnonymous ? 'Anonymous Teaser' : 'Lead Memo';

  // Build document children
  const children: InstanceType<typeof Paragraph>[] = [];

  // ─── Letterhead with Logo ───
  let logoImageRun: InstanceType<typeof ImageRun> | null = null;
  try {
    const logoResponse = await fetch('/lovable-uploads/b879fa06-6a99-4263-b973-b9ced4404acb.png');
    if (logoResponse.ok) {
      const logoBuffer = await logoResponse.arrayBuffer();
      logoImageRun = new ImageRun({
        data: new Uint8Array(logoBuffer),
        type: 'png',
        transformation: { width: 32, height: 32 },
      } as any);
    }
  } catch {
    // Logo fetch failed — continue without it
  }

  const letterheadRuns: (InstanceType<typeof TextRun> | InstanceType<typeof ImageRun>)[] = [];
  if (logoImageRun) {
    letterheadRuns.push(logoImageRun);
    letterheadRuns.push(new TextRun({ text: '  ', size: 28, font: 'Helvetica' }));
  }
  letterheadRuns.push(
    new TextRun({
      text: branding.toUpperCase(),
      bold: true,
      size: 28,
      font: 'Helvetica',
      color: '1A1A2E',
      characterSpacing: 120,
    }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 200 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 3, color: '1A1A2E', space: 8 },
      },
      children: letterheadRuns,
    }),
  );

  // ─── Title Block ───
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 60 },
      children: [
        new TextRun({
          text: dealTitle,
          bold: true,
          size: 44,
          font: 'Helvetica',
          color: '1A1A2E',
        }),
      ],
    }),
  );

  // Subtitle
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: subtitle.toUpperCase(),
          size: 18,
          font: 'Helvetica',
          color: '888888',
          characterSpacing: 80,
        }),
      ],
    }),
  );

  // Company details (non-anonymous only)
  if (!isAnonymous && companyInfo) {
    const detailLines = [
      companyInfo.company_address,
      companyInfo.company_website,
      companyInfo.company_phone,
    ].filter(Boolean);
    if (detailLines.length > 0) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 200 },
          children: detailLines.map((line, i) =>
            new TextRun({
              text: i < detailLines.length - 1 ? `${line}  |  ` : line!,
              size: 18,
              font: 'Helvetica',
              color: '666666',
            }),
          ),
        }),
      );
    } else {
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }
  } else {
    children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
  }

  // ─── Memo Sections ───
  const filteredSections = sections.filter(
    (s) => s.key !== 'header_block' && s.key !== 'contact_information',
  );
  for (const section of filteredSections) {
    // Section heading — uppercase, letterspaced, no border
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 120 },
        children: [
          new TextRun({
            text: section.title.toUpperCase(),
            bold: true,
            size: 18,
            font: 'Helvetica',
            color: '1A1A2E',
            characterSpacing: 60,
          }),
        ],
      }),
    );

    // Section content
    const contentParagraphs = parseContentToParagraphs(section.content, { Paragraph, TextRun });
    children.push(...contentParagraphs);
  }

  // Create document with footer
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Helvetica', size: 21 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1080, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 100 },
                border: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E5E5', space: 6 },
                },
                children: [
                  new TextRun({
                    text: 'Confidential',
                    size: 16,
                    font: 'Helvetica',
                    color: 'AAAAAA',
                  }),
                ],
              }),
            ],
          }),
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
    if (!trimmed) continue;

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

    // Table rows
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (trimmed.match(/^\|[\s\-|]+\|$/)) continue;
      const cells = trimmed.split('|').filter((c) => c.trim());
      paragraphs.push(
        new Paragraph({
          spacing: { after: 50 },
          children: [
            new TextRun({
              text: cells.join('  |  '),
              size: 20,
              font: 'Helvetica',
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
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, size: 21, font: 'Helvetica' }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true, size: 21, font: 'Helvetica' }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], size: 21, font: 'Helvetica' }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 21, font: 'Helvetica' }));
  }

  return runs;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}
