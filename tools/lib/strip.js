// Shrinks the browser JavaScript without changing what it does: removes comments, indentation and
// blank lines, keeps every line break (so automatic semicolon insertion is untouched) and copies
// strings, template literals and regular expressions byte for byte. tests/engine.test.js runs every
// spec case against the shrunk engine too, so a stripping mistake fails the build, not the site.

const REGEX_BEFORE = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const TIGHT = new Set([...'{}()[];,:=?']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw', 'else', 'do', 'yield', 'await']);

export function stripJs(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const braces = []; // template literal nesting: true = a ${ opened from a template
  const lastSignificant = () => {
    const t = out.replace(/\s+$/, '');
    return t;
  };
  const regexAllowed = () => {
    const t = lastSignificant();
    if (t === '') return true;
    const ch = t[t.length - 1];
    if (REGEX_BEFORE.has(ch)) return true;
    const word = t.match(/([A-Za-z_$][\w$]*)$/);
    return Boolean(word && REGEX_KEYWORDS.has(word[1]));
  };
  const copyString = (q) => {
    let s = src[i++];
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') s += src[i++];
      if (src[i] === '\n' && q !== '`') throw new Error('stripJs: unterminated string');
      s += src[i++];
    }
    if (i >= n) throw new Error('stripJs: unterminated string');
    s += src[i++];
    return s;
  };
  const copyTemplatePart = () => {
    // From the current position inside a template literal up to and including ` or ${.
    let s = '';
    while (i < n) {
      if (src[i] === '\\') { s += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === '`') { s += src[i++]; return { s, open: false }; }
      if (src[i] === '$' && src[i + 1] === '{') { s += '${'; i += 2; return { s, open: true }; }
      s += src[i++];
    }
    throw new Error('stripJs: unterminated template');
  };
  const copyRegex = () => {
    let s = src[i++];
    let inClass = false;
    while (i < n) {
      const c = src[i];
      if (c === '\n') throw new Error('stripJs: unterminated regex');
      if (c === '\\') { s += c + src[i + 1]; i += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { s += src[i++]; break; }
      s += src[i++];
    }
    while (i < n && /[a-z]/i.test(src[i])) s += src[i++];
    return s;
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('stripJs: unterminated comment');
      out += src.slice(i, end).includes('\n') ? '\n' : ' ';
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") { out += copyString(c); continue; }
    if (c === '`') {
      i++;
      const part = copyTemplatePart();
      out += '`' + part.s;
      if (part.open) braces.push(true);
      continue;
    }
    if (c === '{') { braces.push(false); out += c; i++; continue; }
    if (c === '}') {
      const fromTemplate = braces.pop();
      out += c;
      i++;
      if (fromTemplate) {
        const part = copyTemplatePart();
        out += part.s;
        if (part.open) braces.push(true);
      }
      continue;
    }
    if (c === '/' && regexAllowed()) { out += copyRegex(); continue; }
    if (c === '\n') {
      out = out.replace(/[ \t]+$/, '');
      if (out !== '' && !out.endsWith('\n')) out += '\n';
      i++;
      while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
      continue;
    }
    if (c === ' ' || c === '\t') {
      while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
      // A space next to punctuation that can never join with its neighbour into another token is dropped
      // (+, -, <, > and / are left alone: "a - -b" or "x / /re/" must keep their space).
      const prev = out[out.length - 1];
      if (out !== '' && prev !== '\n' && prev !== ' ' && !TIGHT.has(prev) && !TIGHT.has(src[i]) && src[i] !== '\n') out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out.trim() + '\n';
}
