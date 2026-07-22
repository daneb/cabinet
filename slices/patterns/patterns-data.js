// Patterns slice — curated, replayable tactical/mating patterns.
// Pure data + pure helpers. No React. Every entry is mechanically verified by
// tests/patterns/patterns-data.test.js: the FEN must parse, every SAN in `line`
// must be legal and round-trip through Chess.toSAN, and the final move must be
// a real checkmate. `category` is the extension point for openings, middlegame
// strategies, and technical endgames later.

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CATEGORIES = [
  { id: 'mate', label: 'Checkmate patterns' },
];

const PATTERNS = [
  {
    id: 'back-rank-mate',
    name: 'Back-rank mate',
    category: 'mate',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Re8#'],
    description: 'A rook or queen slides to the eighth rank while the king is sealed in by its own unmoved pawn shield. The most common mating pattern in practical play.',
    source: null,
  },
  {
    id: 'smothered-mate',
    name: "Smothered mate (Philidor's Legacy)",
    category: 'mate',
    fen: 'r2q1rk1/pp4pp/8/6N1/8/8/5PPP/3Q2K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qb3+', 'Kh8', 'Nf7+', 'Kg8', 'Nh6+', 'Kh8', 'Qg8+', 'Rxg8', 'Nf7#'],
    description: 'The full Philidor mechanism: a check drives the king to the corner, a knight double-check forces it back, the queen is sacrificed on g8 to box the king in with its own rook, and the knight mates a completely smothered king.',
    source: { players: 'analyzed by Philidor', year: 1749 },
  },
  {
    id: 'anastasias-mate',
    name: "Anastasia's mate",
    category: 'mate',
    fen: 'r2q1rk1/pp3ppp/8/3N4/7Q/4R3/5PP1/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Ne7+', 'Kh8', 'Qxh7+', 'Kxh7', 'Rh3#'],
    description: 'A knight lands on e7 to cover g8 and g6, the h-file is ripped open with a queen sacrifice on h7, and a rook swings over to mate along the h-file.',
    source: { players: 'named after Heinse’s novel Anastasia und das Schachspiel', year: 1803 },
  },
  {
    id: 'bodens-mate',
    name: "Boden's mate",
    category: 'mate',
    fen: '2kr4/pp1p4/2n5/8/Q4B2/8/5PPP/5BK1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qxc6+', 'bxc6', 'Ba6#'],
    description: 'Two bishops on criss-crossing diagonals mate a queenside-castled king. A queen sacrifice on c6 forces open the b-file pawn cover, and the light-squared bishop delivers mate from a6.',
    source: { players: 'Schulder–Boden (motif, colors reversed)', year: 1853 },
  },
  {
    id: 'arabian-mate',
    name: 'Arabian mate',
    category: 'mate',
    fen: 'r6k/pp1R4/5N2/8/8/8/5PPP/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Rh7#'],
    description: 'Rook and knight cooperate against the cornered king: the knight on f6 guards both the rook on h7 and the g8 flight square. One of the oldest recorded mating patterns, from medieval shatranj.',
    source: null,
  },
  {
    id: 'anderssens-mate',
    name: "Anderssen's mate",
    category: 'mate',
    fen: '6k1/pb4P1/1p3K2/8/8/8/PP6/7R w - - 0 1',
    sideToWin: 'w',
    line: ['Rh8#'],
    description: 'A rook (or queen) mates on the h8 corner square, supported by a pawn on g7 — with the attacking king personally covering the remaining flight squares.',
    source: { players: 'named for Adolf Anderssen', year: null },
  },
  {
    id: 'opera-mate',
    name: 'Opera mate',
    category: 'mate',
    fen: '4k2r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16',
    sideToWin: 'w',
    line: ['Qb8+', 'Nxb8', 'Rd8#'],
    description: 'A back-rank mate delivered by a rook supported by a bishop, set up by a queen deflection sacrifice. This is the actual finish of Morphy’s Opera Game against the Duke of Brunswick and Count Isouard.',
    source: { players: 'Morphy–Duke Karl & Count Isouard, Paris Opera', year: 1858 },
  },
  {
    id: 'epaulette-mate',
    name: 'Epaulette mate',
    category: 'mate',
    fen: '3rkr2/p6p/8/8/8/1Q6/5PPP/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qe6#'],
    description: 'The king’s own rooks sit on both adjacent squares like epaulettes on a uniform, blocking its escape. The queen mates frontally from two squares away, covering all remaining flight squares.',
    source: null,
  },
  {
    id: 'dovetail-mate',
    name: 'Dovetail mate',
    category: 'mate',
    fen: '2b5/pp1r4/2pk4/8/5P2/8/4Q1PP/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qe5#'],
    description: 'The queen mates from a diagonally adjacent square while the two flight squares not covered by the queen are occupied by the king’s own pieces — which form the dove’s tail.',
    source: null,
  },
  {
    id: 'swallows-tail-mate',
    name: "Swallow's-tail mate",
    category: 'mate',
    fen: '8/p2r1r1p/4k3/8/3P4/8/5PPQ/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qe5#'],
    description: 'The mirror of the dovetail: the king’s own rooks occupy the two diagonal squares behind it, and a protected queen mates face-to-face from directly in front.',
    source: null,
  },
  {
    id: 'hook-mate',
    name: 'Hook mate',
    category: 'mate',
    fen: '5k1r/pp4p1/3N4/2P5/8/8/5PPP/4R1K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Re8#'],
    description: 'Rook, knight, and pawn form the “hook”: the rook checks on the edge, the knight protects the rook and covers the diagonal flight square, and the pawn protects the knight.',
    source: null,
  },
  {
    id: 'ladder-mate',
    name: 'Ladder mate',
    category: 'mate',
    fen: '8/pp6/3k4/6R1/8/8/5PP1/6KR w - - 0 1',
    sideToWin: 'w',
    line: ['Rh6+', 'Kd7', 'Rg7+', 'Kd8', 'Rh8#'],
    description: 'Two heavy pieces walk the king rung by rung to the edge of the board: one rook cuts off a rank, the other checks on the next, alternating until the king runs out of board.',
    source: null,
  },
  {
    id: 'legals-mate',
    name: "Légal's mate",
    category: 'mate',
    fen: START_FEN,
    sideToWin: 'w',
    line: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'],
    description: 'The classic pseudo-queen-sacrifice miniature: White lets the queen go to unleash Nxe5, and three minor pieces mate the exposed king. Greed on move five loses the game.',
    source: { players: 'de Légal–Saint Brie, Paris', year: 1750 },
  },
  {
    id: 'blackburnes-mate',
    name: "Blackburne's mate",
    category: 'mate',
    fen: 'r2q1rk1/pp3p2/8/6N1/8/8/PBB2PP1/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Bh7#'],
    description: 'Both bishops and a knight converge on the castled king: the light bishop mates on h7 protected by the knight, while the dark bishop rakes the long diagonal to seal h8.',
    source: { players: 'named for Joseph Blackburne', year: null },
  },
  {
    id: 'damianos-mate',
    name: "Damiano's mate",
    category: 'mate',
    fen: '5rk1/pp4p1/6P1/8/7Q/8/PP3P2/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qh7#'],
    description: 'A pawn wedged on g6 escorts the queen to h7 for mate. In the full classical version, rooks are sacrificed on h8 first to drag the king onto the file — this is the geometry to recognize.',
    source: { players: 'analyzed by Pedro Damiano', year: 1512 },
  },
  {
    id: 'lollis-mate',
    name: "Lolli's mate",
    category: 'mate',
    fen: '5rk1/pp3p1p/5P1Q/8/8/8/5PPP/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Qg7#'],
    description: 'A pawn wedge on f6 fixes the castled king, and the queen infiltrates to g7. Against a fianchetto structure this wedge-and-infiltrate plan is a standard attacking blueprint.',
    source: { players: 'analyzed by Giambattista Lolli', year: 1763 },
  },
  {
    id: 'pillsburys-mate',
    name: "Pillsbury's mate",
    category: 'mate',
    fen: '3q1rk1/pp3p1p/5B2/8/8/8/PP5P/3R3K w - - 0 1',
    sideToWin: 'w',
    line: ['Rg1#'],
    description: 'The rook mates on the opened g-file while the dark-squared bishop on f6 seals the h8 corner. A signature finish of open-g-file attacks against the fianchetto-less castled king.',
    source: { players: 'named for Harry Nelson Pillsbury', year: null },
  },
  {
    id: 'morphys-mate',
    name: "Morphy's mate",
    category: 'mate',
    fen: 'r4r1k/pp3p1p/8/8/7B/8/PPP2P2/5KR1 w - - 0 1',
    sideToWin: 'w',
    line: ['Bf6#'],
    description: 'The twin of Pillsbury’s mate with roles swapped: the bishop delivers mate along the long diagonal to the cornered king while the rook on the g-file covers the flight square.',
    source: { players: 'named for Paul Morphy', year: null },
  },
  {
    id: 'retis-mate',
    name: "Réti's mate",
    category: 'mate',
    fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
    sideToWin: 'w',
    line: ['Qd8+', 'Kxd8', 'Bg5+', 'Kc7', 'Bd8#'],
    description: 'A queen sacrifice decoys the king onto d8, a bishop double-check with the rook forces it forward, and the bishop returns to d8 to mate a king trapped by its own undeveloped army. Réti beat Tartakower this way in eleven moves.',
    source: { players: 'Réti–Tartakower, Vienna', year: 1910 },
  },
  {
    id: 'grecos-mate',
    name: "Greco's mate",
    category: 'mate',
    fen: 'r4r1k/pp4p1/8/8/2B5/8/3K1PP1/R7 w - - 0 1',
    sideToWin: 'w',
    line: ['Rh1#'],
    description: 'The bishop cuts the g8 flight square along the Italian diagonal while a heavy piece mates down the opened h-file. The oldest recorded h-file demolition, from Greco’s 17th-century notebooks.',
    source: { players: 'analyzed by Gioachino Greco', year: 1619 },
  },
  {
    id: 'corner-mate',
    name: 'Corner mate',
    category: 'mate',
    fen: 'r6k/pp5p/8/6N1/8/8/PP3P2/5KR1 w - - 0 1',
    sideToWin: 'w',
    line: ['Nf7#'],
    description: 'A knight mates the cornered king while a rook on the g-file confines it: the knight covers h8 from f7, the rook covers g8 and g7, and the king’s own h-pawn blocks the last exit.',
    source: null,
  },
  {
    id: 'vukovic-mate',
    name: 'Vuković mate',
    category: 'mate',
    fen: '4k2r/5ppp/2N5/8/8/8/5PPP/3R2K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Rd8#'],
    description: 'A rook mates the uncastled king frontally on the back rank, protected by a knight that also seals the e7 flight square. Named from Vladimir Vuković’s The Art of Attack.',
    source: { players: 'Vuković, The Art of Attack in Chess', year: 1965 },
  },
  {
    id: 'suffocation-mate',
    name: 'Suffocation mate',
    category: 'mate',
    fen: 'r5rk/pp4p1/8/6N1/8/8/2B2PPP/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Nf7#'],
    description: 'A knight delivers the mate while a bishop covers the escape diagonal from long range — the king suffocates between its own pieces and the bishop’s beam. First shown by Greco.',
    source: { players: 'analyzed by Gioachino Greco', year: 1620 },
  },
  {
    id: 'blind-swine-mate',
    name: 'Blind swine mate',
    category: 'mate',
    fen: 'r4rk1/1RR4p/8/p7/8/8/5PPP/6K1 w - - 0 1',
    sideToWin: 'w',
    line: ['Rg7+', 'Kh8', 'Rxh7+', 'Kg8', 'Rbg7#'],
    description: 'Two rooks rampaging on the seventh rank — Janowski’s “blind swine” — devour the pawn cover and mate in the corner. Doubled rooks on the seventh are usually at least a draw; here they are decisive.',
    source: { players: 'term coined by Dawid Janowski', year: null },
  },
  {
    id: 'scholars-mate',
    name: "Scholar's mate",
    category: 'mate',
    fen: START_FEN,
    sideToWin: 'w',
    line: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
    description: 'The four-move mate on f7, the weakest square on the board: queen and bishop double up on f7 before Black completes development. Every player should know both how to spot it and how to defend it.',
    source: null,
  },
];

// Build a MoveTree from a pattern: root at the FEN, mainline = the pattern line.
// The pattern description travels on the root node's comment.
function buildTree(pattern) {
  const Chess = globalThis.Chess;
  const MoveTree = globalThis.MoveTree;
  let state;
  try {
    state = Chess.fromFEN(pattern.fen);
  } catch (e) {
    return { tree: null, error: `bad FEN: ${e.message}` };
  }
  let tree = MoveTree.createTree(state);
  tree = MoveTree.setComment(tree, tree.rootId, pattern.description);
  let nodeId = tree.rootId;
  for (const san of pattern.line) {
    const node = tree.nodes[nodeId];
    const mv = Chess.parseSAN(node.state, san);
    if (!mv) return { tree: null, error: `illegal or ambiguous SAN "${san}"` };
    const res = MoveTree.playMove(tree, nodeId, mv.from, mv.to, mv.promotion ? { promotion: mv.promotion } : {});
    if (!res) return { tree: null, error: `could not play "${san}"` };
    tree = res.tree;
    nodeId = res.nodeId;
  }
  return { tree, error: null };
}

const Patterns = { PATTERNS, CATEGORIES, buildTree };

if (typeof window !== 'undefined') window.Patterns = Patterns;
export default Patterns;
