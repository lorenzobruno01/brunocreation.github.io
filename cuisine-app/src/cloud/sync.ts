// ─────────────────────────────────────────────────────────────
// Comptes, foyers et synchronisation.
//
// Les données vivent d'abord dans le téléphone (IndexedDB) : l'appli
// marche hors ligne. Une fois connecté, chaque table locale est reliée
// à une table Supabase du foyer, élément par élément :
//   - chaque modification locale part dans une file d'envoi (outbox),
//     rejouée dès que le réseau est là ;
//   - les modifications des autres membres arrivent en temps réel
//     (Supabase Realtime), avec un relevé périodique en secours ;
//   - en cas de conflit sur un même élément, la dernière écriture gagne.
// Si la migration « foyers » n'a pas encore été exécutée sur le serveur,
// l'appli continue avec l'ancien mode (une copie complète par compte).
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient, type User } from '@supabase/supabase-js';
import { liveQuery } from 'dexie';
import { BACKUP_TABLES, db, importData, snapshotData, wipeLocalData, type BackupTable, type Snapshot } from '../db/db';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Table locale → table du foyer */
export const REMOTE: Record<BackupTable, string> = {
  settings: 'household_settings',
  profiles: 'profiles',
  plan: 'meal_plans',
  shopping: 'shopping_items',
  pantry: 'pantry_items',
  fridge: 'fridge_items',
  basket: 'basket_items',
  favorites: 'favorites',
  cooking: 'cooking_history',
  feedback: 'recipe_feedback',
  weights: 'weight_logs',
  weekTemplate: 'week_templates',
  leftovers: 'leftovers',
  recipes: 'recipes',
  hidden: 'hidden_recipes',
  customIngredients: 'custom_ingredients',
};
const LOCAL_OF = Object.fromEntries(Object.entries(REMOTE).map(([l, r]) => [r, l])) as Record<string, BackupTable>;

export type CloudStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
export interface Member {
  userId: string;
  name: string;
  role: string;
}
export interface CloudState {
  status: CloudStatus;
  email?: string;
  userId?: string;
  lastSync?: string;
  error?: string;
  /** l'utilisateur vient d'un lien « mot de passe oublié » */
  recovery?: boolean;
  /** foyer actif */
  household?: { id: string; name: string };
  members?: Member[];
  /** la migration SQL des foyers n'a pas été exécutée : ancien mode */
  legacy?: boolean;
  /** des données locales existent : faut-il les ajouter au foyer ? */
  pendingImport?: boolean;
  /** modifications en attente d'envoi */
  pending?: number;
  /** temps réel actif */
  live?: boolean;
}

let state: CloudState = { status: cloudEnabled ? 'signed-out' : 'off' };
const listeners = new Set<() => void>();
function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getCloud(): CloudState {
  return state;
}
export function useCloud(): CloudState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// ── Mémoire propre à cet appareil ──────────────────────────
interface Meta {
  userId?: string;
  householdId?: string;
  householdName?: string;
  /** curseurs de relevé par table (horodatage serveur) */
  cursors?: Record<string, string>;
  // ancien mode
  remoteAt?: string;
  dirty?: boolean;
}
const META_KEY = 'cuisine.sync';
function readMeta(): Meta {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function writeMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* stockage indisponible */
  }
}
const patchMeta = (p: Partial<Meta>) => writeMeta({ ...readMeta(), ...p });

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cuisine.auth' } });
  return client;
}

let user: User | null = null;
let busy: Promise<void> | null = null;

const FR: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
  'User already registered': 'Un compte existe déjà avec cet e-mail : connectez-vous.',
  'Email not confirmed': 'Adresse e-mail pas encore confirmée : cliquez sur le lien reçu par e-mail, puis reconnectez-vous.',
  'Password should be at least 6 characters.': 'Le mot de passe doit contenir au moins 6 caractères.',
  'invitation invalide ou expirée': 'Ce code d’invitation est invalide ou a expiré : demandez-en un nouveau.',
};
const tr = (m: string) => FR[m] ?? m;

