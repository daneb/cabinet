// Ollama coach notes — turns the deterministic Insights aggregate into a
// short narrative. Pure module (fetch only, no React, no DOM).
//
// Hard rule: the model receives ONLY precomputed statistics — never FENs,
// move lists, or positions. LLMs are unreliable at chess analysis; their job
// here is strictly to verbalize numbers the engine already produced.
//
// Availability is probed against /api/tags with a short timeout so the UI can
// hide the button when Ollama isn't running. If the browser blocks the
// request (CORS), the remedy is:  OLLAMA_ORIGINS="http://localhost:*" ollama serve

const PROBE_TIMEOUT_MS = 1500;
const GENERATE_TIMEOUT_MS = 120000;

const SYSTEM_PROMPT = [
  'You are a chess coach reviewing a student\'s engine-analyzed game statistics.',
  'Interpret ONLY the numbers you are given. Never invent moves, lines, openings, or positions.',
  'If a sample size is small, say so instead of drawing a conclusion.',
  'Error rates are mistakes+blunders per 100 moves; ACPL is average centipawn loss; lower is better for both.',
].join(' ');

// Strip the aggregate down to what the model needs — compact and positional-
// data-free by construction.
function statsForPrompt(agg) {
  const cell = c => c && c.moves > 0
    ? { moves: c.moves, errorsPer100: round1(c.errorRate), acpl: round1(c.acpl), lowSample: c.lowSample }
    : { moves: 0 };
  return {
    games: agg.games,
    userMoves: agg.moves,
    overall: cell(agg.overall),
    byPhase: mapValues(agg.byPhase, cell),
    bySituation: mapValues(agg.bySituation, cell),
    motifCounts: agg.motifs,
    conversion: agg.conversion,
    defence: agg.defence,
    topOpenings: agg.openings.slice(0, 5).map(o => ({
      opening: o.label, games: o.games,
      scorePct: round1(o.scorePct), avgAccuracy: round1(o.avgAccuracy),
      lowSample: o.lowSample,
    })),
    topFindings: agg.findings,
    estimatedStrength: agg.elo
      ? `${agg.elo.rating} ± ${agg.elo.band} over ${agg.elo.games} games (engine-consistency estimate, not a rating)`
      : null,
  };
}

function round1(x) { return x == null ? null : Math.round(x * 10) / 10; }

function mapValues(obj, fn) {
  const out = {};
  for (const k of Object.keys(obj)) out[k] = fn(obj[k]);
  return out;
}

function buildUserPrompt(agg) {
  return [
    'Here are my aggregated statistics:',
    JSON.stringify(statsForPrompt(agg), null, 1),
    '',
    'Write about 200 words: one short paragraph of overall assessment, then exactly 3 prioritized',
    'focus areas as a numbered list, each referencing the specific statistic that justifies it.',
  ].join('\n');
}

async function probeOllama(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/api/tags', { signal: controller.signal });
    if (!res.ok) return { available: false, models: [] };
    const data = await res.json();
    return { available: true, models: (data.models || []).map(m => m.name) };
  } catch {
    return { available: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function generateCoachNotes(agg, { url, model }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  try {
    const res = await fetch(url.replace(/\/$/, '') + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.4 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(agg) },
        ],
      }),
    });
    if (!res.ok) throw new Error('Ollama returned ' + res.status);
    const data = await res.json();
    const text = data.message && data.message.content;
    if (!text) throw new Error('Empty response from Ollama');
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

const InsightsCoach = {
  SYSTEM_PROMPT,
  statsForPrompt,
  buildUserPrompt,
  probeOllama,
  generateCoachNotes,
};

if (typeof window !== 'undefined') window.InsightsCoach = InsightsCoach;
export default InsightsCoach;
