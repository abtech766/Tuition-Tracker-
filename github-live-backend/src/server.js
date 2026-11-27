import express from 'express';
import { GitHubStore } from './github-store.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
const origin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });

let store;
function getStore() { return store || (store = new GitHubStore()); }
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });
    const token = header.slice(7);
    const base = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!base || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(401).json({ error: 'Invalid Supabase session' });
    req.user = await r.json();
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}
function cleanFilters(filters = {}) { const copy = { ...filters }; delete copy.password; delete copy.password_hash; return copy; }
app.get('/health', (_req, res) => res.json({ ok: true, service: 'tuitiontracker-github-live-backend' }));
app.use('/v1', auth);
app.get('/v1/storage/status', async (_req, res) => { try { res.json({ data: await getStore().status(), error: null }); } catch (e) { res.status(500).json({ data: null, error: e.message }); } });
app.post('/v1/data/:table/query', async (req, res) => { try { const body = req.body || {}; const filters = cleanFilters(body.filters || {}); if (body.asUser) filters.owner_id = req.user.id; const data = await getStore().query(req.params.table, filters, body.order, body.limit, body.single); res.json({ data, error: null }); } catch (e) { res.status(400).json({ data: null, error: e.message }); } });
app.post('/v1/data/:table/insert', async (req, res) => { try { const record = { ...(req.body?.record || {}), owner_id: req.user.id }; const data = await getStore().insert(req.params.table, record); res.status(201).json({ data, error: null }); } catch (e) { res.status(400).json({ data: null, error: e.message }); } });
app.patch('/v1/data/:table/update', async (req, res) => { try { await getStore().update(req.params.table, { ...(req.body?.filters || {}), owner_id: req.user.id }, req.body?.changes || {}); res.json({ data: null, error: null }); } catch (e) { res.status(400).json({ data: null, error: e.message }); } });
app.delete('/v1/data/:table/delete', async (req, res) => { try { await getStore().remove(req.params.table, { ...(req.body?.filters || {}), owner_id: req.user.id }); res.json({ data: null, error: null }); } catch (e) { res.status(400).json({ data: null, error: e.message }); } });
app.post('/v1/rpc/mark_attendance', async (req, res) => {
  try {
    const p = req.body || {}, day = new Date().toISOString().slice(0, 10), filters = { classroom_id: p.p_classroom, student_id: p.p_student, day };
    const rows = await getStore().query('attendance', filters, null, 2, false);
    if (rows[0]) await getStore().writeExisting('attendance', rows[0].id, { ...rows[0], status: p.p_status, marked_at: new Date().toISOString() });
    else await getStore().insert('attendance', { ...filters, status: p.p_status, owner_id: req.user.id, marked_at: new Date().toISOString() });
    res.json({ data: null, error: null });
  } catch (e) { res.status(400).json({ data: null, error: e.message }); }
});
app.post('/v1/rpc/delete_my_account', async (req, res) => {
  try {
    const tables = ['profiles', 'students', 'classrooms', 'enrollments', 'attendance', 'homework', 'notifications'];
    for (const table of tables) await getStore().remove(table, { owner_id: req.user.id });
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for account deletion');
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${req.user.id}`, { method: 'DELETE', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!r.ok) throw new Error(`Supabase account deletion failed: ${await r.text()}`);
    res.json({ data: null, error: null });
  } catch (e) { res.status(400).json({ data: null, error: e.message }); }
});
app.post('/v1/storage/upload', async (req, res) => {
  try { const p = req.body || {}; const data = await getStore().insert('__files__', { id: p.path, path: p.path, bucket: p.bucket, contentType: p.contentType || 'application/octet-stream', content: p.content, owner_id: req.user.id }); res.status(201).json({ data: { path: data.path }, error: null }); }
  catch (e) { res.status(400).json({ data: null, error: e.message }); }
});
app.get('/v1/storage/view', async (req, res) => {
  try {
    const token = String(req.query.token || ''), base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
    const check = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!check.ok) return res.sendStatus(401);
    const rows = await getStore().query('__files__', { path: String(req.query.path || '') }, null, 1, false);
    if (!rows[0]) return res.sendStatus(404);
    res.setHeader('Content-Type', rows[0].contentType || 'application/octet-stream'); res.send(Buffer.from(rows[0].content, 'base64'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use((err, _req, res, _next) => res.status(500).json({ error: err.message || 'Internal server error' }));
const port = Number(process.env.PORT || 10000);
app.listen(port, '0.0.0.0', () => console.log(`GitHub live backend listening on ${port}`));