function friendly(e: unknown): string {
  let msg = (e as Error)?.message ?? String(e);
  if (/(user_data|household)/.test(msg) && /(schema cache|does not exist|relation)/i.test(msg)) msg = 'Le serveur des comptes n’est pas à jour : exécutez les migrations SQL du dossier supabase/migrations (voir README).';
  else if (/row-level security|permission denied/i.test(msg)) msg = 'Accès refusé par les règles de sécurité du serveur.';
  else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Impossible de joindre le serveur des comptes (réseau ou projet Supabase en pause).';
  return tr(msg);
}
const fail = (e: unknown) => set({ status: navigator.onLine === false ? 'offline' : 'error', error: friendly(e) });

function run(task: () => Promise<void>) {
  const next = (busy ?? Promise.resolve()).then(task).catch(fail);
  busy = next.finally(() => {
    if (busy === next) busy = null;
  });
  return next;
}

/** Comme run(), mais l'erreur remonte à l'appelant (actions déclenchées par un bouton) */
function runOrThrow(task: () => Promise<void>): Promise<void> {
  const next = (busy ?? Promise.resolve()).then(task);
  const settled = next.catch(() => undefined);
  busy = settled.finally(() => {
    if (busy === settled) busy = null;
  });
  return next.catch((e) => {
    throw new Error(friendly(e));
  });
}

const isMissingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''));

// ═════════════════════════════════════════════════════════════
// Mode foyer : synchronisation élément par élément
// ═════════════════════════════════════════════════════════════

const keyOf = (t: BackupTable, row: Record<string, unknown>) => String(row[db.table(t).schema.primKey.keyPath as string]);
/** dernier état connu de chaque élément (pour ne renvoyer que ce qui change) */
const known: Partial<Record<BackupTable, Map<string, string>>> = {};
let tracking = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let channel: RealtimeChannel | null = null;

/** Contenu synchronisé d'une ligne (les réglages propres à l'appareil restent locaux) */
function payload(t: BackupTable, row: Record<string, unknown>): Record<string, unknown> {
  if (t === 'settings') {
    const { apiKey: _a, model: _m, ...rest } = row as Record<string, unknown> & { apiKey?: unknown; model?: unknown };
    return rest;
  }
  return row;
}

/** Observe chaque table locale et met les changements dans la file d'envoi */
function startTracking() {
  if (tracking) return;
  tracking = true;
  for (const t of BACKUP_TABLES) {
    let first = true;
    liveQuery(() => db.table(t).toArray()).subscribe((rows: Array<Record<string, unknown>>) => {
      const next = new Map(rows.map((r) => [keyOf(t, r), JSON.stringify(payload(t, r))]));
      const prev = known[t];
      known[t] = next;
      if (first || !prev) {
        first = false;
        return;
      }
      if (!state.household || state.pendingImport) return;
      const ops: Array<{ id: string; data: unknown | null }> = [];
      for (const [id, json] of next) if (prev.get(id) !== json) ops.push({ id, data: JSON.parse(json) });
      for (const id of prev.keys()) if (!next.has(id)) ops.push({ id, data: null });
      if (!ops.length) return;
      const at = new Date().toISOString();
      db.outbox.bulkAdd(ops.map((o) => ({ table: t, id: o.id, data: o.data, at }))).then(() => {
        set({ pending: (state.pending ?? 0) + ops.length });
        scheduleFlush();
      });
    });
  }
}

function scheduleFlush(ms = 700) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => run(flush), ms);
}

/** Envoie la file d'attente (regroupée par table, dernier état de chaque élément) */
async function flush() {
  const hid = state.household?.id;
  if (!user || !hid) return;
  const items = await db.outbox.orderBy('seq').toArray();
  if (!items.length) {
    set({ pending: 0 });
    return;
  }
  set({ status: 'syncing' });
  const byTable = new Map<string, Map<string, (typeof items)[number]>>();
  for (const it of items) (byTable.get(it.table) ?? byTable.set(it.table, new Map()).get(it.table)!).set(it.id, it);
  for (const [t, rows] of byTable) {
    const remote = REMOTE[t as BackupTable];
    const batch = [...rows.values()].map((r) => ({ household_id: hid, id: r.id, data: r.data ?? {}, deleted: r.data === null }));
    for (let i = 0; i < batch.length; i += 200) {
      const { error } = await supabase().from(remote).upsert(batch.slice(i, i + 200), { onConflict: 'household_id,id' });
      if (error) throw error;
    }
  }
  const maxSeq = items[items.length - 1].seq!;
  await db.outbox.where('seq').belowOrEqual(maxSeq).delete();
  const left = await db.outbox.count();
  set({ status: 'synced', lastSync: new Date().toISOString(), error: undefined, pending: left });
  if (left) scheduleFlush(100);
}

