import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface MentionNotesInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string, mentionedUserIds: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Keyboard shortcut hint displayed below the input. */
  disabled?: boolean;
}

/**
 * A textarea that detects @mentions and shows a dropdown of admin team members.
 * When the user types `@`, a filterable list appears. Selecting a member inserts
 * `@FirstName LastName` and tracks the user_id internally.
 */
export function MentionNotesInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Add a note... (use @ to mention)',
  className,
  disabled,
}: MentionNotesInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Track mentioned user IDs for the current note
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Fetch admin team members
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ['admin-team-members-for-mentions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('is_admin', true)
        .order('first_name');
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Filter members based on mention query
  const filteredMembers = teamMembers.filter((m) => {
    if (!mentionQuery) return true;
    const q = mentionQuery.toLowerCase();
    const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
    return (
      fullName.includes(q) ||
      m.first_name?.toLowerCase().includes(q) ||
      m.last_name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q)
    );
  });

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredMembers.length, mentionQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setMentionStart(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const computeDropdownPosition = useCallback(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();
    // Position dropdown below the textarea (simple approach)
    setDropdownPosition({
      top: rect.height + 4,
      left: 0,
    });
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      const cursorPos = e.target.selectionStart ?? 0;
      // Check if we're in a mention context
      const textBeforeCursor = newValue.slice(0, cursorPos);
      // Find the last @ that could be the start of a mention
      // It must be preceded by a space, newline, or be at position 0
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex >= 0) {
        const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
        const isValidStart = charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0;
        const queryText = textBeforeCursor.slice(lastAtIndex + 1);
        // Only show dropdown if there's no space after two words (allow "First Last" but close after that)
        const hasCompleted = /^\S+\s+\S+\s/.test(queryText);

        if (isValidStart && !hasCompleted) {
          setMentionStart(lastAtIndex);
          setMentionQuery(queryText);
          setShowDropdown(true);
          computeDropdownPosition();
          return;
        }
      }

      setShowDropdown(false);
      setMentionStart(null);
    },
    [onChange, computeDropdownPosition],
  );

  const insertMention = useCallback(
    (member: TeamMember) => {
      if (mentionStart === null || !textareaRef.current) return;

      const cursorPos = textareaRef.current.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursorPos);
      const mentionText = `@${member.first_name} ${member.last_name} `;
      const newValue = before + mentionText + after;

      onChange(newValue);
      setMentionedIds((prev) => new Set(prev).add(member.id));
      setShowDropdown(false);
      setMentionStart(null);
      setMentionQuery('');

      // Restore focus and cursor position
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = before.length + mentionText.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [mentionStart, value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown && filteredMembers.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredMembers.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          insertMention(filteredMembers[selectedIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowDropdown(false);
          setMentionStart(null);
          return;
        }
      }

      // Cmd/Ctrl+Enter to submit
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showDropdown, filteredMembers, selectedIndex, insertMention],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Parse mentioned IDs: keep only those whose @Name still appears in text
    const finalMentionedIds = Array.from(mentionedIds).filter((id) => {
      const member = teamMembers.find((m) => m.id === id);
      if (!member) return false;
      return trimmed.includes(`@${member.first_name} ${member.last_name}`);
    });

    onSubmit(trimmed, finalMentionedIds);
    setMentionedIds(new Set());
  }, [value, mentionedIds, teamMembers, onSubmit]);

  // Expose handleSubmit so parent can call it — we do it via the onSubmit callback pattern
  // The parent calls onSubmit which we trigger from within

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        placeholder={placeholder}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        className={cn('min-h-[80px] resize-y text-sm', className)}
        disabled={disabled}
      />

      {showDropdown && filteredMembers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
        >
          {filteredMembers.slice(0, 10).map((member, idx) => (
            <button
              key={member.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                idx === selectedIndex && 'bg-accent',
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                insertMention(member);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {member.first_name?.[0]}
                {member.last_name?.[0]}
              </div>
              <div className="flex flex-col">
                <span className="font-medium">
                  {member.first_name} {member.last_name}
                </span>
                <span className="text-xs text-muted-foreground">{member.email}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Parse @mentions from note text and return matching user IDs.
 * Useful as a standalone utility when you need to re-parse mentions
 * from saved text (e.g. when editing existing notes).
 */
export function parseMentionedUserIds(text: string, teamMembers: TeamMember[]): string[] {
  const ids: string[] = [];
  for (const member of teamMembers) {
    const mentionText = `@${member.first_name} ${member.last_name}`;
    if (text.includes(mentionText)) {
      ids.push(member.id);
    }
  }
  return ids;
}
