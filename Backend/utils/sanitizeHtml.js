
const TAG_ALLOWLIST = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'a', 'img', 'span',
  'h1', 'h2', 'h3',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
]);

const ATTR_ALLOWLIST = {
  a:    ['href', 'target', 'rel'],
  img:  ['src', 'alt'],
  span: ['data-mention', 'class'],
  pre:  ['class'],
  code: ['class'],
};

const SAFE_URL = /^(https?:\/\/|\/uploads\/|\/)/i;
const UNSAFE_URL = /^\s*(javascript|data|vbscript|file):/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (UNSAFE_URL.test(trimmed)) return null;
  if (!SAFE_URL.test(trimmed)) return null;
  return trimmed;
}

function sanitizeAttr(tag, name, value) {
  const lname = name.toLowerCase();

  if (lname.startsWith('on')) return null;
  if (lname === 'style') return null;

  const allowed = ATTR_ALLOWLIST[tag];
  if (!allowed || !allowed.includes(lname)) return null;

  if (lname === 'href' || lname === 'src') {
    const safe = sanitizeUrl(value);
    return safe ? [lname, safe] : null;
  }
  if (lname === 'target') return ['target', '_blank'];
  if (lname === 'rel')    return ['rel',    'noopener noreferrer'];
  if (lname === 'data-mention') {
    return UUID_RE.test((value || '').trim()) ? ['data-mention', value.trim()] : null;
  }
  if (lname === 'class') {
    const safe = String(value || '').replace(/[^a-zA-Z0-9\-_ ]/g, '').slice(0, 120);
    return safe ? ['class', safe] : null;
  }
  if (lname === 'alt') {
    return ['alt', String(value || '').slice(0, 200).replace(/[<>"]/g, '')];
  }
  return [lname, value];
}

// Preserve pre-existing valid entities (&amp; &lt; etc.) while escaping lone &.
function escapeText(s) {
  return String(s)
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeHtml(input) {
  if (input == null) return '';
  const str = String(input);
  if (!str) return '';

  // Remove whole <script>/<style> blocks up-front so their contents don't leak as text.
  const stripped = str
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const out = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let lastIndex = 0;
  let m;

  while ((m = tagRe.exec(stripped)) !== null) {
    if (m.index > lastIndex) {
      out.push(escapeText(stripped.slice(lastIndex, m.index)));
    }
    const whole   = m[0];
    const tagName = m[1].toLowerCase();
    const isClose = whole.startsWith('</');
    const attrBlob = m[2] || '';

    if (TAG_ALLOWLIST.has(tagName)) {
      if (isClose) {
        out.push(`</${tagName}>`);
      } else {
        const selfClose = /\/\s*$/.test(attrBlob);
        const attrs = parseAttrs(attrBlob);
        const kept = [];
        for (const [name, value] of attrs) {
          const pair = sanitizeAttr(tagName, name, value);
          if (pair) kept.push(`${pair[0]}="${escapeAttr(pair[1])}"`);
        }
        let emit = true;
        if (tagName === 'a'   && !kept.some(s => s.startsWith('href='))) emit = false;
        if (tagName === 'img' && !kept.some(s => s.startsWith('src=')))  emit = false;
        if (emit) {
          if (tagName === 'a') {
            if (!kept.some(s => s.startsWith('rel=')))    kept.push('rel="noopener noreferrer"');
            if (!kept.some(s => s.startsWith('target='))) kept.push('target="_blank"');
          }
          const attrStr = kept.length ? ' ' + kept.join(' ') : '';
          out.push(`<${tagName}${attrStr}${selfClose ? ' /' : ''}>`);
        }
      }
    }
    lastIndex = m.index + whole.length;
  }
  if (lastIndex < stripped.length) {
    out.push(escapeText(stripped.slice(lastIndex)));
  }

  return out.join('');
}

function parseAttrs(blob) {
  const result = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(blob)) !== null) {
    const name = m[1];
    const value = m[2] != null ? m[2] : (m[3] != null ? m[3] : (m[4] != null ? m[4] : ''));
    result.push([name, value]);
  }
  return result;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

module.exports = { sanitizeHtml };
