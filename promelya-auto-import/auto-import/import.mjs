// Import automatique des offres Promelya (gratuit, via GitHub Actions)
const { SUPABASE_URL, SERVICE_KEY, FEED_URL } = process.env;
const H = SERVICE_KEY.startsWith('sb_') ? { apikey: SERVICE_KEY, 'Content-Type': 'application/json' } : { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
const API = `${SUPABASE_URL}/rest/v1/deals`;

// 1. Garde Supabase actif (évite la mise en pause du plan gratuit)
await fetch(`${API}?select=id&limit=1`, { headers: H });

// 2. Récupère le flux (adapter le mapping ci-dessous au vrai flux)
const res = await fetch(FEED_URL);
if (!res.ok) throw new Error('Flux inaccessible : ' + res.status);
const feed = await res.json();
const items = Array.isArray(feed) ? feed : (feed.items || feed.products || []);
const seen = new Set();
const rows = items.map(x => ({
  external_id: 'auto-' + x.id,
  title: String(x.title || '').slice(0, 120),
  merchant: x.merchant || 'Marchand',
  category: x.category || 'High-tech',
  price: Number(x.price),
  old_price: x.old_price ? Number(x.old_price) : null,
  url: x.url,
  code: x.code || null,
  description: x.description || null,
  status: 'approved',
  source: 'auto',
  expires_at: x.expires || null,
})).filter(r => r.title.length >= 3 && r.price >= 0 && r.url
  && (!r.old_price || (1 - r.price / r.old_price) >= 0.15)
  && !seen.has(r.external_id) && seen.add(r.external_id));

// 3. Enregistre (met à jour si l'offre existe déjà)
if (rows.length) {
  const r = await fetch(`${API}?on_conflict=external_id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error('Supabase : ' + await r.text());
}

// 4. Retire les offres expirées
await fetch(`${API}?source=eq.auto&status=eq.approved&expires_at=lt.${new Date().toISOString()}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ status: 'expired' }) });
console.log(rows.length + ' offres importées');
