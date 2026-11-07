/**
 * Dependency-free PDF -> text, for the "drop the OFP PDF" flow.
 *
 * Replaces pdf.js, whose bundle carried XFA/XML namespace URLs and `new
 * Function` (dynamic code) — both rejected by Even Hub review. An OFP is plain
 * text laid out on pages, so this only needs to: locate the objects (incl.
 * compressed object streams), inflate streams with the platform's built-in
 * DecompressionStream, map font codes to Unicode (ToUnicode CMaps or simple
 * encodings), interpret the text operators, and rebuild lines in visual order
 * (top to bottom, left to right). No eval, no network, no worker.
 *
 * Not supported (rejected with a clear message so the pilot can paste the OFP
 * text instead): encrypted PDFs and scanned image-only PDFs.
 */

// ---------- PDF values ----------
class Ref {
  constructor(readonly num: number) {}
}
class Name {
  constructor(readonly v: string) {}
}
/** A byte string: one char per byte (latin1). */
class Str {
  constructor(readonly v: string) {}
}
/** A bare keyword: a content-stream operator, or a stray delimiter. */
class Op {
  constructor(readonly v: string) {}
}
class Dict {
  constructor(readonly m: Map<string, Val>) {}
  get(k: string): Val | undefined {
    return this.m.get(k);
  }
}
class Stream {
  constructor(
    readonly dict: Dict,
    readonly raw: string,
  ) {}
}
type Val = number | boolean | null | Ref | Name | Str | Dict | Stream | Val[];
type Objs = Map<number, Val>;

// ---------- bytes <-> latin1 ----------
function fromBytes(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 0x8000)));
  }
  return s;
}
function toBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
function hexToBytes(hex: string): string {
  const h = hex.length % 2 ? hex + '0' : hex;
  let s = '';
  for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return s;
}

// ---------- lexer ----------
const isWs = (c: number) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDelim = (c: number) =>
  c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const REF_TAIL_RE = /^\s+(\d+)\s+R(?![^\s()<>[\]{}/%])/;

class Lexer {
  constructor(
    readonly s: string,
    public pos = 0,
  ) {}

  private skip(): void {
    const s = this.s;
    for (;;) {
      const c = s.charCodeAt(this.pos);
      if (isWs(c)) this.pos++;
      else if (c === 37) {
        while (this.pos < s.length && s.charCodeAt(this.pos) !== 10 && s.charCodeAt(this.pos) !== 13) this.pos++;
      } else return;
    }
  }

  /** The next value or operator; undefined at end of input. */
  next(): Val | Op | undefined {
    this.skip();
    const s = this.s;
    if (this.pos >= s.length) return undefined;
    const c = s.charCodeAt(this.pos);

    if (c === 91) {
      // [ array ]
      this.pos++;
      const arr: Val[] = [];
      for (;;) {
        this.skip();
        if (this.pos >= s.length) break;
        if (s.charCodeAt(this.pos) === 93) {
          this.pos++;
          break;
        }
        const v = this.next();
        if (v === undefined) break;
        if (!(v instanceof Op)) arr.push(v);
      }
      return arr;
    }
    if (c === 60) {
      if (s.charCodeAt(this.pos + 1) === 60) {
        // << dict >>
        this.pos += 2;
        const m = new Map<string, Val>();
        for (;;) {
          this.skip();
          if (this.pos >= s.length) break;
          if (s.charCodeAt(this.pos) === 62 && s.charCodeAt(this.pos + 1) === 62) {
            this.pos += 2;
            break;
          }
          const k = this.next();
          if (k === undefined) break;
          if (!(k instanceof Name)) continue;
          const v = this.next();
          if (v === undefined) break;
          if (!(v instanceof Op)) m.set(k.v, v);
        }
        return new Dict(m);
      }
      // <hex string>
      const end = s.indexOf('>', this.pos + 1);
      const stop = end < 0 ? s.length : end;
      const hex = s.slice(this.pos + 1, stop).replace(/[^0-9a-fA-F]/g, '');
      this.pos = stop + 1;
      return new Str(hexToBytes(hex));
    }
    if (c === 40) return new Str(this.literal());
    if (c === 47) {
      // /Name, with #xx escapes
      let e = this.pos + 1;
      while (e < s.length && !isWs(s.charCodeAt(e)) && !isDelim(s.charCodeAt(e))) e++;
      const raw = s.slice(this.pos + 1, e);
      this.pos = e;
      return new Name(raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
    }
    if (isDelim(c)) {
      this.pos++;
      return new Op(s[this.pos - 1]!);
    }

    let e = this.pos;
    while (e < s.length && !isWs(s.charCodeAt(e)) && !isDelim(s.charCodeAt(e))) e++;
    const tok = s.slice(this.pos, e);
    this.pos = e;
    if (NUM_RE.test(tok)) {
      const n = parseFloat(tok);
      if (/^\d+$/.test(tok)) {
        // `num gen R` indirect reference
        const m = REF_TAIL_RE.exec(s.slice(e, e + 32));
        if (m) {
          this.pos = e + m[0].length;
          return new Ref(n);
        }
      }
      return n;
    }
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'null') return null;
    return new Op(tok);
  }

