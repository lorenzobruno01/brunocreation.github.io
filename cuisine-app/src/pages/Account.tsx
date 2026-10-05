import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cloudEnabled, deleteCloudData, sendPasswordReset, signIn, signOut, signUp, syncNow, updatePassword, useCloud } from '../cloud/sync';
import { useToast } from '../components/ui';

const STATUS: Record<string, string> = {
  syncing: '🔄 Synchronisation…',
  synced: '✅ Données enregistrées dans votre compte',
  offline: '📴 Hors ligne : les modifications seront envoyées au retour du réseau',
  error: '⚠️ Problème de synchronisation',
};

export function Account() {
  const cloud = useCloud();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!cloudEnabled)
    return (
      <div className="page narrow stack">
        <h1>👤 Mon compte</h1>
        <div className="callout">Les comptes ne sont pas encore activés sur ce site. En attendant, vos données restent enregistrées dans ce navigateur (Réglages → Sauvegarde pour les transférer).</div>
      </div>
    );

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email.trim(), password);
        setMsg(needsConfirmation ? { ok: true, text: '📧 Compte créé ! Cliquez sur le lien reçu par e-mail pour le confirmer, puis connectez-vous ici.' } : { ok: true, text: 'Compte créé, vous êtes connecté·e ✅' });
        if (needsConfirmation) setMode('login');
      } else if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        await sendPasswordReset(email.trim());
        setMsg({ ok: true, text: '📧 Si un compte existe, un lien pour choisir un nouveau mot de passe vient d’être envoyé.' });
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  if (cloud.email)
    return (
      <div className="page narrow stack" style={{ gap: 18 }}>
        <h1>👤 Mon compte</h1>
        <section className="card pad stack">
          <div>
            Connecté·e : <strong>{cloud.email}</strong>
          </div>
          <div className={`callout small ${cloud.status === 'error' ? 'danger' : cloud.status === 'synced' ? 'ok' : ''}`} style={{ margin: 0 }}>
            {STATUS[cloud.status] ?? ''}
            {cloud.lastSync && cloud.status === 'synced' && <span className="muted"> — {new Date(cloud.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
            {cloud.error && cloud.status === 'error' && <div className="muted">{cloud.error}</div>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Planning, favoris, historique, frigo, garde-manger, liste de courses, recettes ajoutées et profil sont enregistrés automatiquement. Connectez-vous avec le même e-mail sur un autre téléphone ou ordinateur pour tout retrouver.
          </p>
          <div className="row">
            <button className="btn" onClick={() => syncNow()}>
              🔄 Synchroniser maintenant
            </button>
            <Link className="btn" to="/reglages">
              ✏️ Mon profil (taille, poids, objectif)
            </Link>
          </div>
        </section>

        {cloud.recovery && <NewPassword />}

        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Se déconnecter</h2>
          <p className="small muted" style={{ margin: 0 }}>Vos données restent dans votre compte. Elles sont effacées de cet appareil pour qu’une autre personne puisse s’y connecter.</p>
          <div className="row">
            <button
              className="btn"
              onClick={async () => {
                await signOut(true);
                toast('Déconnecté·e');
              }}
            >
              🚪 Se déconnecter
            </button>
            <button
              className="btn ghost sm danger"
              onClick={async () => {
                if (!confirm('Supprimer définitivement toutes les données enregistrées dans votre compte ? (cet appareil sera aussi vidé)')) return;
                await deleteCloudData();
                toast('Données du compte supprimées');
              }}
            >
              Supprimer mes données en ligne
            </button>
          </div>
        </section>
      </div>
    );

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <h1>👤 Mon compte</h1>
      <p className="muted" style={{ margin: 0 }}>
        Un compte gratuit pour retrouver votre semaine, vos favoris et votre profil sur tous vos appareils. Chaque personne a son propre compte et ses propres données.
      </p>
      <section className="card pad stack">
        <div className="segmented">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Se connecter
          </button>
          <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>
            Créer un compte
          </button>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="field">
            <label>E-mail</label>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== 'reset' && (
            <div className="field">
              <label>Mot de passe {mode === 'signup' && <span className="muted">(6 caractères minimum)</span>}</label>
              <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {msg && <div className={`callout small ${msg.ok ? 'ok' : 'danger'}`}>{msg.text}</div>}
          <button className="btn primary lg" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'signup' ? 'Créer mon compte' : mode === 'login' ? 'Se connecter' : 'Recevoir le lien'}
          </button>
        </form>
        {mode === 'login' && (
          <button className="btn ghost sm" onClick={() => setMode('reset')}>
            Mot de passe oublié ?
          </button>
        )}
        {mode === 'signup' && <p className="small muted" style={{ margin: 0 }}>Ce que vous avez déjà enregistré sur cet appareil (planning, favoris, profil) sera conservé dans votre nouveau compte.</p>}
      </section>
    </div>
  );
}

function NewPassword() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <section className="card pad stack">
      <h2 style={{ margin: 0 }}>🔑 Nouveau mot de passe</h2>
      <input className="input" type="password" autoComplete="new-password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} />
      <button
        className="btn primary"
        onClick={async () => {
          try {
            await updatePassword(pw);
            setMsg('Mot de passe modifié ✅');
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Enregistrer
      </button>
      {msg && <div className="small">{msg}</div>}
    </section>
  );
}
