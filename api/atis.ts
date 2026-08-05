/**
 * Edge proxy for D-ATIS (datis.clowd.io). Digital ATIS is US-only via this
 * source; for other airports the client falls back to a METAR-derived summary.
 * Query: ?id=KJFK
 */
export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const id = (new URL(req.url).searchParams.get('id') || '').toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(id)) return json({ atis: null, error: 'bad id' }, 400);

  try {
    const r = await fetch(`https://datis.clowd.io/api/${id}`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) return json({ atis: null });
    const data = (await r.json()) as Array<{ type?: string; code?: string; datis?: string }>;
    if (!Array.isArray(data) || data.length === 0) return json({ atis: null });
    // Prefer a combined/arrival ATIS; fall back to the first entry.
    const pick = data.find((d) => d.type === 'combined') ?? data.find((d) => d.type === 'arr') ?? data[0];
    return json({ atis: pick?.datis ?? null, code: pick?.code ?? null }, 200, 'public, s-maxage=60');
  } catch {
    return json({ atis: null });
  }
}

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}
