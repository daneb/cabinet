// Evaluation bar — vertical bar showing white vs black advantage.
// evaluation: { type: 'cp'|'mate', value: number } | null
// value is from white's perspective: positive = white better.

function EvalBar({ evaluation, flipped }) {
  let whitePercent = 50;
  let label = '=';

  if (evaluation) {
    if (evaluation.type === 'cp') {
      const cp = evaluation.value;
      whitePercent = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
      if (Math.abs(cp) < 15) {
        label = '=';
      } else {
        const pawns = (Math.abs(cp) / 100).toFixed(1);
        label = (cp > 0 ? '+' : '-') + pawns;
      }
    } else if (evaluation.type === 'mate') {
      const m = evaluation.value;
      whitePercent = m > 0 ? 97 : 3;
      label = m > 0 ? `M${m}` : `M${Math.abs(m)}`;
    }
  }

  whitePercent = Math.max(3, Math.min(97, whitePercent));
  const blackPercent = 100 - whitePercent;

  const whiteWinning = whitePercent >= 50;

  const labelStyle = {
    fontFamily: 'var(--mono)',
    fontSize: '10px', fontWeight: 600,
    writingMode: 'vertical-rl',
    textAlign: 'center',
    padding: '3px 0',
    width: '100%',
    overflow: 'hidden',
    flexShrink: 0,
  };

  return (
    <div className="eval-bar" style={{ flexDirection: flipped ? 'column-reverse' : 'column' }} title={`Evaluation: ${label}`}>
      {/* Black section — top of bar (bottom when the board is flipped) */}
      <div style={{ background: '#15171c', width: '100%', height: blackPercent + '%', display: 'flex', flexDirection: 'column', justifyContent: flipped ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
        {!whiteWinning && (
          <div style={{ ...labelStyle, color: '#ffffff' }}>{label}</div>
        )}
      </div>
      {/* White section — bottom of bar (top when the board is flipped) */}
      <div style={{ background: '#ffffff', width: '100%', height: whitePercent + '%', display: 'flex', flexDirection: 'column', justifyContent: flipped ? 'flex-start' : 'flex-end', flexShrink: 0 }}>
        {whiteWinning && (
          <div style={{ ...labelStyle, color: '#15171c' }}>{label}</div>
        )}
      </div>
    </div>
  );
}

window.EvalBar = EvalBar;
