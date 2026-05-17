// PGN parser and serializer — maps between move trees (ADR-0001) and PGN text.

// ---- Tokenizer ----

const NAG_SHORTHAND = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

function tokenize(movetext) {
  const tokens = [];
  let i = 0;

  while (i < movetext.length) {
    const ch = movetext[i];

    // Whitespace
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      i++; continue;
    }

    // Comment { ... }
    if (ch === '{') {
      let j = i + 1;
      while (j < movetext.length && movetext[j] !== '}') j++;
      tokens.push({ type: 'COMMENT', value: movetext.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }

    // NAG $123
    if (ch === '$') {
      let j = i + 1;
      while (j < movetext.length && movetext[j] >= '0' && movetext[j] <= '9') j++;
      tokens.push({ type: 'NAG', value: parseInt(movetext.slice(i + 1, j), 10) });
      i = j;
      continue;
    }

    // Parentheses
    if (ch === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }

    // Result tokens
    if (movetext.slice(i, i + 7) === '1/2-1/2') { tokens.push({ type: 'RESULT', value: '1/2-1/2' }); i += 7; continue; }
    if (movetext.slice(i, i + 3) === '1-0') { tokens.push({ type: 'RESULT', value: '1-0' }); i += 3; continue; }
    if (movetext.slice(i, i + 3) === '0-1') { tokens.push({ type: 'RESULT', value: '0-1' }); i += 3; continue; }
    if (ch === '*') { tokens.push({ type: 'RESULT', value: '*' }); i++; continue; }

    // Move number — skip entirely
    if (ch >= '1' && ch <= '9') {
      let j = i;
      while (j < movetext.length && movetext[j] >= '0' && movetext[j] <= '9') j++;
      if (j < movetext.length && movetext[j] === '.') {
        j++;
        if (movetext[j] === '.') { j++; if (movetext[j] === '.') j++; } // 1...
        i = j;
        continue;
      }
      // fall through: it's a number but not a move number (shouldn't happen in valid PGN)
    }

    // SAN token — read until whitespace or special char
    let j = i;
    while (j < movetext.length &&
           movetext[j] !== ' ' && movetext[j] !== '\n' && movetext[j] !== '\t' &&
           movetext[j] !== '\r' && movetext[j] !== '(' && movetext[j] !== ')' &&
           movetext[j] !== '{' && movetext[j] !== '$') {
      j++;
    }
    const raw = movetext.slice(i, j);
    if (raw) tokens.push({ type: 'SAN', value: raw });
    i = j;
  }

  return tokens;
}

// ---- Header extraction ----

function extractHeaders(text) {
  const headers = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    headers[m[1]] = m[2];
  }
  return headers;
}

function stripHeaders(text) {
  return text.replace(/\[(\w+)\s+"([^"]*)"\]\s*/g, '').trim();
}

// ---- Parse ----

function parse(text, opts = {}) {
  const headers = extractHeaders(text);
  const movetext = stripHeaders(text);
  const warnings = [];
  const allowIllegal = !!opts.allowIllegal;

  // Determine start state
  let startState = globalThis.Chess.START_STATE;
  if (headers.FEN) {
    try { startState = globalThis.Chess.fromFEN(headers.FEN); } catch { warnings.push('Invalid FEN header, using start position'); }
  }

  let tree = globalThis.MoveTree.createTree(startState);
  let current = tree.rootId;
  const stack = [];  // variation return points

  const tokens = tokenize(movetext);

  for (const token of tokens) {
    switch (token.type) {
      case 'SAN': {
        // Extract inline NAG shorthand
        let sanStr = token.value;
        let nag = null;
        const nagMatch = sanStr.match(/[!?]{1,2}$/);
        if (nagMatch) {
          nag = NAG_SHORTHAND[nagMatch[0]] || null;
          sanStr = sanStr.replace(/[!?]+$/, '');
        }
        if (!sanStr) break;

        const state = tree.nodes[current].state;
        const parsed = globalThis.Chess.parseSAN(state, sanStr);
        if (!parsed) {
          const msg = `Illegal move "${sanStr}" at ply ${tree.nodes[current].ply}`;
          warnings.push(msg);
          if (!allowIllegal) return { tree, headers, warnings, error: msg };
          break;
        }

        const opts = parsed.promotion ? { promotion: parsed.promotion } : {};

        // Check for existing child with matching SAN (transposition within PGN)
        const san = globalThis.Chess.toSAN(state, parsed.from, parsed.to, opts);
        let existing = null;
        for (const cid of tree.nodes[current].childIds) {
          if (tree.nodes[cid].san === san) { existing = cid; break; }
        }

        if (existing) {
          current = existing;
        } else {
          const res = globalThis.MoveTree.playMove(tree, current, parsed.from, parsed.to, opts);
          if (!res) {
            warnings.push(`Failed to play "${sanStr}"`);
            if (!allowIllegal) return { tree, headers, warnings, error: `Failed to play "${sanStr}"` };
            break;
          }
          tree = res.tree;
          current = res.nodeId;
        }

        // Attach inline NAG to current node
        if (nag !== null) {
          tree = globalThis.MoveTree.setNag(tree, current, nag);
        }
        break;
      }

      case 'NAG':
        tree = globalThis.MoveTree.setNag(tree, current, token.value);
        break;

      case 'COMMENT':
        tree = globalThis.MoveTree.setComment(tree, current, token.value);
        // Extract chapter/section tags from comment
        const tagMatch = token.value.match(/^(Chapter|Section):\s*(.+)/i);
        if (tagMatch) {
          const tagKey = tagMatch[1].toLowerCase();
          const node = tree.nodes[current];
          const existing = node.tags || {};
          tree = { ...tree, nodes: { ...tree.nodes, [current]: { ...node, tags: { ...existing, [tagKey]: tagMatch[2].trim() } } } };
        }
        break;

      case 'LPAREN':
        stack.push(current);
        // Rewind one ply: variation is an alternative to the move just played
        current = tree.nodes[current].parentId || current;
        break;

      case 'RPAREN':
        if (stack.length > 0) current = stack.pop();
        else warnings.push('Unmatched closing parenthesis');
        break;

      case 'RESULT':
        headers.Result = token.value;
        break;
    }

    if (token.type === 'RESULT') break;
  }

  if (stack.length > 0) {
    warnings.push('Unclosed variation(s) at end of game');
  }

  tree.headers = headers;
  return { tree, headers, warnings };
}

