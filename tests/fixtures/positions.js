// Canonical perft positions from chessprogramming.org/Perft_Results
export const POSITIONS = [
  {
    name: 'start',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    perft: { 1: 20, 2: 400, 3: 8902, 4: 197281 },
  },
  {
    name: 'kiwipete',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    perft: { 1: 48, 2: 2039, 3: 97862, 4: 4085603 },
  },
  {
    name: 'position3',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    perft: { 1: 14, 2: 191, 3: 2812, 4: 43238 },
  },
  {
    name: 'position4',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    perft: { 1: 6, 2: 264, 3: 9467, 4: 422333 },
  },
  {
    name: 'position5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    perft: { 1: 44, 2: 1486, 3: 62379, 4: 2103487 },
  },
];