  /** A (literal string) with escapes and balanced parentheses. */
  private literal(): string {
    const s = this.s;
    let i = this.pos + 1;
    let depth = 1;
    let out = '';
    while (i < s.length) {
      const ch = s[i]!;
      if (ch === '\\') {
        const n = s[i + 1];
        i += 2;
        if (n === 'n') out += '\n';
        else if (n === 'r') out += '\r';
        else if (n === 't') out += '\t';
        else if (n === 'b') out += '\b';
        else if (n === 'f') out += '\f';
        else if (n === '\r') {
          if (s[i] === '\n') i++; // line continuation
        } else if (n === '\n' || n === undefined) {
          // line continuation / truncated
        } else if (n >= '0' && n <= '7') {
          let oct = n;
          while (oct.length < 3 && i < s.length && s[i]! >= '0' && s[i]! <= '7') oct += s[i++];
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else out += n; // \( \) \\ and unknown escapes
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) {
        i++;
        break;
      }
      out += ch;
      i++;
    }
    this.pos = i;
    return out;
  }
}

// ---------- helpers ----------
function resolve(v: Val | undefined, objs: Objs): Val | undefined {
  for (let guard = 0; v instanceof Ref && guard < 32; guard++) v = objs.get(v.num);
  return v instanceof Ref ? undefined : v;
}
const nameOf = (v: Val | undefined): string | undefined => (v instanceof Name ? v.v : undefined);
const num = (v: Val | undefined, d: number): number => (typeof v === 'number' ? v : d);
const toArray = (v: Val | undefined): Val[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---------- objects ----------
const OBJ_RE = /(\d+)\s+\d+\s+obj\b/g;
const STREAM_RE = /^\s*stream(?:\r\n|\n|\r)?/;

/** Find every `n g obj` in file order (a later definition wins, as with an
 *  incremental update). Stream bodies are skipped so binary data can never be
 *  mistaken for an object header. */
function scanObjects(src: string): { objs: Objs; direct: Set<number>; objStms: Stream[] } {
  const objs: Objs = new Map();
  const objStms: Stream[] = [];
  const re = new RegExp(OBJ_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const lx = new Lexer(src, m.index + m[0].length);
    const val = lx.next();
    if (val === undefined || val instanceof Op) continue;
    const st = STREAM_RE.exec(src.slice(lx.pos, lx.pos + 16));
    if (val instanceof Dict && st) {
      const start = lx.pos + st[0].length;
      let end = -1;
      const len = val.get('Length');
      if (typeof len === 'number' && /^\s*endstream/.test(src.slice(start + len, start + len + 24))) {
        end = start + len;
      } else {
        end = src.indexOf('endstream', start);
        if (end < 0) end = src.length;
        if (src[end - 1] === '\n') end--;
        if (src[end - 1] === '\r') end--;
      }
      const stream = new Stream(val, src.slice(start, end));
      objs.set(+m[1]!, stream);
      if (nameOf(val.get('Type')) === 'ObjStm') objStms.push(stream);
      re.lastIndex = end + 'endstream'.length;
    } else {
      objs.set(+m[1]!, val);
      re.lastIndex = lx.pos;
    }
  }
  return { objs, direct: new Set(objs.keys()), objStms };
}

/** Unpack compressed object streams (PDF 1.5+) into the object table. */
async function expandObjStms(objs: Objs, direct: Set<number>, objStms: Stream[]): Promise<void> {
  for (const st of objStms) {
    const data = await decodeStream(st, objs);
    if (!data) continue;
    const n = num(resolve(st.dict.get('N'), objs), 0);
    const first = num(resolve(st.dict.get('First'), objs), 0);
    const hdr = new Lexer(data);
    for (let i = 0; i < n; i++) {
      const id = hdr.next();
      const off = hdr.next();
      if (typeof id !== 'number' || typeof off !== 'number') break;
      if (direct.has(id)) continue; // a directly written object wins
      const v = new Lexer(data, first + off).next();
      if (v !== undefined && !(v instanceof Op)) objs.set(id, v);
    }
  }
}

// ---------- stream filters ----------
async function decompress(bytes: Uint8Array, format: string): Promise<Uint8Array> {
  const ds = new DecompressionStream(format as CompressionFormat);
  const w = ds.writable.getWriter();
  w.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  w.close().catch(() => {});
  const r = ds.readable.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { value, done } = await r.read();
      if (done) break;
      parts.push(value);
      n += value.length;
    }
  } catch {
    // truncated or trailing garbage: keep what inflated
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function inflate(data: string): Promise<string> {
  const bytes = toBytes(data);
  for (const fmt of ['deflate', 'deflate-raw']) {
    const out = await decompress(bytes, fmt);
    if (out.length) return fromBytes(out);
  }
  return '';
}

function ascii85(s: string): string {
  const body = s.replace(/~>[\s\S]*$/, '').replace(/^<~/, '').replace(/\s+/g, '');
  let out = '';
  let group: number[] = [];
  const flush = (len: number) => {
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const d of group) v = v * 85 + d;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out += String.fromCharCode(...bytes.slice(0, len));
    group = [];
  };
  for (const ch of body) {
    if (ch === 'z' && group.length === 0) {
      out += '\0\0\0\0';
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) flush(4);
  }
  if (group.length) flush(group.length - 1);
  return out;
}

/** Undo PNG row predictors (Predictor >= 10) after Flate. */
function pngUnpredict(data: string, columns: number, colors: number, bpc: number): string {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  const src = toBytes(data);
  const rows = Math.floor(src.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const filter = src[r * (rowLen + 1)]!;
    const row = src.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      const x = row[i]!;
      let v = x;
      if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return fromBytes(out);
}

/** Decode a stream's data through its filters; null for non-text filters (images). */
async function decodeStream(st: Stream, objs: Objs): Promise<string | null> {
  let data = st.raw;
  const filters = toArray(resolve(st.dict.get('Filter'), objs)).map((f) => nameOf(resolve(f, objs)));
  const parms = toArray(resolve(st.dict.get('DecodeParms') ?? st.dict.get('DP'), objs));
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    if (f === 'FlateDecode' || f === 'Fl') {
      data = await inflate(data);
      const p = resolve(parms[i], objs);
      if (p instanceof Dict && num(resolve(p.get('Predictor'), objs), 1) >= 10) {
        data = pngUnpredict(
          data,
          num(resolve(p.get('Columns'), objs), 1),
          num(resolve(p.get('Colors'), objs), 1),
          num(resolve(p.get('BitsPerComponent'), objs), 8),
        );
      }
    } else if (f === 'ASCIIHexDecode' || f === 'AHx') {
      data = hexToBytes(data.replace(/>[\s\S]*$/, '').replace(/[^0-9a-fA-F]/g, ''));
    } else if (f === 'ASCII85Decode' || f === 'A85') {
      data = ascii85(data);
    } else {
      return null; // DCT/JPX/CCITT/JBIG2 images, LZW: no text here
    }
  }
  return data;
}

// ---------- fonts ----------
interface Font {
  twoByte: boolean;
  toUni(code: number): string;
  /** Glyph advance in 1/1000 em. */
  width(code: number): number;
}

const WIN_ANSI: string[] = (() => {
  const t: string[] = [];
  for (let i = 0; i < 256; i++) t[i] = (i >= 32 && i < 127) || i >= 160 ? String.fromCharCode(i) : '';
  const hi: Record<number, string> = {
    0x80: '€', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”',
    0x95: '•', 0x96: '–', 0x97: '—', 0x99: '™',
  };
  for (const k in hi) t[+k] = hi[+k]!;
  t[9] = ' ';
  return t;
})();

const GLYPHS: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&',
  quotesingle: "'", quoteright: '’', quoteleft: '‘', parenleft: '(', parenright: ')',
  asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '-', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@',
  bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`',
  braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', degree: '°', endash: '–',
  emdash: '—', bullet: '•', ellipsis: '…', nbspace: ' ', nonbreakingspace: ' ',
};

function glyphToUnicode(n: string): string {
  if (n.length === 1) return n;
  if (GLYPHS[n] !== undefined) return GLYPHS[n]!;
  const u = /^uni([0-9A-Fa-f]{4})/.exec(n) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(n);
  if (u) return String.fromCodePoint(parseInt(u[1]!, 16));
  const dot = n.indexOf('.');
  return dot > 0 ? glyphToUnicode(n.slice(0, dot)) : '';
}

/** ToUnicode CMap: bfchar and bfrange (both forms) -> code -> text. */
function parseCMap(t: string): Map<number, string> {
  const map = new Map<number, string>();
  const utf16 = (h: string): string => {
    if (h.length < 4) return h ? String.fromCharCode(parseInt(h, 16)) : '';
    let s = '';
    for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return s;
  };
  for (const b of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of b[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      map.set(parseInt(m[1]!, 16), utf16(m[2]!));
    }
  }
  for (const b of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const rangeRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([^\]]*)\])/g;
    for (const m of b[1]!.matchAll(rangeRe)) {
      const lo = parseInt(m[1]!, 16);
      const hi = parseInt(m[2]!, 16);
      if (!(hi >= lo) || hi - lo > 0xffff) continue;
      if (m[3] !== undefined) {
        const dst = m[3];
        const head = utf16(dst.slice(0, -4));
        const last = parseInt(dst.slice(-4) || '0', 16);
        for (let c = lo; c <= hi; c++) map.set(c, head + String.fromCharCode(last + (c - lo)));
      } else {
        [...m[4]!.matchAll(/<([0-9A-Fa-f]*)>/g)].forEach((x, i) => {
          if (lo + i <= hi) map.set(lo + i, utf16(x[1]!));
        });
      }
    }
  }
  return map;
}

function simpleEncoding(e: Val | undefined, objs: Objs): string[] {
  const table = WIN_ANSI.slice();
  if (e instanceof Dict) {
    let code = 0;
    for (const d of toArray(resolve(e.get('Differences'), objs))) {
      const r = resolve(d, objs);
      if (typeof r === 'number') code = r;
      else if (r instanceof Name) table[code++] = glyphToUnicode(r.v);
    }
  }
  return table;
}

const FALLBACK_FONT: Font = { twoByte: false, toUni: (c) => WIN_ANSI[c] ?? '', width: () => 556 };

async function buildFont(f: Dict, objs: Objs): Promise<Font> {
  const subtype = nameOf(resolve(f.get('Subtype'), objs));
  const base = nameOf(resolve(f.get('BaseFont'), objs)) ?? '';
  let uni: Map<number, string> | null = null;
  const tu = resolve(f.get('ToUnicode'), objs);
  if (tu instanceof Stream) {
    const cmap = await decodeStream(tu, objs);
    if (cmap) uni = parseCMap(cmap);
  }

  if (subtype === 'Type0') {
    const desc = resolve(toArray(resolve(f.get('DescendantFonts'), objs))[0], objs);
    const dw = desc instanceof Dict ? num(resolve(desc.get('DW'), objs), 1000) : 1000;
    const widths = new Map<number, number>();
    const w = desc instanceof Dict ? resolve(desc.get('W'), objs) : undefined;
    if (Array.isArray(w)) {
      for (let i = 0; i < w.length; ) {
        const a = resolve(w[i], objs);
        const b = resolve(w[i + 1], objs);
        if (typeof a !== 'number') break;
        if (Array.isArray(b)) {
          b.forEach((x, j) => widths.set(a + j, num(resolve(x, objs), dw)));
          i += 2;
        } else {
          const c = resolve(w[i + 2], objs);
          if (typeof b === 'number' && typeof c === 'number') for (let k = a; k <= b; k++) widths.set(k, c);
          i += 3;
        }
      }
    }
    return {
      twoByte: true,
      toUni: (c) => uni?.get(c) ?? (c >= 32 && c < 0xd800 ? String.fromCharCode(c) : ''),
      width: (c) => widths.get(c) ?? dw,
    };
  }

  const enc = simpleEncoding(resolve(f.get('Encoding'), objs), objs);
  const first = num(resolve(f.get('FirstChar'), objs), 0);
  const ws = resolve(f.get('Widths'), objs);
  const wArr = Array.isArray(ws) ? ws.map((x) => num(resolve(x, objs), 0)) : null;
  const fd = resolve(f.get('FontDescriptor'), objs);
  const missing = fd instanceof Dict ? num(resolve(fd.get('MissingWidth'), objs), 0) : 0;
  // Standard-14 fonts carry no /Widths: Courier is fixed 600; else a typical average.
  const fallback = /Courier|Mono/i.test(base) ? 600 : /Times|Serif/i.test(base) ? 500 : 556;
  return {
    twoByte: false,
    toUni: (c) => uni?.get(c) ?? enc[c] ?? '',
    width: (c) => (wArr && c >= first && c < first + wArr.length ? wArr[c - first]! : missing || fallback),
  };
}

// ---------- content streams ----------
type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const shift = (tx: number, ty: number): M => [1, 0, 0, 1, tx, ty];

/** A run of text at a device position (y up), with its end x for gap tests. */
interface Item {
  x: number;
  y: number;
  end: number;
  size: number;
  text: string;
}

interface Ctx {
  objs: Objs;
  fonts: Map<Dict, Font>;
  items: Item[];
}

async function runContent(content: string, res: Dict | undefined, ctm0: M, ctx: Ctx, depth: number): Promise<void> {
  const { objs } = ctx;
  const fontRes = res ? resolve(res.get('Font'), objs) : undefined;
  const xobjRes = res ? resolve(res.get('XObject'), objs) : undefined;
  const lx = new Lexer(content);
  let args: Val[] = [];
  let ctm = ctm0;
  let tm: M = ID;
  let tlm: M = ID;
  let font: Font = FALLBACK_FONT;
  let fs = 0;
  let tc = 0;
  let tw = 0;
  let th = 1;
  let tl = 0;
  const stack: Array<[M, Font, number, number, number, number, number]> = [];

  const td = (x: number, y: number) => {
    tlm = mul(shift(x, y), tlm);
    tm = tlm;
  };
  const show = (str: string) => {
    const trm = mul(tm, ctm);
    const size = Math.abs(fs) * Math.hypot(trm[2], trm[3]) || Math.abs(fs) || 10;
    const step = font.twoByte ? 2 : 1;
    let text = '';
    for (let i = 0; i + step <= str.length; i += step) {
      const code = step === 2 ? (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1) : str.charCodeAt(i);
      text += font.toUni(code);
      const adv = ((font.width(code) / 1000) * fs + tc + (step === 1 && code === 32 ? tw : 0)) * th;
      tm = mul(shift(adv, 0), tm);
    }
    if (text) ctx.items.push({ x: trm[4], y: trm[5], end: mul(tm, ctm)[4], size, text });
  };

  for (;;) {
    const t = lx.next();
    if (t === undefined) break;
    if (!(t instanceof Op)) {
      args.push(t);
      continue;
    }
    const a = args;
    args = [];
    const n = (i: number) => num(a[i], 0);
    switch (t.v) {
      case 'q':
        stack.push([ctm, font, fs, tc, tw, th, tl]);
        break;
      case 'Q': {
        const s = stack.pop();
        if (s) [ctm, font, fs, tc, tw, th, tl] = s;
        break;
      }
      case 'cm':
        ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], ctm);
        break;
      case 'BT':
        tm = tlm = ID;
        break;
      case 'Tf': {
        const fd = a[0] instanceof Name && fontRes instanceof Dict ? resolve(fontRes.get(a[0].v), objs) : undefined;
        if (fd instanceof Dict) {
          let f = ctx.fonts.get(fd);
          if (!f) {
            f = await buildFont(fd, objs);
            ctx.fonts.set(fd, f);
          }
          font = f;
        } else font = FALLBACK_FONT;
        fs = n(1);
        break;
      }
      case 'Tc':
        tc = n(0);
        break;
      case 'Tw':
        tw = n(0);
        break;
      case 'Tz':
        th = n(0) / 100;
        break;
      case 'TL':
        tl = n(0);
        break;
      case 'Td':
        td(n(0), n(1));
        break;
      case 'TD':
        tl = -n(1);
        td(n(0), n(1));
        break;
      case 'Tm':
        tlm = tm = [n(0), n(1), n(2), n(3), n(4), n(5)];
        break;
      case 'T*':
        td(0, -tl);
        break;
      case 'Tj':
        if (a[0] instanceof Str) show(a[0].v);
        break;
      case "'":
        td(0, -tl);
        if (a[0] instanceof Str) show(a[0].v);
        break;
      case '"':
        tw = n(0);
        tc = n(1);
        td(0, -tl);
        if (a[2] instanceof Str) show(a[2].v);
        break;
      case 'TJ':
        for (const el of toArray(a[0])) {
          if (el instanceof Str) show(el.v);
          else if (typeof el === 'number') tm = mul(shift((-el / 1000) * fs * th, 0), tm);
        }
        break;
      case 'ID': {
        // inline image data runs to the next whitespace-delimited EI
        const ei = /\sEI(?=\s|$)/g;
        ei.lastIndex = lx.pos;
        const r = ei.exec(content);
        lx.pos = r ? r.index + 3 : content.length;
        break;
      }
      case 'Do': {
        if (depth > 8 || !(a[0] instanceof Name) || !(xobjRes instanceof Dict)) break;
        const xo = resolve(xobjRes.get(a[0].v), objs);
        if (!(xo instanceof Stream) || nameOf(xo.dict.get('Subtype')) !== 'Form') break;
        const body = await decodeStream(xo, objs);
        if (!body) break;
        const mx = resolve(xo.dict.get('Matrix'), objs);
        const fm = Array.isArray(mx) && mx.length === 6 ? (mx.map((v) => num(resolve(v, objs), 0)) as M) : ID;
        const xres = resolve(xo.dict.get('Resources'), objs);
        await runContent(body, xres instanceof Dict ? xres : res, mul(fm, ctm), ctx, depth + 1);
        break;
      }
    }
  }
}

// ---------- pages ----------
function pageList(objs: Objs): Array<{ page: Dict; res: Dict | undefined }> {
  let catalog: Dict | undefined;
  for (const v of objs.values()) if (v instanceof Dict && nameOf(v.get('Type')) === 'Catalog') catalog = v;
  const out: Array<{ page: Dict; res: Dict | undefined }> = [];
  const seen = new Set<Dict>();
  const walk = (node: Val | undefined, inherited: Dict | undefined, depth: number) => {
    const d = resolve(node, objs);
    if (!(d instanceof Dict) || seen.has(d) || depth > 64) return;
    seen.add(d);
    const r = resolve(d.get('Resources'), objs);
    const res = r instanceof Dict ? r : inherited;
    const kids = resolve(d.get('Kids'), objs);
    if (Array.isArray(kids)) for (const k of kids) walk(k, res, depth + 1);
    else out.push({ page: d, res });
  };
  if (catalog) walk(catalog.get('Pages'), undefined, 0);
  if (!out.length) {
    // no usable page tree: every page object, in object-number order
    for (const [, v] of [...objs.entries()].sort((x, y) => x[0] - y[0])) {
      if (v instanceof Dict && nameOf(v.get('Type')) === 'Page') {
        const r = resolve(v.get('Resources'), objs);
        out.push({ page: v, res: r instanceof Dict ? r : undefined });
      }
    }
  }
  return out;
}

async function pageContent(page: Dict, objs: Objs): Promise<string> {
  let s = '';
  for (const part of toArray(resolve(page.get('Contents'), objs))) {
    const st = resolve(part, objs);
    if (st instanceof Stream) s += ((await decodeStream(st, objs)) ?? '') + '\n';
  }
  return s;
}

/** Group runs into lines (top to bottom), order each line left to right, and
 *  join runs with a space where there is a visible gap between them. */
function linesOf(items: Item[]): string[] {
  const sorted = items.slice().sort((p, q) => q.y - p.y || p.x - q.x);
  const lines: Item[][] = [];
  for (const it of sorted) {
    const cur = lines[lines.length - 1];
    const tol = Math.max(1.5, 0.4 * Math.min(it.size, cur?.[0]?.size ?? it.size));
    if (cur && Math.abs(cur[0]!.y - it.y) <= tol) cur.push(it);
    else lines.push([it]);
  }
  const out: string[] = [];
  for (const line of lines) {
    line.sort((p, q) => p.x - q.x);
    let s = '';
    let prevEnd = -Infinity;
    for (const it of line) {
      if (s && it.x - prevEnd > 0.2 * it.size && !s.endsWith(' ') && !it.text.startsWith(' ')) s += ' ';
      s += it.text;
      prevEnd = Math.max(prevEnd, it.end);
    }
    const t = s.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trimEnd();
    if (t) out.push(t);
  }
  return out;
}

/** Extract the text of a PDF, page by page, lines in visual reading order. */
export async function pdfToText(data: ArrayBuffer | Uint8Array): Promise<string> {
  const src = fromBytes(data instanceof Uint8Array ? data : new Uint8Array(data));
  if (src.indexOf('%PDF') < 0) throw new Error('not a PDF file');
  if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(src)) {
    throw new Error('this PDF is encrypted — paste the OFP text instead');
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('PDF reading needs a newer iOS — paste the OFP text instead');
  }
  const { objs, direct, objStms } = scanObjects(src);
  await expandObjStms(objs, direct, objStms);
  const ctx: Ctx = { objs, fonts: new Map(), items: [] };
  let out = '';
  for (const { page, res } of pageList(objs)) {
    ctx.items = [];
    await runContent(await pageContent(page, objs), res, ID, ctx, 0);
    const lines = linesOf(ctx.items);
    if (lines.length) out += lines.join('\n') + '\n';
  }
  if (!out.trim()) throw new Error('no text found in this PDF (scanned image?) — paste the OFP text instead');
  return out;
}