interface RemoteRow {
  id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
}

/** Applique des lignes du foyer dans la base locale (sans les renvoyer) */
async function applyRows(t: BackupTable, rows: RemoteRow[]) {
  if (!rows.length) return;
  const pending = new Set((await db.outbox.where('table').equals(t).toArray()).map((o) => o.id));
  const table = db.table(t);
  const map = known[t] ?? (known[t] = new Map());
  const puts: Array<Record<string, unknown>> = [];
  const dels: string[] = [];
  for (const r of rows) {
    if (pending.has(r.id)) continue; // une modification locale plus récente va partir
    if (r.deleted) {
      map.delete(r.id);
      dels.push(r.id);
    } else {
      const data = t === 'settings' ? { ...((await table.get(r.id)) ?? {}), ...r.data } : r.data;
      map.set(r.id, JSON.stringify(payload(t, data)));
      puts.push(data);
    }
  }
  // les clés numériques n'existent plus : toutes les clés primaires sont des textes
  await db.transaction('rw', table, async () => {
    if (dels.length) await table.bulkDelete(dels);
    if (puts.length) await table.bulkPut(puts);
  });
}

/** Relève ce qui a changé dans le foyer depuis le dernier passage */
async function pullAll() {
  const hid = state.household?.id;
  if (!user || !hid) return;
  set({ status: 'syncing' });
  const meta = readMeta();
  const cursors = { ...(meta.cursors ?? {}) };
  for (const t of BACKUP_TABLES) {
    const remote = REMOTE[t];
    const since = cursors[remote];
    // marge de 5 s : une écriture concurrente ne peut pas être sautée (l'application est idempotente)
    const from = since ? new Date(Date.parse(since) - 5000).toISOString() : null;
    let latest = since;
    for (let offset = 0; ; offset += 500) {
      let q = supabase().from(remote).select('id,data,deleted,updated_at').eq('household_id', hid);
      if (from) q = q.gt('updated_at', from);
      const { data, error } = await q.order('updated_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      const rows = (data ?? []) as RemoteRow[];
      await applyRows(t, rows);
      if (rows.length && (!latest || rows[rows.length - 1].updated_at > latest)) latest = rows[rows.length - 1].updated_at;
      if (rows.length < 500) break;
    }
    if (latest) cursors[remote] = latest;
  }
  patchMeta({ cursors });
  set({ status: 'synced', lastSync: new Date().toISOString(), error: undefined });
}

/** Envoie toutes les données locales vers le foyer (première connexion, import) */
async function pushAll() {
  const at = new Date().toISOString();
  const ops: Array<{ table: string; id: string; data: unknown; at: string }> = [];
  for (const t of BACKUP_TABLES) {
    for (const r of (await db.table(t).toArray()) as Array<Record<string, unknown>>) ops.push({ table: t, id: keyOf(t, r), data: payload(t, r), at });
  }
  if (ops.length) await db.outbox.bulkAdd(ops);
  await flush();
}

function subscribeRealtime(hid: string) {
  channel?.unsubscribe();
  let ch = supabase().channel(`foyer-${hid}`);
  for (const remote of Object.values(REMOTE)) {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: remote, filter: `household_id=eq.${hid}` }, (p) => {
      const row = p.new as RemoteRow | undefined;
      if (!row?.id) return;
      applyRows(LOCAL_OF[remote], [row]).then(() => {
        const cursors = readMeta().cursors ?? {};
        if (!cursors[remote] || row.updated_at > cursors[remote]) patchMeta({ cursors: { ...cursors, [remote]: row.updated_at } });
        set({ lastSync: new Date().toISOString() });
      });
    });
  }
  channel = ch.subscribe((status) => set({ live: status === 'SUBSCRIBED' }));
}

async function loadMembers(hid: string) {
  const { data } = await supabase().from('household_members').select('user_id, display_name, role').eq('household_id', hid);
  set({ members: (data ?? []).map((m) => ({ userId: m.user_id, name: m.display_name ?? 'Membre', role: m.role })) });
}

async function hasLocalData(): Promise<boolean> {
  for (const t of BACKUP_TABLES) if (t !== 'settings' && (await db.table(t).count()) > 0) return true;
  return false;
}

