-- ============================================================
-- Retroactively standardize task titles for consistency.
-- Patterns: "find buyer(s) for X" → "Find Buyers for X", etc.
-- ============================================================

-- 1. Standardize "find buyer" variants → "Find Buyers for ..."
UPDATE daily_standup_tasks
SET title = 'Find Buyers for ' || regexp_replace(
  title,
  '^(?:find|identify|source|look for|search for)\s+(?:a\s+)?buyers?\s+(?:for|of)\s+',
  '',
  'i'
)
WHERE title ~* '^(find|identify|source|look for|search for)\s+(a\s+)?buyers?\s+(for|of)\s+';

-- 2. Standardize "call/contact owner" → "Call Owner of ..."
UPDATE daily_standup_tasks
SET title = 'Call Owner of ' || regexp_replace(
  title,
  '^(?:call|contact|reach out to|phone)\s+(?:the\s+)?owner\s+(?:of|at|for)\s+',
  '',
  'i'
)
WHERE title ~* '^(call|contact|reach out to|phone)\s+(the\s+)?owner\s+(of|at|for)\s+';

-- 3. Standardize "follow up" → "Follow Up with/on ..."
UPDATE daily_standup_tasks
SET title = 'Follow Up ' || regexp_replace(
  title,
  '^follow[\s-]?up\s+',
  '',
  'i'
)
WHERE title ~* '^follow[\s-]?up\s+';

-- 4. Ensure first letter is always uppercase (catch-all for lowercase starts)
UPDATE daily_standup_tasks
SET title = upper(left(title, 1)) || right(title, -1)
WHERE left(title, 1) <> upper(left(title, 1));