// ---- Serialize ----

function serialize(tree, opts = {}) {
  const includeComments = opts.includeComments !== false;
  const includeNags = opts.includeNags !== false;
  const headers = opts.headers || tree.headers || {};

  const tokens = [];
  let moveNum = 1;

  function push(s) {
    if (s != null && s !== '') tokens.push(s);
  }

  function emitNode(node, parentNode) {
    if (!node || !node.san) {
      // Root — emit comment then children
      if (includeComments && node && node.comment) push(`{${node.comment}}`);
      if (node && node.childIds.length > 0) {
        emitNode(tree.nodes[node.childIds[0]], node);
      }
      return;
    }

    const isWhite = node.ply % 2 === 1;

    // Move number
    if (isWhite) push(`${moveNum}.`);

    // SAN + NAG
    let tag = node.san;
    if (includeNags && node.nag) tag += ` $${node.nag}`;
    push(tag);

    // Comment
    if (includeComments && node.comment) push(`{${node.comment}}`);

    // Emit variations (siblings of THIS node under the parent)
    if (parentNode) {
      const idx = parentNode.childIds.indexOf(node.id);
      for (let i = idx + 1; i < parentNode.childIds.length; i++) {
        const saved = moveNum;
        push('(');
        emitSubtree(tree.nodes[parentNode.childIds[i]], parentNode);
        push(')');
        moveNum = saved;
      }
    }

    // Recurse into mainline child
    if (node.childIds.length > 0) {
      if (!isWhite) moveNum++;
      emitNode(tree.nodes[node.childIds[0]], node);
    } else if (!isWhite) {
      moveNum++;
    }
  }

  function emitSubtree(node, parentNode) {
    if (!node || !node.san) return;

    const isWhite = node.ply % 2 === 1;
    if (isWhite) push(`${moveNum}.`);

    let tag = node.san;
    if (includeNags && node.nag) tag += ` $${node.nag}`;
    push(tag);

    if (includeComments && node.comment) push(`{${node.comment}}`);

    if (parentNode) {
      const idx = parentNode.childIds.indexOf(node.id);
      for (let i = idx + 1; i < parentNode.childIds.length; i++) {
        const saved = moveNum;
        push('(');
        emitSubtree(tree.nodes[parentNode.childIds[i]], parentNode);
        push(')');
        moveNum = saved;
      }
    }

    if (node.childIds.length > 0) {
      if (!isWhite) moveNum++;
      emitSubtree(tree.nodes[node.childIds[0]], node);
    } else if (!isWhite) {
      moveNum++;
    }
  }

  // Headers
  const hdrs = { Event: 'Cabinet analysis', Site: 'Cabinet', Date: todayYYYYMMDD(), Result: '*', ...headers };
  let out = '';
  for (const [k, v] of Object.entries(hdrs)) {
    out += `[${k} "${v}"]\n`;
  }
  out += '\n';

  // Emit
  emitNode(tree.nodes[tree.rootId], null);

  // Join tokens with spaces
  out += tokens.join(' ');
  out += ` ${headers['Result'] || '*'}`;
  return out;
}

function todayYYYYMMDD() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day}`;
}

// ---- Export ----

const PGN = { parse, serialize, tokenize, extractHeaders };

if (typeof window !== 'undefined') window.PGN = PGN;
export default PGN;