async function displayName(): Promise<string> {
  const mine = (await db.profiles.toArray()).find((p) => p.userId === user?.id);
  return mine?.name || user?.email?.split('@')[0] || 'Membre';
}

/** Après connexion : choisir (ou créer) le foyer, reprendre les anciennes données, synchroniser */
async function connect() {
  if (!user) return;
  set({ status: 'syncing' });
  const { data: rows, error } = await supabase().from('household_members').select('household_id, households(name)').eq('user_id', user.id);
  if (isMissingTable(error)) {
    set({ legacy: true });
    return legacyPull();
  }
  if (error) throw error;
  const meta = readMeta();
  const list = (rows ?? []).map((r) => ({ id: r.household_id as string, name: ((r.households as unknown as { name?: string }) ?? {}).name ?? 'Mon foyer' }));
  const sameUser = meta.userId === user.id;

  // Reprise de l'ancien mode (une copie complète par compte), une seule fois
  if (!list.length) {
    const { data: legacy } = await supabase().from('user_data').select('data').eq('user_id', user.id).maybeSingle();
    if (legacy?.data && !(await hasLocalData())) await importData(JSON.stringify({ app: 'cuisine-foyer', data: legacy.data }), 'merge');
  }

  let hh = list.find((h) => h.id === meta.householdId) ?? list[0];
  let created = false;
  // arrivé par un lien d'invitation : on attend qu'il rejoigne ce foyer plutôt que d'en créer un
  if (!hh && /^#\/rejoindre\//.test(location.hash)) {
    set({ status: 'synced' });
    return;
  }
  await claimProfile();
  if (!hh) {
    const name = `Foyer de ${await displayName()}`;
    const { data: hid, error: e2 } = await supabase().rpc('create_household', { p_name: name, p_display_name: await displayName() });
    if (e2) throw e2;
    hh = { id: hid as string, name };
    created = true;
  }
  const switching = !sameUser || meta.householdId !== hh.id;
  patchMeta({ userId: user.id, householdId: hh.id, householdName: hh.name, ...(switching ? { cursors: {} } : {}) });
  set({ household: hh });
  await claimProfile();
  startTracking();

  if (created) {
    // nouveau foyer : tout ce qui est sur ce téléphone y part
    await pushAll();
  } else if (switching && (await hasLocalData())) {
    // foyer existant + données sur ce téléphone : l'utilisateur choisit
    set({ pendingImport: true, status: 'synced' });
    return;
  } else {
    await flush();
  }
  await pullAll();
  subscribeRealtime(hh.id);
  loadMembers(hh.id);
}

/** Le premier profil sans compte devient celui de l'utilisateur connecté */
async function claimProfile() {
  if (!user) return;
  const all = await db.profiles.toArray();
  if (all.some((p) => p.userId === user!.id)) return;
  const free = all.find((p) => !p.userId);
  if (free) await db.profiles.put({ ...free, userId: user.id, updatedAt: new Date().toISOString() });
}

/** Réponse à la question « ajouter les données de ce téléphone au foyer ? » */
export function resolveImport(addLocal: boolean) {
  return run(async () => {
    const hid = state.household?.id;
    if (!hid) return;
    set({ pendingImport: false });
    if (addLocal) {
      await pushAll();
    } else {
      // on garde seulement le profil de la personne connectée
      const mine = (await db.profiles.toArray()).filter((p) => p.userId === user?.id);
      await wipeLocalData();
      for (const t of BACKUP_TABLES) known[t] = new Map();
      if (mine.length) await db.profiles.bulkPut(mine);
    }
    patchMeta({ cursors: {} });
    await pullAll();
    subscribeRealtime(hid);
    loadMembers(hid);
  });
}

export function syncNow() {
  return run(async () => {
    if (state.legacy) return legacyPull();
    await flush();
    await pullAll();
  });
}

let lastPull = 0;
function pullSoon() {
  if (!user || state.pendingImport || Date.now() - lastPull < 15000) return;
  lastPull = Date.now();
  syncNow();
}

// ── Foyer : invitations, membres ──────────────────────────

export function inviteLink(code: string) {
  return `${siteUrl()}#/rejoindre/${code}`;
}

