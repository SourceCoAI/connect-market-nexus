import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Type,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Highlighter,
  Strikethrough as StrikethroughIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Minus,
  Undo,
  Redo,
  Quote,
  ChevronDown,
  Maximize2,
  GripVertical,
} from 'lucide-react';
import { Button } from './button';
import { Separator } from './separator';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

interface SectionDefinition {
  key: string;
  title: string;
  placeholder: string;
  description: string;
}

const SECTIONS: SectionDefinition[] = [
  {
    key: 'business_overview',
    title: 'Business Overview',
    placeholder: 'Write a 2–3 sentence intro paragraph about the company…',
    description: 'High-level company introduction for buyers',
  },
  {
    key: 'deal_snapshot',
    title: 'Deal Snapshot',
    placeholder: 'Key metrics: Revenue, EBITDA, Margin, Locations, Region, Years in Operation, Transaction Type…',
    description: 'Key deal metrics in bullet-point format',
  },
  {
    key: 'key_facts',
    title: 'Key Facts',
    placeholder: 'Bullet list of operational highlights and key business facts…',
    description: 'Operational highlights and differentiators',
  },
  {
    key: 'growth_context',
    title: 'Growth Context',
    placeholder: 'Short bullet list of growth narrative points…',
    description: 'Market opportunity and growth drivers',
  },
  {
    key: 'owner_objectives',
    title: 'Owner Objectives',
    placeholder: 'Bullet list of seller goals, deal terms, and transition details…',
    description: 'Seller goals, terms, and transition plan',
  },
];

// ---------------------------------------------------------------------------
// Content parsing and compilation
// ---------------------------------------------------------------------------

/**
 * Attempt to match a title string to a known section key.
 * Uses fuzzy matching to handle variations from AI-generated titles.
 */
function matchSectionKey(title: string): string | null {
  const lower = title.toLowerCase().trim();

  const PATTERNS: Record<string, string[]> = {
    business_overview: ['business overview', 'overview', 'company overview', 'about the business', 'introduction'],
    deal_snapshot: ['deal snapshot', 'financial highlights', 'financial snapshot', 'financials', 'deal summary', 'key metrics'],
    key_facts: ['key facts', 'operational highlights', 'highlights', 'key details', 'facts', 'operations'],
    growth_context: ['growth context', 'growth opportunities', 'growth', 'market position', 'market opportunity', 'expansion'],
    owner_objectives: ['owner objectives', 'transaction overview', 'transaction context', 'seller objectives', 'owner goals', 'transition'],
  };

  for (const [key, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      if (lower === pattern || lower.includes(pattern) || pattern.includes(lower)) {
        return key;
      }
    }
  }
  return null;
}

/**
 * Parse combined HTML content into per-section HTML strings.
 * Splits on H2 headings and matches them to known sections.
 */
export function parseContentIntoSections(html: string): Record<string, string> {
  const result: Record<string, string> = {};

  if (!html || !html.trim()) return result;

  // Check if this is HTML or plain text
  const isHtml = /<[a-z][\s\S]*>/i.test(html);

  if (isHtml) {
    return parseHtmlSections(html);
  }
  return parsePlainTextSections(html);
}

function parseHtmlSections(html: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Split by H2 tags
  const h2Regex = /<h2[^>]*>(.*?)<\/h2>/gi;
  const parts: { title: string; content: string }[] = [];

  let lastIndex = 0;
  let match;
  const matches: { titleText: string; matchIndex: number; matchLength: number }[] = [];

  // First pass: collect all H2 positions
  while ((match = h2Regex.exec(html)) !== null) {
    matches.push({
      titleText: match[1].replace(/<[^>]+>/g, '').trim(),
      matchIndex: match.index,
      matchLength: match[0].length,
    });
  }

  if (matches.length === 0) {
    // No H2 headings - try H1 headings
    const h1Regex = /<h1[^>]*>(.*?)<\/h1>/gi;
    while ((match = h1Regex.exec(html)) !== null) {
      matches.push({
        titleText: match[1].replace(/<[^>]+>/g, '').trim(),
        matchIndex: match.index,
        matchLength: match[0].length,
      });
    }
  }

  if (matches.length === 0) {
    // No headings at all — put everything in business_overview
    result['business_overview'] = html;
    return result;
  }

  // Content before first heading
  if (matches[0].matchIndex > 0) {
    const preamble = html.substring(0, matches[0].matchIndex).trim();
    if (preamble) {
      parts.push({ title: '', content: preamble });
    }
  }

  // Extract each section
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const contentStart = m.matchIndex + m.matchLength;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].matchIndex : html.length;
    const content = html.substring(contentStart, contentEnd).trim();
    parts.push({ title: m.titleText, content });
  }

  // Map to section keys
  const usedKeys = new Set<string>();
  for (const part of parts) {
    if (!part.title) {
      if (!result['business_overview']) {
        result['business_overview'] = part.content;
        usedKeys.add('business_overview');
      }
      continue;
    }

    const key = matchSectionKey(part.title);
    if (key && !usedKeys.has(key)) {
      result[key] = part.content;
      usedKeys.add(key);
    } else {
      // Unknown section — append to the closest matching or last section
      const fallbackKey = SECTIONS.find((s) => !usedKeys.has(s.key))?.key;
      if (fallbackKey) {
        result[fallbackKey] = (result[fallbackKey] || '') + part.content;
        usedKeys.add(fallbackKey);
      }
    }
  }

  return result;
}

function parsePlainTextSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Strip HTML tags for matching
  const plain = text.replace(/<[^>]+>/g, '');

  // Try to find section boundaries by title
  const sectionBounds: { key: string; start: number }[] = [];

  for (const section of SECTIONS) {
    // Match section title at start of line (case-insensitive)
    const regex = new RegExp(`(?:^|\\n)\\s*${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, 'i');
    const match = regex.exec(plain);
    if (match) {
      sectionBounds.push({ key: section.key, start: match.index + match[0].length });
    }
  }

  // Also check for alternate titles
  const altTitles: Record<string, string[]> = {
    deal_snapshot: ['Financial Highlights', 'Deal Summary', 'Financial Snapshot'],
    key_facts: ['Operational Highlights', 'Key Details'],
    growth_context: ['Growth Opportunities', 'Market Position'],
    owner_objectives: ['Transaction Overview', 'Transaction Context', 'Seller Objectives'],
  };

  for (const [key, titles] of Object.entries(altTitles)) {
    if (sectionBounds.some((b) => b.key === key)) continue;
    for (const title of titles) {
      const regex = new RegExp(`(?:^|\\n)\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`, 'i');
      const match = regex.exec(plain);
      if (match) {
        sectionBounds.push({ key, start: match.index + match[0].length });
        break;
      }
    }
  }

  if (sectionBounds.length === 0) {
    // No recognizable sections — put everything in business_overview
    result['business_overview'] = wrapInHtml(plain);
    return result;
  }

  // Sort by position
  sectionBounds.sort((a, b) => a.start - b.start);

  // Extract content for each section
  for (let i = 0; i < sectionBounds.length; i++) {
    const bound = sectionBounds[i];
    const end = i + 1 < sectionBounds.length
      ? findTitleStart(plain, sectionBounds[i + 1].key)
      : plain.length;
    const content = plain.substring(bound.start, end).trim();
    if (content) {
      result[bound.key] = wrapInHtml(content);
    }
  }

  // Content before first section
  const firstStart = findTitleStart(plain, sectionBounds[0].key);
  if (firstStart > 0) {
    const preamble = plain.substring(0, firstStart).trim();
    if (preamble && !result['business_overview']) {
      result['business_overview'] = wrapInHtml(preamble);
    }
  }

  return result;
}

function findTitleStart(text: string, sectionKey: string): number {
  const section = SECTIONS.find((s) => s.key === sectionKey);
  if (!section) return -1;

  const allTitles = [section.title];
  const altTitles: Record<string, string[]> = {
    deal_snapshot: ['Financial Highlights', 'Deal Summary', 'Financial Snapshot'],
    key_facts: ['Operational Highlights', 'Key Details'],
    growth_context: ['Growth Opportunities', 'Market Position'],
    owner_objectives: ['Transaction Overview', 'Transaction Context', 'Seller Objectives'],
  };
  if (altTitles[sectionKey]) allTitles.push(...altTitles[sectionKey]);

  for (const title of allTitles) {
    const regex = new RegExp(`(?:^|\\n)\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    const match = regex.exec(text);
    if (match) return match.index;
  }
  return -1;
}

