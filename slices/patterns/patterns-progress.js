// Patterns drill progress — pure module, no React, no DOM beyond localStorage.
// Tracks how many times each pattern has been drilled to completion.
// Persistence: localStorage only, same key convention as the rest of the app
// (see chess_review_settings_v1 in slices/library/library.js).

const PROGRESS_KEY = 'chess_patterns_progress_v1';

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}

function persistProgress(progress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {}
}

// Returns the updated progress map and persists it.
function recordCompletion(progress, patternId) {
  const prior = progress[patternId];
  const next = {
    ...progress,
    [patternId]: {
      count: (prior?.count || 0) + 1,
      lastCompletedAt: new Date().toISOString(),
    },
  };
  persistProgress(next);
  return next;
}

window.PatternsProgress = { loadProgress, recordCompletion };
