import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { pdfToText } from '../src/data/pdf-text.js';
import { extractOfp } from '../src/data/ofp.js';

// --- a tiny PDF writer, so each test controls the exact structure ---
const bytesOf = (s: string) => Buffer.from(s, 'latin1');

function pdf(objs: string[], trailerExtra = ''): Uint8Array {
  let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const offs: number[] = [];
  objs.forEach((body, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(bytesOf(out));
}

function stream(dict: string, content: string, flate = false): string {
  const body = flate ? deflateSync(bytesOf(content)) : bytesOf(content);
  return `<< ${dict} /Length ${body.length}${flate ? ' /Filter /FlateDecode' : ''} >>\nstream\n${body.toString('latin1')}\nendstream`;
}

/** One page, Courier as /F1 (inherited from the Pages node), given content. */
function onePage(content: string, flate = false): Uint8Array {
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    stream('', content, flate),
  ]);
}

describe('pdfToText', () => {
  it('rebuilds lines in visual order, whatever order they were drawn in', async () => {
    const t = await pdfToText(
      onePage('BT /F1 10 Tf 72 700 Td (QR377 OTHH/UZTT) Tj ET BT /F1 10 Tf 72 720 Td (FLIGHT DISPATCH) Tj ET'),
    );
    expect(t.trim().split('\n')).toEqual(['FLIGHT DISPATCH', 'QR377 OTHH/UZTT']);
  });

  it('joins separately placed columns on one row with a space', async () => {
    const t = await pdfToText(onePage('BT /F1 10 Tf 72 700 Td (TRIP) Tj 100 0 Td (11344) Tj ET'));
    expect(t.trim()).toBe('TRIP 11344');
  });

  it('merges character-by-character placement back into words', async () => {
    // Courier 10pt = 6pt per glyph; each glyph positioned on its own
    const t = await pdfToText(onePage('BT /F1 10 Tf 72 700 Td (G) Tj 6 0 Td (N) Tj 6 0 Td (D) Tj ET'));
    expect(t.trim()).toBe('GND');
  });

  it('turns large TJ kerning into a space, small kerning into nothing', async () => {
    const t = await pdfToText(onePage('BT /F1 10 Tf 72 700 Td [(GND) -2000 (DIST)] TJ 0 -20 Td [(AB) -10 (C)] TJ ET'));
    expect(t.trim().split('\n')).toEqual(['GND DIST', 'ABC']);
  });

  it('handles TL / T* / quote operators and escaped literal strings', async () => {
    const t = await pdfToText(onePage("BT /F1 10 Tf 12 TL 72 700 Td (A \\(B\\)) Tj T* (C\\\\D) Tj (E\\101) ' ET"));
    expect(t.trim().split('\n')).toEqual(['A (B)', 'C\\D', 'EA']);
  });

  it('inflates Flate content streams', async () => {
    const t = await pdfToText(onePage('BT /F1 10 Tf 72 700 Td (COMPRESSED OK) Tj ET', true));
    expect(t.trim()).toBe('COMPRESSED OK');
  });

  it('reads compressed object streams and an indirect /Length', async () => {
    const bodies = [
      '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 3 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    ];
    let header = '';
    let objsPart = '';
    bodies.forEach((b, i) => {
      header += `${i + 3} ${objsPart.length} `;
      objsPart += b + '\n';
    });
    const objStmData = header + '\n' + objsPart;
    const first = header.length + 1;
    const content = deflateSync(bytesOf('BT /F1 9 Tf 50 600 Td (FROM AN OBJECT STREAM) Tj ET'));
    const file = pdf([
      '<< /Type /Catalog /Pages 3 0 R >>',
      stream(`/Type /ObjStm /N 3 /First ${first}`, objStmData, true),
      '<< /Type /Placeholder >>', // 3..5 live in the object stream
      '<< /Type /Placeholder >>',
      '<< /Type /Placeholder >>',
      `<< /Length 7 0 R /Filter /FlateDecode >>\nstream\n${content.toString('latin1')}\nendstream`,
      String(content.length),
    ]);
    // the placeholders are direct objects and would win; drop them to mirror a real ObjStm file
    const src = Buffer.from(file).toString('latin1').replace(/\d+ 0 obj\n<< \/Type \/Placeholder >>\nendobj\n/g, '');
    const t = await pdfToText(new Uint8Array(bytesOf(src)));
    expect(t.trim()).toBe('FROM AN OBJECT STREAM');
  });

  it('decodes Identity-H (two-byte) fonts through a ToUnicode CMap', async () => {
    const cmap =
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n' +
      '1 begincodespacerange <0000> <FFFF> endcodespacerange\n' +
      '1 beginbfchar <0001> <004F> endbfchar\n' +
      '1 beginbfrange <0002> <0003> <0054> endbfrange\n' + // 2->T, 3->U
      '1 beginbfrange <0004> <0004> [<0048>] endbfrange\n' + // 4->H
      'endcmap end end';
    const file = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F2 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Arial /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
      stream('', 'BT /F2 12 Tf 50 500 Td <0001000200040004> Tj ET', true),
      '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Arial /DW 600 /W [1 [700 600] 3 4 650] >>',
      stream('', cmap, true),
    ]);
    expect((await pdfToText(file)).trim()).toBe('OTHH');
  });

  it('applies /Differences on simple fonts', async () => {
    const file = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding << /Differences [65 /B /A /one] >> >>',
      stream('', 'BT /F1 10 Tf 72 700 Td (ABC) Tj ET'),
    ]);
    expect((await pdfToText(file)).trim()).toBe('BA1');
  });

  it('follows text drawn inside form XObjects', async () => {
    const file = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> /XObject << /X1 6 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
      stream('', 'q 1 0 0 1 0 100 cm /X1 Do Q BT /F1 10 Tf 72 700 Td (PAGE TEXT) Tj ET'),
      stream('/Type /XObject /Subtype /Form /BBox [0 0 612 792]', 'BT /F1 10 Tf 72 700 Td (HEADER IN FORM) Tj ET'),
    ]);
    expect((await pdfToText(file)).trim().split('\n')).toEqual(['HEADER IN FORM', 'PAGE TEXT']);
  });

  it('keeps pages in page-tree order', async () => {
    const file = pdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [4 0 R 3 0 R] /Count 2 /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
      '<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
      stream('', 'BT /F1 10 Tf 72 700 Td (PAGE TWO) Tj ET'),
      stream('', 'BT /F1 10 Tf 72 700 Td (PAGE ONE) Tj ET'),
    ]);
    expect((await pdfToText(file)).trim().split('\n')).toEqual(['PAGE ONE', 'PAGE TWO']);
  });

  it('rejects an encrypted PDF with a message pointing to the paste fallback', async () => {
    const file = pdf(
      ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', '<< /Filter /Standard /V 2 /R 3 >>'],
      '/Encrypt 3 0 R ',
    );
    await expect(pdfToText(file)).rejects.toThrow(/encrypted.*paste/);
  });

  it('rejects a non-PDF', async () => {
    await expect(pdfToText(new Uint8Array(bytesOf('hello')))).rejects.toThrow(/not a PDF/);
  });

  it('feeds the OFP parser end to end', async () => {
    const content = [
      'BT /F1 9 Tf 40 760 Td (QTR 377/30Aug26/OTHH-UZTT Reg:A7AHL OFP:6/0/0) Tj ET',
      'BT /F1 9 Tf 40 740 Td (OTHH/16R) Tj 60 0 Td (UZTT/26R) Tj ET',
      'BT /F1 9 Tf 40 720 Td (FUEL) Tj 40 0 Td (TIME) Tj 40 0 Td (FUEL ADJ) Tj 60 0 Td (GND DIST) Tj 90 0 Td (1883) Tj ET',
      'BT /F1 9 Tf 40 708 Td (TRIP) Tj 40 0 Td (11344) Tj 40 0 Td (0418) Tj 100 0 Td (AIR DIST) Tj 90 0 Td (1879) Tj ET',
    ].join('\n');
    const text = await pdfToText(onePage(content, true));
    const x = extractOfp(text, { isAirport: (id) => ['OTHH', 'UZTT'].includes(id) });
    expect(x.adep).toBe('OTHH');
    expect(x.ades).toBe('UZTT');
    expect(x.groundDistanceNm).toBe(1883);
    expect(x.airDistanceNm).toBe(1879);
  });
});
