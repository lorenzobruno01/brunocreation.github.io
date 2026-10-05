// ─────────────────────────────────────────────────────────────
// Compte utilisateur + synchronisation des données personnelles.
// Les données restent d'abord dans le navigateur (IndexedDB) : l'app
// marche hors ligne. Une fois connecté, une copie complète est
// enregistrée dans le compte (table Supabase « user_data », une
// ligne par utilisateur) et récupérée sur tout autre appareil.
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { liveQuery } from 'dexie';
import { importData, snapshotData, wipeLocalData, type Snapshot } from '../db/db';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

export type CloudStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
export interface CloudState {
  status: CloudStatus;
  email?: string;
  lastSync?: string;
  error?: string;
  /** l'utilisateur vient d'un lien « mot de passe oublié » */
  recovery?: boolean;
}

let state: CloudState = { status: cloudEnabled ? 'signed-out' : 'off' };
const listeners = new Set<() => void>();
function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
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

// ── Mémoire de synchronisation propre à cet appareil ──────
interface Meta {
  userId?: string;
  /** date de la version distante déjà intégrée ici */
  remoteAt?: string;
  /** modifications locales pas encore envoyées */
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
function deviceId(): string {
  try {
    let id = localStorage.getItem('cuisine.device');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem('cuisine.device', id);
    }
    return id;
  } catch {
    return 'inconnu';
  }
}

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cuisine.auth' } });
  return client;
}

let user: User | null = null;
let applying = false;
/** dernier état déjà connu du compte (évite de renvoyer ce qu'on vient de recevoir) */
let lastKnown = '';
let busy: Promise<void> | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

const fail = (e: unknown) => {
  const msg = (e as Error)?.message ?? String(e);
  set({ status: navigator.onLine === false ? 'offline' : 'error', error: msg });
};

async function apply(data: Snapshot, mode: 'merge' | 'replace') {
  applying = true;
  try {
    await importData(JSON.stringify({ app: 'cuisine-foyer', data }), mode);
    lastKnown = JSON.stringify(await snapshotData());
  } finally {
    // laisser passer la notification de changement provoquée par l'import
    setTimeout(() => (applying = false), 300);
  }
}

async function push() {
  if (!user) return;
  set({ status: 'syncing' });
  const data = await snapshotData();
  const updated_at = new Date().toISOString();
  const { error } = await supabase().from('user_data').upsert({ user_id: user.id, data, device: deviceId(), updated_at });
  if (error) throw error;
  lastKnown = JSON.stringify(data);
  writeMeta({ userId: user.id, remoteAt: updated_at, dirty: false });
  set({ status: 'synced', lastSync: updated_at, error: undefined });
}

/** Récupère la version du compte et la réconcilie avec cet appareil */
async function pull() {
  if (!user) return;
  set({ status: 'syncing' });
  const meta = readMeta();
  const { data: row, error } = await supabase().from('user_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!row) return push(); // premier appareil du compte
  const sameUser = meta.userId === user.id;
  if (sameUser && meta.remoteAt === row.updated_at) {
    if (meta.dirty) return push();
    set({ status: 'synced', lastSync: row.updated_at, error: undefined });
    return;
  }
  if (!sameUser || meta.dirty) {
    // premier passage sur cet appareil, ou modifications des deux côtés : on fusionne puis on renvoie
    await apply(row.data as Snapshot, 'merge');
    return push();
  }
  // l'autre appareil est plus récent et rien n'a changé ici : on prend sa version
  await apply(row.data as Snapshot, 'replace');
  writeMeta({ userId: user.id, remoteAt: row.updated_at, dirty: false });
  set({ status: 'synced', lastSync: row.updated_at, error: undefined });
}

function run(task: () => Promise<void>) {
  const next = (busy ?? Promise.resolve()).then(task).catch(fail);
  busy = next.finally(() => {
    if (busy === next) busy = null;
  });
  return next;
}

export function syncNow() {
  return run(pull);
}

let lastPull = 0;
function pullSoon() {
  if (!user || Date.now() - lastPull < 20000) return;
  lastPull = Date.now();
  run(pull);
}

/** À appeler une fois au démarrage */
export function initCloud() {
  if (!cloudEnabled) return;
  handleRecoveryLink();
  const sb = supabase();
  sb.auth.onAuthStateChange((event, session) => {
    const u = session?.user ?? null;
    const changed = u?.id !== user?.id;
    user = u;
    if (!u) {
      set({ status: 'signed-out', email: undefined });
      return;
    }
    set({ email: u.email ?? undefined, ...(event === 'PASSWORD_RECOVERY' ? { recovery: true } : {}) });
    if (changed) {
      lastPull = Date.now();
      // hors du rappel d'authentification (recommandation Supabase)
      setTimeout(() => run(pull), 0);
    }
  });

  // Toute modification locale est envoyée au compte (regroupée sur 1,5 s)
  let first = true;
  liveQuery(async () => JSON.stringify(await snapshotData())).subscribe((snap) => {
    if (first) {
      first = false;
      return;
    }
    if (applying || !user || !snap || snap === lastKnown) return;
    writeMeta({ ...readMeta(), userId: user.id, dirty: true });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => run(push), 1500);
  });

  // Retour sur l'appli (autre appareil entre-temps) ou retour du réseau
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pullSoon());
  window.addEventListener('focus', pullSoon);
  window.addEventListener('online', () => user && run(pull));
}

// ── Actions du compte ─────────────────────────────────────

const FR: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
  'User already registered': 'Un compte existe déjà avec cet e-mail : connectez-vous.',
  'Email not confirmed': 'Adresse e-mail pas encore confirmée : cliquez sur le lien reçu par e-mail, puis reconnectez-vous.',
  'Password should be at least 6 characters.': 'Le mot de passe doit contenir au moins 6 caractères.',
};
const tr = (m: string) => FR[m] ?? m;

export async function signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } });
  if (error) throw new Error(tr(error.message));
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(tr(error.message));
}

/** Déconnexion ; par défaut les données de cet appareil sont effacées (elles restent dans le compte) */
export async function signOut(wipe = true) {
  clearTimeout(pushTimer);
  if (user && readMeta().dirty) await run(push);
  await supabase().auth.signOut();
  user = null;
  writeMeta({});
  if (wipe) {
    applying = true;
    await wipeLocalData();
    setTimeout(() => (applying = false), 300);
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

/** Supprime les données du compte (la ligne distante) puis se déconnecte */
export async function deleteCloudData() {
  if (!user) return;
  const { error } = await supabase().from('user_data').delete().eq('user_id', user.id);
  if (error) throw new Error(tr(error.message));
  await signOut(true);
}

function siteUrl() {
  return location.origin + location.pathname;
}

/**
 * Le lien « mot de passe oublié » revient avec #access_token=…&type=recovery,
 * ce qui gênerait le routeur (HashRouter) : on ouvre la session puis on nettoie l'adresse.
 */
function handleRecoveryLink() {
  const h = location.hash;
  if (!h.includes('access_token=')) return;
  const p = new URLSearchParams(h.replace(/^#\/?/, ''));
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  const recovery = p.get('type') === 'recovery';
  history.replaceState(null, '', location.pathname + location.search + (recovery ? '#/compte' : '#/'));
  if (access_token && refresh_token) {
    supabase()
      .auth.setSession({ access_token, refresh_token })
      .then(() => recovery && set({ recovery: true }));
  }
}
