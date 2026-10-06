// Faux Supabase en mémoire (auth + PostgREST + RPC) pour les tests de bout en bout.
// Vérifie aussi l'appartenance au foyer (équivalent des règles RLS).
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
export function createMock({ legacy = false, missingTables = [] } = {}) {
  const db = { users: {}, households: {}, members: [], invitations: {}, user_data: {}, tables: {} };
  let clock = Date.parse('2026-10-06T08:00:00Z');
  const now = () => new Date((clock += 7)).toISOString().replace('Z', '+00:00');
  const uid = () => crypto.randomUUID();
  const tokens = {};
  const session = (u) => { const t = 'tok-' + u.id; tokens[t] = u.id; return { access_token: t, refresh_token: 'ref-' + u.id, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' } }; };
  const isMember = (hid, u) => db.members.some((m) => m.household_id === hid && m.user_id === u);
  const stats = { upserts: 0, selects: 0 };
  async function handle(route) {
    if (api.down) return route.abort('internetdisconnected');
    const req = route.request(); const url = new URL(req.url()); const m = req.method(); const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: H });
    const auth = (req.headers()['authorization'] || '').replace('Bearer ', '');
    const me = tokens[auth];
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch { return null; } };
    // ── auth
    if (path === '/auth/v1/signup') { const b = body(); if (Object.values(db.users).some((u) => u.email === b.email)) return json({ code: 'user_already_exists', msg: 'User already registered' }, 422); const u = { id: uid(), email: b.email, password: b.password }; db.users[u.id] = u; return json(session(u)); }
    if (path === '/auth/v1/token') { const b = body(); const u = Object.values(db.users).find((x) => x.email === b.email && x.password === b.password); if (!u) return json({ error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' }, 400); return json(session(u)); }
    if (path === '/auth/v1/user') return me ? json({ id: me, email: db.users[me].email, aud: 'authenticated' }) : json({ msg: 'no' }, 401);
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: H });
    if (path === '/auth/v1/otp') return json({});
    // ── legacy
    if (path === '/rest/v1/user_data') {
      if (m === 'GET') { const row = db.user_data[me]; const acc = req.headers()['accept'] || ''; if (acc.includes('pgrst.object')) return row ? json(row) : json({ code: 'PGRST116', message: 'no rows' }, 406); return json(row ? [row] : []); }
      if (m === 'POST') { const b = body(); const r = Array.isArray(b) ? b[0] : b; db.user_data[me] = { ...r, updated_at: now() }; return route.fulfill({ status: 201, headers: H, body: '' }); }
      if (m === 'DELETE') { delete db.user_data[me]; return route.fulfill({ status: 204, headers: H }); }
    }
    if (legacy && (path.startsWith('/rest/v1/house') || path.startsWith('/rest/v1/rpc'))) return json({ code: 'PGRST205', message: "Could not find the table 'public.household_members' in the schema cache" }, 404);
    if (!me) return json({ message: 'JWT required' }, 401);
    // ── RPC
    if (path === '/rest/v1/rpc/create_household') { const b = body(); const id = uid(); db.households[id] = { id, name: b.p_name || 'Mon foyer' }; db.members.push({ household_id: id, user_id: me, role: 'proprietaire', display_name: b.p_display_name }); return json(id); }
    if (path === '/rest/v1/rpc/create_invitation') { const b = body(); if (!isMember(b.p_household, me)) return json({ message: 'foyer inaccessible' }, 400); const code = Math.random().toString(36).slice(2, 10).toUpperCase(); db.invitations[code] = { household_id: b.p_household }; return json(code); }
    if (path === '/rest/v1/rpc/join_household') { const b = body(); const inv = db.invitations[b.p_code]; if (!inv) return json({ code: 'P0001', message: 'invitation invalide ou expirée' }, 400); if (!isMember(inv.household_id, me)) db.members.push({ household_id: inv.household_id, user_id: me, role: 'membre', display_name: b.p_display_name }); return json(inv.household_id); }
    // ── tables
    const t = path.replace('/rest/v1/', '');
    const q = url.searchParams;
    if (t === 'household_members') {
      if (m === 'GET') {
        let rows = db.members.filter((r) => isMember(r.household_id, me));
        if (q.get('user_id')) rows = rows.filter((r) => r.user_id === q.get('user_id').slice(3));
        if (q.get('household_id')) rows = rows.filter((r) => r.household_id === q.get('household_id').slice(3));
        return json(rows.map((r) => ({ ...r, households: { name: db.households[r.household_id].name } })));
      }
      if (m === 'DELETE') { db.members = db.members.filter((r) => !(r.user_id === me && r.household_id === q.get('household_id').slice(3))); return route.fulfill({ status: 204, headers: H }); }
    }
    if (t === 'households') {
      const hid = (q.get('id') || '').slice(3);
      if (!isMember(hid, me)) return json([]);
      if (m === 'GET') { const acc = req.headers()['accept'] || ''; const r = db.households[hid]; return acc.includes('pgrst.object') ? json(r) : json([r]); }
      if (m === 'PATCH') { Object.assign(db.households[hid], body()); return route.fulfill({ status: 204, headers: H }); }
    }
    if (missingTables.includes(t)) return json({ code: 'PGRST205', message: `Could not find the table 'public.${t}' in the schema cache` }, 404);
    const tab = (db.tables[t] ??= {});
    if (m === 'POST') {
      stats.upserts++;
      const rows = [].concat(body());
      for (const r of rows) { if (!isMember(r.household_id, me)) return json({ code: '42501', message: 'new row violates row-level security policy' }, 403); tab[r.household_id + '|' + r.id] = { ...r, updated_at: now(), updated_by: me }; }
      return route.fulfill({ status: 201, headers: H, body: '' });
    }
    if (m === 'GET') {
      stats.selects++;
      const hid = (q.get('household_id') || '').slice(3);
      if (!isMember(hid, me)) return json([]);
      let rows = Object.values(tab).filter((r) => r.household_id === hid);
      const gt = q.get('updated_at'); if (gt) rows = rows.filter((r) => r.updated_at > gt.slice(3));
      rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id));
      const off = Number(q.get('offset') || 0), lim = Number(q.get('limit') || 1000);
      return json(rows.slice(off, off + lim).map(({ id, data, deleted, updated_at }) => ({ id, data, deleted, updated_at })));
    }
    console.log('MOCK UNHANDLED', m, path); return json({}, 404);
  }
  const api = { db, handle, stats, down: false };
  return api;
}
