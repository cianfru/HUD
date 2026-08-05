/**
 * Edge proxy for aviationweather.gov METAR + TAF (NOAA, free, global).
 *
 * The upstream API sends no CORS header, so a browser can't call it directly;
 * this same-origin function fetches it and adds caching. Query: ?ids=EGLL,EGKK
 */
export const config = { runtime: 'edge' };

const BASE = 'https://aviationweather.gov/api/data';

export default async function handler(req: Request): Promise<Response> {
  const ids = (new URL(req.url).searchParams.get('ids') || '')
    .toUpperCase()
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{3,4}$/.test(s))
    .slice(0, 20)
    .join(',');

  if (!ids) return json({ error: 'no ids' }, 400);

  try {
    const [metars, tafs] = await Promise.all([
      fetchJson(`${BASE}/metar?ids=${ids}&format=json`),
      fetchJson(`${BASE}/taf?ids=${ids}&format=json`),
    ]);
    return json(
      { metars, tafs, fetchedAt: new Date().toISOString() },
      200,
      'public, s-maxage=120, stale-while-revalidate=600',
    );
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}
