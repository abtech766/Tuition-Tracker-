const API = 'https://api.github.com';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export class GitHubStore {
  constructor() {
    this.owner = required('GITHUB_OWNER');
    this.token = required('GITHUB_TOKEN');
    this.branch = process.env.GITHUB_BRANCH || 'main';
    this.repos = (process.env.GITHUB_REPOS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (!this.repos.length) throw new Error('GITHUB_REPOS must contain at least one repository');
    this.registryRepo = process.env.GITHUB_REGISTRY_REPO || this.repos[0];
    this.threshold = Number(process.env.STORAGE_SWITCH_THRESHOLD_BYTES || 900000000);
    this.headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
    this.lock = Promise.resolve();
  }
  async request(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...this.headers, ...(options.headers || {}) } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  async repoInfo(repo) { return this.request(`/repos/${this.owner}/${repo}`); }
  async getFile(repo, path) {
    const data = await this.request(`/repos/${this.owner}/${repo}/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
    if (!data || Array.isArray(data)) return { value: null, sha: null };
    return { value: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha };
  }
  async putFile(repo, path, value, message, sha = null) {
    const body = { message, content: Buffer.from(JSON.stringify(value, null, 2) + '\n').toString('base64'), branch: this.branch };
    if (sha) body.sha = sha;
    return this.request(`/repos/${this.owner}/${repo}/contents/${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  async deleteFile(repo, path, message, sha) {
    return this.request(`/repos/${this.owner}/${repo}/contents/${path}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sha, branch: this.branch }) });
  }
  async manifest() { return (await this.getFile(this.registryRepo, '.tuition/manifest.json')).value || { version: 1, records: {} }; }
  async saveManifest(value, sha) { return this.putFile(this.registryRepo, '.tuition/manifest.json', value, 'chore: update live data manifest', sha); }
  async withLock(fn) { const run = this.lock.then(fn, fn); this.lock = run.catch(() => {}); return run; }
  async selectRepo() {
    for (const repo of this.repos) {
      const info = await this.repoInfo(repo);
      // GitHub reports repository size in KB; use it only as a switching signal.
      if (info && Number(info.size || 0) * 1024 < this.threshold) return repo;
    }
    throw new Error('All configured GitHub repositories crossed the storage threshold');
  }
  async status() {
    const repositories = [];
    for (const repo of this.repos) { const info = await this.repoInfo(repo); repositories.push({ name: repo, sizeBytesApprox: Number(info?.size || 0) * 1024, status: info ? 'available' : 'missing' }); }
    const manifest = await this.manifest();
    return { repositories, recordCount: Object.keys(manifest.records || {}).length, thresholdBytes: this.threshold };
  }
  async query(table, filters = {}, order = null, limit = 100, single = false) {
    const manifest = await this.manifest();
    const entries = Object.values(manifest.records || {}).filter(x => x.table === table);
    const rows = [];
    for (const entry of entries) {
      const file = await this.getFile(entry.repo, entry.path);
      if (!file.value) continue;
      const matches = Object.entries(filters).every(([key, value]) => value === null ? file.value[key] == null : String(file.value[key]) === String(value));
      if (matches) rows.push(file.value);
    }
    if (order?.field) rows.sort((a, b) => String(a[order.field] ?? '').localeCompare(String(b[order.field] ?? '')) * (order.ascending === false ? -1 : 1));
    const result = rows.slice(0, Math.max(1, Math.min(Number(limit) || 100, 1000)));
    if (single && result.length !== 1) throw new Error('Record not found');
    return single ? result[0] : result;
  }
  async insert(table, record) { return this.withLock(async () => {
    const manifestFile = await this.getFile(this.registryRepo, '.tuition/manifest.json');
    const manifest = manifestFile.value || { version: 1, records: {} };
    const id = record.id || crypto.randomUUID();
    const value = { ...record, id, created_at: record.created_at || new Date().toISOString() };
    const repo = await this.selectRepo();
    const path = `records/${table}/${id}.json`;
    await this.putFile(repo, path, value, `data: insert ${table}/${id}`);
    manifest.records[id] = { id, table, repo, path };
    await this.saveManifest(manifest, manifestFile.sha);
    return value;
  }); }
  async update(table, filters, changes) { const rows = await this.query(table, filters, null, 1000, false); for (const row of rows) await this.writeExisting(table, row.id, { ...row, ...changes, updated_at: new Date().toISOString() }); return null; }
  async writeExisting(table, id, value) { return this.withLock(async () => { const mf = await this.getFile(this.registryRepo, '.tuition/manifest.json'); const m = mf.value || { version: 1, records: {} }; const e = m.records[id]; if (!e || e.table !== table) throw new Error('Record location not found'); const current = await this.getFile(e.repo, e.path); await this.putFile(e.repo, e.path, value, `data: update ${table}/${id}`, current.sha); await this.saveManifest(m, mf.sha); }); }
  async remove(table, filters) { const rows = await this.query(table, filters, null, 1000, false); for (const row of rows) await this.withLock(async () => { const mf = await this.getFile(this.registryRepo, '.tuition/manifest.json'); const m = mf.value || { version: 1, records: {} }; const e = m.records[row.id]; const current = await this.getFile(e.repo, e.path); if (current.sha) await this.deleteFile(e.repo, e.path, `data: delete ${table}/${row.id}`, current.sha); delete m.records[row.id]; await this.saveManifest(m, mf.sha); }); return null; }
}
