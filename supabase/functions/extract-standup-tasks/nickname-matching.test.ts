/**
 * Tests for the nickname matching logic in extract-standup-tasks.
 *
 * This verifies the fix for the "assignee matching fragility" bug where
 * Fireflies speaker names like "Bill" wouldn't match team members named
 * "William" in the profiles table, causing tasks to become unassigned.
 *
 * The real function lives in supabase/functions/extract-standup-tasks/index.ts
 * and runs in Deno. We inline a copy here so we can test it under Vitest/Node.
 */
import { describe, it, expect } from 'vitest';

// ── Inline copies of the nickname matching logic ──

const NICKNAME_MAP: Record<string, string[]> = {
  william: ['bill', 'billy', 'will', 'willy'],
  robert: ['bob', 'bobby', 'rob', 'robby'],
  richard: ['rick', 'ricky', 'dick', 'rich'],
  michael: ['mike', 'mikey', 'mick'],
  james: ['jim', 'jimmy', 'jamie'],
  john: ['johnny', 'jack', 'jon'],
  charles: ['charlie', 'chuck', 'chaz'],
  thomas: ['tom', 'tommy'],
  christopher: ['chris', 'topher'],
  daniel: ['dan', 'danny'],
  joseph: ['joe', 'joey'],
  anthony: ['tony'],
  matthew: ['matt', 'matty'],
  andrew: ['andy', 'drew'],
  david: ['dave', 'davey'],
  edward: ['ed', 'eddie', 'ted', 'ned'],
  nicholas: ['nick', 'nicky'],
  benjamin: ['ben', 'benny'],
  samuel: ['sam', 'sammy'],
  alexander: ['alex', 'al', 'xander'],
  jonathan: ['jon', 'john'],
  kenneth: ['ken', 'kenny'],
  gerald: ['jerry'],
  timothy: ['tim', 'timmy'],
  frederick: ['fred', 'freddy'],
  lawrence: ['larry'],
  patrick: ['pat', 'paddy'],
  elizabeth: ['liz', 'beth', 'betsy', 'eliza', 'lizzy'],
  katherine: ['kate', 'katie', 'kathy', 'kat'],
  margaret: ['maggie', 'meg', 'peggy'],
  jennifer: ['jen', 'jenny'],
  jessica: ['jess', 'jessie'],
  rebecca: ['becky', 'becca'],
  stephanie: ['steph', 'steff'],
  christina: ['chris', 'tina', 'christy'],
  victoria: ['vicky', 'tori'],
  alexandra: ['alex', 'sandra', 'lexi'],
  samantha: ['sam', 'sammy'],
  deborah: ['deb', 'debbie'],
  patricia: ['pat', 'patty', 'tricia'],
  barbara: ['barb', 'barbie'],
  susan: ['sue', 'susie'],
  nathaniel: ['nate', 'nat'],
  theodore: ['ted', 'teddy'],
};

function buildNicknameReverseMap(): Map<string, string[]> {
  const reverse = new Map<string, string[]>();
  for (const [formal, nicknames] of Object.entries(NICKNAME_MAP)) {
    for (const nick of nicknames) {
      if (!reverse.has(nick)) reverse.set(nick, []);
      reverse.get(nick)!.push(formal);
    }
    if (!reverse.has(formal)) reverse.set(formal, []);
    reverse.get(formal)!.push(formal);
  }
  return reverse;
}

const _nicknameReverseMap = buildNicknameReverseMap();

interface TeamMember {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  aliases: string[];
}

function matchAssignee(name: string, teamMembers: TeamMember[]): string | null {
  if (!name || name === 'Unassigned') return null;

  let lower = name.toLowerCase().trim();
  lower = lower.replace(/^(speaker\s*\d+\s*[-–—:]\s*)/i, '');
  lower = lower.replace(/^(host\s*[-–—:]\s*)/i, '');
  lower = lower.trim();

  if (!lower) return null;

  // Pass 1: exact match
  for (const m of teamMembers) {
    if (m.name.toLowerCase() === lower) return m.id;
    if (m.first_name.toLowerCase() === lower) return m.id;
    if (m.last_name.toLowerCase() === lower) return m.id;
  }

  // Pass 2: alias match
  for (const m of teamMembers) {
    for (const alias of m.aliases) {
      if (alias.toLowerCase() === lower) return m.id;
    }
  }

  // Pass 3: "FirstName L." pattern
  const dotAbbrev = lower.match(/^(\w+)\s+(\w)\.\s*$/);
  if (dotAbbrev) {
    const [, first, lastInitial] = dotAbbrev;
    for (const m of teamMembers) {
      if (
        m.first_name.toLowerCase() === first &&
        m.last_name.toLowerCase().startsWith(lastInitial)
      ) {
        return m.id;
      }
    }
  }

  // Pass 4: first-name-in-full-speaker-name
  for (const m of teamMembers) {
    if (m.first_name.length >= 2) {
      const firstLower = m.first_name.toLowerCase();
      if (lower === firstLower || lower.startsWith(firstLower + ' ')) {
        return m.id;
      }
    }
  }

  // Pass 5: nickname matching
  const firstWord = lower.split(/\s+/)[0];
  const formalNames = _nicknameReverseMap.get(firstWord);
  if (formalNames && formalNames.length > 0) {
    for (const formal of formalNames) {
      for (const m of teamMembers) {
        if (m.first_name.toLowerCase() === formal) {
          return m.id;
        }
      }
    }
  }

  // Pass 6: reverse nickname lookup
  const possibleNicknames = NICKNAME_MAP[firstWord];
  if (possibleNicknames) {
    for (const nick of possibleNicknames) {
      for (const m of teamMembers) {
        if (m.first_name.toLowerCase() === nick) {
          return m.id;
        }
      }
    }
  }

  return null;
}

