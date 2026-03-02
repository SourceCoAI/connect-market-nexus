/**
 * Design System for Investment-Grade Listing Editor
 * Inspired by Linear, Stripe Dashboard, Apple Settings
 */

export const EDITOR_DESIGN = {
  // Layout & Spacing
  maxWidth: 'max-w-[1600px]',
  contentPadding: 'px-10 py-8',
  cardSpacing: 'gap-6',
  cardPadding: 'p-6',
  sectionSpacing: 'space-y-4',
  fieldSpacing: 'space-y-3',
  compactFieldSpacing: 'space-y-1.5',
  microFieldSpacing: 'space-y-1',

  // Typography
  microHeader: 'text-xs font-semibold uppercase tracking-wider text-foreground/80',
  microLabel: 'text-[11px] text-muted-foreground uppercase tracking-wide font-medium',
  fieldLabel: 'text-sm font-medium text-foreground',
  compactLabel: 'text-xs font-medium text-muted-foreground',
  helperText: 'text-xs text-muted-foreground',
  inputText: 'text-sm',
  compactInputText: 'text-xs',

  // Input Sizes
  largeHeight: 'h-11',
  standardHeight: 'h-10',
  compactHeight: 'h-9',
  miniHeight: 'h-8',
  microHeight: 'h-7',

  // Borders & Backgrounds
  cardBg: 'bg-white',
  cardBorder: 'border border-border',
  inputBg: 'bg-white',
  inputBorder: 'border border-border',
  dashedBorder: 'border-0 border-b border-dashed border-border/70',
  subtleDivider: 'border-t border-border/60',
  topBarBorder: 'border-b border-border',

  // Interactive States
  transition: 'transition-all duration-150 ease-in-out',
  hoverTransition: 'transition-colors duration-100',
  focusRing: 'focus:ring-2 focus:ring-primary/20 focus:border-primary',
  hoverBorder: 'hover:border-primary/40',

  // Component Variants
  toggleButton: 'px-2 py-0.5 rounded text-xs transition-all',
  toggleButtonActive: 'bg-foreground/10 font-medium text-foreground',
  toggleButtonInactive: 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',

  chipCheckbox: 'inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-white text-xs cursor-pointer hover:border-primary/40 transition-colors',

  // Aspect Ratios
  wideImageAspect: 'aspect-[21/9]',
  standardImageAspect: 'aspect-video',
} as const;