/** Convert plain text to simple HTML paragraphs */
function wrapInHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => {
      const trimmed = para.trim();
      if (!trimmed) return '';
      // Check if it looks like a bullet list
      const lines = trimmed.split('\n');
      const isBulletList = lines.every((l) => /^\s*[-•*]\s/.test(l));
      if (isBulletList) {
        const items = lines
          .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
          .filter(Boolean)
          .map((l) => `<li>${l}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean)
    .join('');
}

/**
 * Compile per-section HTML into a single combined HTML document.
 * Each section is wrapped with an H2 heading.
 */
export function compileSectionsToHtml(sectionContents: Record<string, string>): string {
  return SECTIONS
    .filter((s) => {
      const content = sectionContents[s.key];
      if (!content) return false;
      // Check if content has any meaningful text
      const text = content.replace(/<[^>]+>/g, '').trim();
      return text.length > 0;
    })
    .map((s) => `<h2>${s.title}</h2>${sectionContents[s.key]}`)
    .join('');
}

/**
 * Get total word and character counts from section contents.
 */
function getTotalCounts(sectionContents: Record<string, string>): { words: number; chars: number } {
  let totalText = '';
  for (const key of Object.keys(sectionContents)) {
    const text = (sectionContents[key] || '').replace(/<[^>]+>/g, '');
    totalText += text + ' ';
  }
  totalText = totalText.trim();
  const words = totalText.split(/\s+/).filter((w) => w.length > 0).length;
  const chars = totalText.length;
  return { words, chars };
}

function getSectionWordCount(html: string): number {
  const text = (html || '').replace(/<[^>]+>/g, '').trim();
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// TipTap extensions (shared, lighter set for section editors)
// ---------------------------------------------------------------------------

const SECTION_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-sourceco-accent underline cursor-pointer',
    },
  }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  Color,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

// ---------------------------------------------------------------------------
// SectionBlock — individual section with its own TipTap editor
// ---------------------------------------------------------------------------

interface SectionBlockProps {
  section: SectionDefinition;
  initialContent: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onContentChange: (html: string) => void;
  onEditorFocus: (editor: Editor) => void;
  contentVersion: number;
}

function SectionBlock({
  section,
  initialContent,
  isCollapsed,
  onToggleCollapse,
  onContentChange,
  onEditorFocus,
  contentVersion,
}: SectionBlockProps) {
  const wordCount = getSectionWordCount(initialContent);
  const isChangingFromParent = useRef(false);

  const editor = useEditor({
    extensions: SECTION_EXTENSIONS,
    content: initialContent || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] px-4 py-3',
        'data-placeholder': section.placeholder,
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isChangingFromParent.current) return;
      onContentChange(ed.getHTML());
    },
    onFocus: ({ editor: ed }) => {
      onEditorFocus(ed);
    },
  });

  // Sync editor content when contentVersion changes (external update like AI)
  const prevVersion = useRef(contentVersion);
  useEffect(() => {
    if (editor && contentVersion !== prevVersion.current) {
      prevVersion.current = contentVersion;
      const currentHtml = editor.getHTML();
      if (currentHtml !== initialContent) {
        isChangingFromParent.current = true;
        editor.commands.setContent(initialContent || '');
        isChangingFromParent.current = false;
      }
    }
  }, [contentVersion, initialContent, editor]);

  const liveWordCount = editor
    ? editor.getText().split(/\s+/).filter((w) => w.length > 0).length
    : wordCount;

  return (
    <div className="border border-border rounded-lg bg-white overflow-hidden">
      {/* Section Header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground/60 transition-transform shrink-0',
            isCollapsed && '-rotate-90',
          )}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">{section.title}</span>
          <span className="ml-2 text-[11px] text-muted-foreground font-normal">
            {section.description}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {liveWordCount} {liveWordCount === 1 ? 'word' : 'words'}
        </span>
      </button>

      {/* Section Editor */}
      {!isCollapsed && (
        <div className="relative">
          {editor && editor.isEmpty && (
            <div className="absolute top-0 left-0 right-0 px-4 py-3 pointer-events-none text-sm text-muted-foreground/50 italic">
              {section.placeholder}
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared Toolbar
// ---------------------------------------------------------------------------

function SharedToolbar({ editor, isFullscreen, onToggleFullscreen }: {
  editor: Editor | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const ToolbarButton = ({
    onClick,
    active,
    children,
    title,
    disabled,
  }: {
    onClick: () => void;
    active?: boolean;
    children: ReactNode;
    title: string;
    disabled?: boolean;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled || !editor}
      className={cn(
        'h-8 w-8 p-0 hover:bg-sourceco-muted/50',
        active && 'bg-sourceco-muted text-sourceco-accent',
      )}
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {/* Headings */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor?.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor?.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setParagraph().run()}
        active={editor?.isActive('paragraph')}
        title="Paragraph"
      >
        <Type className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        active={editor?.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        active={editor?.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        active={editor?.isActive('underline')}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        active={editor?.isActive('strike')}
        title="Strikethrough"
      >
        <StrikethroughIcon className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        active={editor?.isActive('bulletList')}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        active={editor?.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        active={editor?.isActive('blockquote')}
        title="Quote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Links & highlight */}
      <ToolbarButton onClick={setLink} active={editor?.isActive('link')} title="Insert Link">
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().toggleHighlight().run()}
        active={editor?.isActive('highlight')}
        title="Highlight"
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('left').run()}
        active={editor?.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('center').run()}
        active={editor?.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('right').run()}
        active={editor?.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
        active={editor?.isActive({ textAlign: 'justify' })}
        title="Align Justify"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Insert */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* History */}
      <ToolbarButton
        onClick={() => editor?.chain().focus().undo().run()}
        disabled={!editor?.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor?.chain().focus().redo().run()}
        disabled={!editor?.can().redo()}
        title="Redo (Ctrl+Y)"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <ToolbarButton
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      >
        <Maximize2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface SectionedDescriptionEditorProps {
  content: string;
  onChange: (html: string, json: Record<string, unknown>) => void;
}

export function SectionedDescriptionEditor({ content, onChange }: SectionedDescriptionEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [contentVersion, setContentVersion] = useState(0);

  // Track section contents in a ref to avoid stale closures
  const sectionContentsRef = useRef<Record<string, string>>({});
  const lastCompiledHtml = useRef<string>('');
  const isInitialized = useRef(false);

  // Parse initial content
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      const parsed = parseContentIntoSections(content);
      sectionContentsRef.current = parsed;
      lastCompiledHtml.current = content;
    }
  }, [content]);

  // Handle external content changes (e.g., AI generation)
  useEffect(() => {
    if (!isInitialized.current) return;
    // Skip if this is our own compiled output
    if (content === lastCompiledHtml.current) return;

    const parsed = parseContentIntoSections(content);
    sectionContentsRef.current = parsed;
    lastCompiledHtml.current = content;
    setContentVersion((v) => v + 1);
  }, [content]);

  const handleSectionChange = useCallback(
    (key: string, html: string) => {
      sectionContentsRef.current = { ...sectionContentsRef.current, [key]: html };
      const compiled = compileSectionsToHtml(sectionContentsRef.current);
      lastCompiledHtml.current = compiled;
      onChange(compiled, {});
    },
    [onChange],
  );

  const handleToggleCollapse = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleEditorFocus = useCallback((editor: Editor) => {
    setActiveEditor(editor);
  }, []);

  const { words, chars } = getTotalCounts(sectionContentsRef.current);

  // Initial parsed contents for section blocks
  const initialParsed = useRef(parseContentIntoSections(content));
  // Update when contentVersion changes
  if (contentVersion > 0) {
    initialParsed.current = sectionContentsRef.current;
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background overflow-hidden transition-all',
        isFullscreen && 'fixed inset-4 z-50 shadow-2xl',
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 flex-wrap gap-2">
        <SharedToolbar
          editor={activeEditor}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
        <div className="text-xs text-muted-foreground">
          {words} words · {chars} characters
        </div>
      </div>

      {/* Sections */}
      <div
        className={cn(
          'overflow-y-auto space-y-0',
          isFullscreen ? 'h-[calc(100vh-8rem)]' : 'max-h-[700px]',
        )}
      >
        <div className="p-4 space-y-3">
          {SECTIONS.map((section) => (
            <SectionBlock
              key={section.key}
              section={section}
              initialContent={initialParsed.current[section.key] || ''}
              isCollapsed={collapsedSections.has(section.key)}
              onToggleCollapse={() => handleToggleCollapse(section.key)}
              onContentChange={(html) => handleSectionChange(section.key, html)}
              onEditorFocus={handleEditorFocus}
              contentVersion={contentVersion}
            />
          ))}
        </div>
      </div>

      {/* Guidelines */}
      <div className="px-6 py-4 border-t border-border bg-muted/20">
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground hover:text-sourceco-accent transition-colors">
            Formatting &amp; Writing Guidelines
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <p className="font-medium text-foreground mb-1">Section Guide:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  <strong>Business Overview</strong> — 2–3 sentence company intro (industry, location,
                  scale)
                </li>
                <li>
                  <strong>Deal Snapshot</strong> — Key metrics as bullet points (Revenue, EBITDA,
                  Margin, Locations)
                </li>
                <li>
                  <strong>Key Facts</strong> — Operational highlights that differentiate the business
                </li>
                <li>
                  <strong>Growth Context</strong> — Market opportunity and expansion levers
                </li>
                <li>
                  <strong>Owner Objectives</strong> — Seller goals, preferred deal structure, and
                  transition plan
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Formatting Tips:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  Use <strong>bullet points</strong> for metrics, lists, and key data points
                </li>
                <li>
                  Use <strong>bold</strong> for important numbers, percentages, and key terms
                </li>
                <li>Keep sentences short and direct — write for busy buyers scanning quickly</li>
                <li>Maintain professional, investment-grade tone throughout</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