export async function createInvitation(): Promise<string> {
  const hid = state.household?.id;
  if (!hid) throw new Error('Connectez-vous d’abord');
  const { data, error } = await supabase().rpc('create_invitation', { p_household: hid });
  if (error) throw new Error(friendly(error));
  return data as string;
}

/** Rejoindre un foyer : mon profil m'accompagne, le reste vient du foyer */
export function joinHousehold(code: string) {
  return runOrThrow(async () => {
    if (!user) throw new Error('Connectez-vous d’abord');
    await claimProfile();
    const name = await displayName();
    const { data: hid, error } = await supabase().rpc('join_household', { p_code: code.trim().toUpperCase(), p_display_name: name });
    if (error) throw new Error(friendly(error));
    await db.outbox.clear();
    const mine = (await db.profiles.toArray()).filter((p) => p.userId === user!.id);
    await wipeLocalData();
    for (const t of BACKUP_TABLES) known[t] = new Map();
    const { data: h } = await supabase().from('households').select('name').eq('id', hid).maybeSingle();
    patchMeta({ householdId: hid as string, householdName: h?.name ?? 'Foyer', cursors: {} });
    set({ household: { id: hid as string, name: h?.name ?? 'Foyer' }, pendingImport: false });
    await pullAll();
    // mon profil rejoint le foyer (s'il n'y est pas déjà)
    const there = (await db.profiles.toArray()).some((p) => p.userId === user!.id);
    if (!there && mine.length) await db.profiles.bulkPut(mine.map((p) => ({ ...p, updatedAt: new Date().toISOString() })));
    subscribeRealtime(hid as string);
    loadMembers(hid as string);
  });
}

export async function renameHousehold(name: string) {
  const hid = state.household?.id;
  if (!hid) return;
  const { error } = await supabase().from('households').update({ name }).eq('id', hid);
  if (error) throw new Error(friendly(error));
  patchMeta({ householdName: name });
  set({ household: { id: hid, name } });
}

/** Quitter le foyer : un nouveau foyer personnel est créé avec les données de ce téléphone */
export function leaveHousehold() {
  return runOrThrow(async () => {
    const hid = state.household?.id;
    if (!hid || !user) return;
    const { error } = await supabase().from('household_members').delete().eq('household_id', hid).eq('user_id', user.id);
    if (error) throw new Error(friendly(error));
    channel?.unsubscribe();
    patchMeta({ householdId: undefined, cursors: {} });
    set({ household: undefined, members: undefined });
    await db.outbox.clear();
    await connect();
  });
}

// ═════════════════════════════════════════════════════════════
// Ancien mode (migration SQL des foyers pas encore exécutée)
// ═════════════════════════════════════════════════════════════

let legacyTimer: ReturnType<typeof setTimeout> | undefined;
let legacyKnown = '';

async function legacyPush() {
  if (!user) return;
  const data = await snapshotData();
  const updated_at = new Date().toISOString();
  const { error } = await supabase().from('user_data').upsert({ user_id: user.id, data, updated_at });
  if (error) throw error;
  legacyKnown = JSON.stringify(data);
  patchMeta({ userId: user.id, remoteAt: updated_at, dirty: false });
  set({ status: 'synced', lastSync: updated_at, error: undefined });
}