// ── Test fixtures ──

function makeTeam(): TeamMember[] {
  return [
    {
      id: 'william-id',
      name: 'William Smith',
      first_name: 'William',
      last_name: 'Smith',
      aliases: [],
    },
    {
      id: 'elizabeth-id',
      name: 'Elizabeth Jones',
      first_name: 'Elizabeth',
      last_name: 'Jones',
      aliases: [],
    },
    {
      id: 'michael-id',
      name: 'Michael Brown',
      first_name: 'Michael',
      last_name: 'Brown',
      aliases: [],
    },
    {
      id: 'bill-id', // A person whose actual first name is "Bill"
      name: 'Bill Wilson',
      first_name: 'Bill',
      last_name: 'Wilson',
      aliases: [],
    },
    {
      id: 'alex-id',
      name: 'Alex Johnson',
      first_name: 'Alex',
      last_name: 'Johnson',
      aliases: ['alexander'],
    },
    {
      id: 'oz-id',
      name: 'Oz De La Luna',
      first_name: 'Oz',
      last_name: 'De La Luna',
      aliases: [],
    },
  ];
}

describe('matchAssignee', () => {
  describe('exact matching (Pass 1)', () => {
    it('matches by full name', () => {
      expect(matchAssignee('William Smith', makeTeam())).toBe('william-id');
    });

    it('matches by first name', () => {
      expect(matchAssignee('William', makeTeam())).toBe('william-id');
    });

    it('matches by last name', () => {
      expect(matchAssignee('Smith', makeTeam())).toBe('william-id');
    });

    it('is case insensitive', () => {
      expect(matchAssignee('WILLIAM', makeTeam())).toBe('william-id');
      expect(matchAssignee('william smith', makeTeam())).toBe('william-id');
    });
  });

  describe('speaker prefix stripping', () => {
    it('strips "Speaker 1 - " prefix', () => {
      expect(matchAssignee('Speaker 1 - William', makeTeam())).toBe('william-id');
    });

    it('strips "Host - " prefix', () => {
      expect(matchAssignee('Host - Michael Brown', makeTeam())).toBe('michael-id');
    });
  });

  describe('alias matching (Pass 2)', () => {
    it('matches via alias array', () => {
      expect(matchAssignee('alexander', makeTeam())).toBe('alex-id');
    });
  });

  describe('dot-abbreviation matching (Pass 3)', () => {
    it('matches "FirstName L." format', () => {
      expect(matchAssignee('William S.', makeTeam())).toBe('william-id');
    });
  });

  describe('first-name-prefix matching (Pass 4)', () => {
    it('matches when speaker name is just the first name', () => {
      expect(matchAssignee('Oz', makeTeam())).toBe('oz-id');
    });

    it('matches when speaker name starts with the first name', () => {
      expect(matchAssignee('Oz De La Luna', makeTeam())).toBe('oz-id');
    });
  });

  describe('nickname matching (Pass 5)', () => {
    it('matches "Bill" to "William"', () => {
      // Remove the "Bill Wilson" entry from the team so we can test pure nickname lookup
      const team = makeTeam().filter((m) => m.id !== 'bill-id');
      expect(matchAssignee('Bill', team)).toBe('william-id');
    });

    it('matches "Liz" to "Elizabeth"', () => {
      expect(matchAssignee('Liz', makeTeam())).toBe('elizabeth-id');
    });

    it('matches "Mike" to "Michael"', () => {
      expect(matchAssignee('Mike', makeTeam())).toBe('michael-id');
    });

    it('matches "Beth" to "Elizabeth"', () => {
      expect(matchAssignee('Beth', makeTeam())).toBe('elizabeth-id');
    });

    it('prefers exact match over nickname match', () => {
      // Both "Bill" (exact first_name) and nickname-for-William exist.
      // Pass 1 should win and return bill-id.
      expect(matchAssignee('Bill', makeTeam())).toBe('bill-id');
    });
  });

  describe('reverse nickname matching (Pass 6)', () => {
    it('matches "William" to team member with first_name "Bill"', () => {
      const team: TeamMember[] = [
        {
          id: 'bill-id',
          name: 'Bill Wilson',
          first_name: 'Bill',
          last_name: 'Wilson',
          aliases: [],
        },
      ];
      expect(matchAssignee('William', team)).toBe('bill-id');
    });
  });

  describe('no match', () => {
    it('returns null for unknown names', () => {
      expect(matchAssignee('Xerxes', makeTeam())).toBe(null);
    });

    it('returns null for empty string', () => {
      expect(matchAssignee('', makeTeam())).toBe(null);
    });

    it('returns null for "Unassigned"', () => {
      expect(matchAssignee('Unassigned', makeTeam())).toBe(null);
    });

    it('returns null when team is empty', () => {
      expect(matchAssignee('William', [])).toBe(null);
    });
  });
});
