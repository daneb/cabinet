// Drag-and-drop hook for chess pieces.
// Coexists with click-to-move: uses didDragRef to suppress spurious click after drag.

const { useRef, useState, useCallback } = React;

function useDragPiece({ currentState, commitMove, setSelected, setLegalTargets, setPendingPromotion }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragTargets, setDragTargets] = useState([]);
  const didDragRef = useRef(false);

  // Blank image to suppress browser's default ghost
  const blankImg = useRef(null);
  if (!blankImg.current) {
    blankImg.current = new Image();
    blankImg.current.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }

  const handleDragStart = useCallback((e, idx) => {
    const piece = currentState.board[idx];
    if (piece === '.' || window.Chess.colorOf(piece) !== currentState.turn) {
      e.preventDefault();
      return;
    }
    didDragRef.current = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(blankImg.current, 0, 0);

    const targets = window.Chess.legalTargetsFrom(currentState, idx);
    setDragFrom(idx);
    setDragTargets(targets);
    setSelected(idx);
    setLegalTargets(targets);
  }, [currentState]);

  const handleDragEnd = useCallback(() => {
    setDragFrom(null);
    setDragTargets([]);
    setSelected(null);
    setLegalTargets([]);
    // Reset after click event fires (dragend fires before click)
    setTimeout(() => { didDragRef.current = false; }, 50);
  }, []);

  const handleDrop = useCallback((toIdx) => {
    if (dragFrom === null) return;
    if (!dragTargets.includes(toIdx)) {
      handleDragEnd();
      return;
    }
    const piece = currentState.board[dragFrom];
    const isPromotion = piece && piece.toLowerCase() === 'p' &&
      (Math.floor(toIdx / 8) === 0 || Math.floor(toIdx / 8) === 7);

    if (isPromotion) {
      setPendingPromotion({ from: dragFrom, to: toIdx });
    } else {
      commitMove(dragFrom, toIdx);
    }
    setDragFrom(null);
    setDragTargets([]);
  }, [dragFrom, dragTargets, currentState, commitMove, handleDragEnd]);

  return {
    dragFrom,
    dragTargets,
    didDragRef,
    handleDragStart,
    handleDragEnd,
    handleDrop,
  };
}

window.useDragPiece = useDragPiece;