async function legacyPull() {
  if (!user) return;
  set({ status: 'syncing' });
  const meta = readMeta();
  const { data: row, error } = await supabase().from('user_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!row) return legacyPush();
  const same = meta.userId === user.id && !!meta.remoteAt && Date.parse(meta.remoteAt) === Date.parse(row.updated_at);
  if (same) return meta.dirty ? legacyPush() : set({ status: 'synced', lastSync: row.updated_at });
  await importData(JSON.stringify({ app: 'cuisine-foyer', data: row.data as Snapshot }), meta.userId === user.id && !meta.dirty ? 'replace' : 'merge');
  legacyKnown = JSON.stringify(await snapshotData());
  if (meta.userId !== user.id || meta.dirty) return legacyPush();
  patchMeta({ userId: user.id, remoteAt: row.updated_at, dirty: false });
  set({ status: 'synced', lastSync: row.updated_at });
}

function legacyTrack() {
  let first = true;
  liveQuery(async () => JSON.stringify(await snapshotData())).subscribe((snap) => {
    if (first) {
      first = false;
      legacyKnown = snap;
      return;
    }
    if (!state.legacy || !user || snap === legacyKnown) return;
    patchMeta({ dirty: true });
    clearTimeout(legacyTimer);
    legacyTimer = setTimeout(() => run(legacyPush), 1500);
  });
}

// ═════════════════════════════════════════════════════════════
// Démarrage et authentification
// ═════════════════════════════════════════════════════════════

export function initCloud() {
  if (!cloudEnabled) return;
  handleAuthLink();
  const sb = supabase();
  sb.auth.onAuthStateChange((event, session) => {
    const u = session?.user ?? null;
    const changed = u?.id !== user?.id;
    user = u;
    if (!u) {
      channel?.unsubscribe();
      set({ status: 'signed-out', email: undefined, userId: undefined, household: undefined, members: undefined, live: false });
      return;
    }
    set({ email: u.email ?? undefined, userId: u.id, ...(event === 'PASSWORD_RECOVERY' ? { recovery: true } : {}) });
    // hors ligne : on reprend le foyer connu pour continuer à mettre les modifications en file
    const meta = readMeta();
    if (changed && meta.userId === u.id && meta.householdId && !state.household) set({ household: { id: meta.householdId, name: meta.householdName ?? 'Mon foyer' } });
    if (changed) {
      lastPull = Date.now();
      // hors du rappel d'authentification (recommandation Supabase)
      setTimeout(() => run(connect), 0);
    }
  });
  legacyTrack();
  startTracking();
  // Retour sur l'appli, retour du réseau, relevé de secours si le temps réel est coupé
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pullSoon());
  window.addEventListener('focus', pullSoon);
  window.addEventListener('online', () => user && syncNow());
  setInterval(() => {
    if (user && document.visibilityState === 'visible' && !state.live) pullSoon();
  }, 20000);
  db.outbox.count().then((n) => set({ pending: n }));
}

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } });
  if (error) throw new Error(tr(error.message));
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(tr(error.message));
}

/** Connexion avec Google (facultatif : fournisseur à activer dans Supabase, voir docs/SUPABASE.md) */
export async function signInWithGoogle() {
  const { error } = await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } });
  if (error) throw new Error(tr(error.message));
}

/** Connexion sans mot de passe : lien magique envoyé par e-mail */
export async function sendMagicLink(email: string) {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl(), shouldCreateUser: true } });
  if (error) throw new Error(tr(error.message));
}

/** Déconnexion ; par défaut les données de cet appareil sont effacées (elles restent dans le foyer) */
export async function signOut(wipe = true) {
  clearTimeout(flushTimer);
  if (user && state.household && (await db.outbox.count())) await run(flush);
  if (user && state.legacy && readMeta().dirty) await run(legacyPush);
  channel?.unsubscribe();
  await supabase().auth.signOut();
  user = null;
  writeMeta({});
  if (wipe) {
    await wipeLocalData();
    for (const t of BACKUP_TABLES) known[t] = new Map();
  }
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
  if (error) throw new Error(tr(error.message));
}

export async function updatePassword(password: string) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw new Error(tr(error.message));
  set({ recovery: false });
}

/** Supprime mes données en ligne (ancien mode) et quitte le foyer, puis se déconnecte */
export async function deleteCloudData() {
  if (!user) return;
  await supabase().from('user_data').delete().eq('user_id', user.id);
  if (state.household) await supabase().from('household_members').delete().eq('household_id', state.household.id).eq('user_id', user.id);
  await signOut(true);
}

function siteUrl() {
  return location.origin + location.pathname;
}

/**
 * Les liens envoyés par e-mail (lien magique, confirmation, mot de passe oublié)
 * reviennent avec #access_token=…, ce qui gênerait le routeur (HashRouter) :
 * on ouvre la session puis on nettoie l'adresse.
 */
function handleAuthLink() {
  const h = location.hash;
  if (!h.includes('access_token=')) return;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  const recovery = p.get('type') === 'recovery';
  let back = '#/';
  try {
    back = sessionStorage.getItem('cuisine.afterLogin') ?? '#/';
    sessionStorage.removeItem('cuisine.afterLogin');
  } catch {
    /* stockage indisponible */
  }
  history.replaceState(null, '', location.pathname + location.search + (recovery ? '#/compte' : back));
  if (access_token && refresh_token) {
    supabase()
      .auth.setSession({ access_token, refresh_token })
      .then(() => recovery && set({ recovery: true }));
  }
}
