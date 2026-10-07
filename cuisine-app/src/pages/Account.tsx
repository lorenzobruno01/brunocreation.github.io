import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  cloudEnabled,
  createInvitation,
  deleteCloudData,
  inviteLink,
  joinHousehold,
  leaveHousehold,
  renameHousehold,
  resolveImport,
  sendMagicLink,
  verifyEmailCode,
  sendPasswordReset,
  signInWithGoogle,
  setDisplayName,
  signIn,
  signOut,
  signUp,
  syncNow,
  updatePassword,
  useCloud,
} from '../cloud/sync';
import { useToast } from '../components/ui';
import { FEATURES } from '../cloud/config';

const STATUS: Record<string, string> = {
  syncing: '🔄 Synchronisation…',
  synced: '✅ À jour',
  offline: '📴 Hors ligne : les modifications partiront au retour du réseau',
  error: '⚠️ Problème de synchronisation',
};

/** Formulaire de connexion : mot de passe, lien magique, création de compte, oubli */
/** Site ouvert comme une appli installée sur l'écran d'accueil */
const isInstalledApp = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
};

export function LoginForm({ intro }: { intro?: string }) {
  // le mot de passe d'abord : il marche partout, y compris dans l'appli installée
  const [mode, setMode] = useState<'magic' | 'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'magic') {
        try {
          sessionStorage.setItem('cuisine.afterLogin', location.hash || '#/');
        } catch {
          /* stockage indisponible */
        }
        if (sent && otp.trim()) {
          await verifyEmailCode(email.trim(), otp);
        } else {
          await sendMagicLink(email.trim());
          setSent(true);
          setMsg({ ok: true, text: isInstalledApp() ? '📧 E-mail envoyé ! Recopiez ici le code à 6 chiffres qu’il contient (le lien, lui, s’ouvrirait dans le navigateur).' : '📧 E-mail envoyé ! Touchez le lien qu’il contient, ou recopiez ici le code à 6 chiffres.' });
        }
      } else if (mode === 'signup') {
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

  return (
    <section className="card pad stack">
      {intro && <p style={{ margin: 0 }}>{intro}</p>}
      {FEATURES.google && (
        <button className="btn" onClick={() => signInWithGoogle().catch((e) => alert((e as Error).message))}>
          <strong>G</strong> Continuer avec Google
        </button>
      )}
      <div className="segmented">
        <button className={mode === 'login' || mode === 'signup' || mode === 'reset' ? 'on' : ''} onClick={() => setMode('login')}>
          🔑 Mot de passe
          <span className="cnt">recommandé</span>
        </button>
        <button className={mode === 'magic' ? 'on' : ''} onClick={() => setMode('magic')}>
          ✉️ Code par e-mail
          <span className="cnt">sans mot de passe</span>
        </button>
      </div>
      {isInstalledApp() && mode === 'magic' && (
        <div className="callout info small" style={{ margin: 0 }}>
          📱 Dans l’appli installée, le lien de l’e-mail s’ouvre dans le navigateur : recopiez plutôt le code à 6 chiffres, ou utilisez un mot de passe.
        </div>
      )}
      {mode !== 'magic' && (
        <div className="chips">
          <button className={`chip ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>
            Se connecter
          </button>
          <button className={`chip ${mode === 'signup' ? 'on' : ''}`} onClick={() => setMode('signup')}>
            Créer un compte
          </button>
        </div>
      )}
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
        {(mode === 'login' || mode === 'signup') && (
          <div className="field">
            <label>Mot de passe {mode === 'signup' && <span className="muted">(6 caractères minimum)</span>}</label>
            <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {mode === 'magic' && sent && (
          <div className="field">
            <label>Code reçu par e-mail</label>
            <input className="input" inputMode="numeric" aria-label="Code reçu par e-mail" autoComplete="one-time-code" placeholder="123456" maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value)} />
          </div>
        )}
        {msg && <div className={`callout small ${msg.ok ? 'ok' : 'danger'}`}>{msg.text}</div>}
        <button className="btn primary lg" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'magic' ? (sent && otp.trim() ? 'Me connecter avec ce code' : sent ? 'Renvoyer un e-mail' : 'Recevoir mon code de connexion') : mode === 'signup' ? 'Créer mon compte' : mode === 'login' ? 'Se connecter' : 'Recevoir le lien'}
        </button>
      </form>
      {mode === 'login' && (
        <button className="btn ghost sm" onClick={() => setMode('reset')}>
          Mot de passe oublié ?
        </button>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Ce que vous avez déjà enregistré sur cet appareil (planning, favoris, profil) peut être ajouté à votre compte après la connexion.
      </p>
    </section>
  );
}

function HouseholdCard() {
  const cloud = useCloud();
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cloud.household?.name ?? '');
  if (!cloud.household) return null;

  const invite = async () => {
    try {
      setCode(await createInvitation());
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const share = async (c: string) => {
    const url = inviteLink(c);
    const text = `Rejoins notre foyer sur Notre Cuisine : ${url} (code ${c})`;
    try {
      if (navigator.share) await navigator.share({ title: 'Notre Cuisine', text, url });
      else {
        await navigator.clipboard.writeText(text);
        toast('Lien copié ✅');
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <section className="card pad stack">
      <div className="row between">
        {editing ? (
          <form
            className="row nowrap grow"
            onSubmit={async (e) => {
              e.preventDefault();
              await renameHousehold(name.trim() || 'Mon foyer');
              setEditing(false);
            }}
          >
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn sm primary">OK</button>
          </form>
        ) : (
          <h2 style={{ margin: 0 }}>🏡 {cloud.household.name}</h2>
        )}
        {!editing && (
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            Renommer
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Partagés par tout le foyer : planning, liste de courses (cochée en direct), garde-manger, frigo, favoris, recettes ajoutées et profils des membres. Chacun garde ses retours sur les plats et son suivi de poids.
      </p>
      {cloud.members && (
        <div className="stack" style={{ gap: 4 }}>
          {cloud.members.map((m) =>
            m.userId === cloud.userId ? (
              <MyName key={m.userId} name={m.name} owner={m.role === 'proprietaire'} />
            ) : (
              <div key={m.userId} className="small">
                {m.role === 'proprietaire' ? '👑' : '👤'} <strong>{m.name}</strong>
              </div>
            ),
          )}
        </div>
      )}
      {code ? (
        <div className="callout ok stack" style={{ margin: 0, gap: 6 }}>
          <div>
            Code d’invitation : <strong style={{ fontSize: '1.3rem', letterSpacing: '0.12em' }}>{code}</strong> <span className="small muted">(valable 14 jours)</span>
          </div>
          <div className="small" style={{ wordBreak: 'break-all' }}>{inviteLink(code)}</div>
          <div>
            <button className="btn sm primary" onClick={() => share(code)}>
              📤 Envoyer l’invitation
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button className="btn" onClick={invite}>
            ➕ Inviter quelqu’un dans le foyer
          </button>
        </div>
      )}
      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          J’ai reçu un code pour rejoindre un autre foyer
        </summary>
        <form
          className="row"
          style={{ marginTop: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!confirm('Rejoindre ce foyer ? Vous verrez son planning et sa liste de courses à la place de ceux-ci (votre profil vous suit).')) return;
            try {
              await joinHousehold(joinCode);
              toast('Foyer rejoint ✅');
            } catch (err) {
              toast((err as Error).message);
            }
          }}
        >
          <input className="input" style={{ maxWidth: 180, textTransform: 'uppercase' }} placeholder="CODE" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
          <button className="btn sm" disabled={joinCode.trim().length < 6}>
            Rejoindre
          </button>
        </form>
      </details>
      {(cloud.members?.length ?? 0) > 1 && (
        <div>
          <button
            className="btn ghost sm danger"
            onClick={async () => {
              if (!confirm('Quitter ce foyer ? Vous repartirez avec un foyer personnel (les données de ce téléphone).')) return;
              try {
                await leaveHousehold();
              } catch (err) {
                toast((err as Error).message);
              }
            }}
          >
            Quitter ce foyer
          </button>
        </div>
      )}
    </section>
  );
}

export function Account() {
  const cloud = useCloud();
  const toast = useToast();

  if (!cloudEnabled)
    return (
      <div className="page narrow stack">
        <h1>👤 Mon compte</h1>
        <div className="callout">Les comptes ne sont pas encore activés sur ce site. En attendant, vos données restent enregistrées dans ce navigateur (Réglages → Sauvegarde pour les transférer).</div>
      </div>
    );

  if (!cloud.email)
    return (
      <div className="page narrow stack" style={{ gap: 18 }}>
        <h1>👤 Mon compte</h1>
        <p className="muted" style={{ margin: 0 }}>
          Un compte gratuit pour retrouver votre semaine et votre profil sur tous vos appareils, et partager le planning et la liste de courses avec votre foyer. Sans compte, l’appli fonctionne aussi, uniquement sur cet appareil.
        </p>
        <LoginForm />
      </div>
    );

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <h1>👤 Mon compte</h1>
      {cloud.pendingImport && (
        <section className="card pad stack" style={{ borderColor: 'var(--primary)' }}>
          <h2 style={{ margin: 0 }}>📥 Données de ce téléphone</h2>
          <p className="small" style={{ margin: 0 }}>
            Ce téléphone contient déjà des données (planning, favoris, courses, profils…). Voulez-vous les ajouter à votre foyer « {cloud.household?.name} » ?
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => resolveImport(true)}>
              Oui, les ajouter au foyer
            </button>
            <button className="btn" onClick={() => resolveImport(false)}>
              Non, utiliser celles du foyer
            </button>
          </div>
        </section>
      )}
      <section className="card pad stack">
        <div>
          Connecté·e : <strong>{cloud.email}</strong>
        </div>
        <div className={`callout small ${cloud.status === 'error' ? 'danger' : cloud.status === 'synced' ? 'ok' : ''}`} style={{ margin: 0 }}>
          {STATUS[cloud.status] ?? ''}
          {cloud.lastSync && cloud.status === 'synced' && <span className="muted"> — {new Date(cloud.lastSync).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>}
          {!!cloud.pending && <div className="muted">{cloud.pending} modification(s) en attente d’envoi</div>}
          {cloud.household && <div className="muted">{cloud.live ? '⚡ Temps réel actif' : '🔁 Mise à jour automatique toutes les 20 s'}</div>}
          {cloud.error && cloud.status === 'error' && <div className="muted">{cloud.error}</div>}
        </div>
        {!!cloud.missing?.length && (
          <div className="callout small" style={{ margin: 0 }}>
            ⚠️ Le serveur ne trouve pas {cloud.missing.length > 1 ? 'les tables' : 'la table'} <code>{cloud.missing.join(', ')}</code> : ces données restent sur ce téléphone, tout le reste se synchronise. Dans Supabase, relancez le fichier <code>supabase/migrations/20261006000000_foyers.sql</code> (SQL Editor → Run), puis touchez « Synchroniser maintenant ».
          </div>
        )}
        {cloud.legacy && (
          <div className="callout small" style={{ margin: 0 }}>
            Le serveur utilise encore l’ancienne sauvegarde (une copie par compte). Pour activer les foyers partagés et la liste de courses en direct, exécutez la migration <code>supabase/migrations/20261006000000_foyers.sql</code> dans Supabase (voir le README).
          </div>
        )}
        <div className="row">
          <button className="btn" onClick={() => syncNow(true)}>
            🔄 Synchroniser maintenant
          </button>
          <Link className="btn" to="/reglages">
            ✏️ Profils et réglages
          </Link>
        </div>
      </section>

      <HouseholdCard />
      {cloud.recovery ? <NewPassword /> : <PasswordCard />}

      <section className="card pad stack">
        <h2 style={{ margin: 0 }}>Se déconnecter</h2>
        <p className="small muted" style={{ margin: 0 }}>Vos données restent dans votre foyer. Elles sont effacées de cet appareil pour qu’une autre personne puisse s’y connecter.</p>
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
              if (!confirm('Supprimer vos données en ligne et quitter le foyer ? (cet appareil sera aussi vidé)')) return;
              await deleteCloudData();
              toast('Données en ligne supprimées');
            }}
          >
            Supprimer mes données en ligne
          </button>
        </div>
      </section>
    </div>
  );
}

/** Lien d'invitation : #/rejoindre/CODE */
export function JoinHousehold() {
  const { code = '' } = useParams();
  const cloud = useCloud();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      sessionStorage.setItem('cuisine.afterLogin', `#/rejoindre/${code}`);
    } catch {
      /* stockage indisponible */
    }
  }, [code]);

  if (!cloudEnabled) return <div className="page narrow">Les comptes ne sont pas activés sur ce site.</div>;
  if (!cloud.email)
    return (
      <div className="page narrow stack" style={{ gap: 18 }}>
        <h1>🏡 Rejoindre un foyer</h1>
        <LoginForm intro="On vous invite à partager un planning et une liste de courses. Connectez-vous ou créez votre compte (gratuit) pour rejoindre ce foyer." />
      </div>
    );

  return (
    <div className="page narrow stack" style={{ gap: 18 }}>
      <h1>🏡 Rejoindre un foyer</h1>
      <section className="card pad stack">
        <p style={{ margin: 0 }}>
          Code d’invitation : <strong>{code.toUpperCase()}</strong>
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          Vous partagerez le planning, la liste de courses, le garde-manger et les favoris de ce foyer. Votre profil (besoins, goûts, objectifs) vous suit.
          {cloud.household ? ` Vous quitterez l’affichage du foyer « ${cloud.household.name} » sur cet appareil.` : ''}
        </p>
        {error && <div className="callout danger small">{error}</div>}
        <button
          className="btn primary lg"
          disabled={state === 'busy' || cloud.pendingImport}
          onClick={async () => {
            setState('busy');
            try {
              await joinHousehold(code);
              toast('Bienvenue dans le foyer ✅');
              navigate('/');
            } catch (e) {
              setError((e as Error).message);
              setState('error');
            }
          }}
        >
          {state === 'busy' ? 'Un instant…' : 'Rejoindre ce foyer'}
        </button>
      </section>
    </div>
  );
}

/** Choisir ou changer son mot de passe une fois connecté (après une connexion par e-mail) */
function PasswordCard() {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <section className="card pad stack">
        <div className="row between nowrap">
          <span className="small">🔑 Connecté·e par e-mail ? Choisissez un mot de passe pour vous connecter directement, y compris dans l’appli installée sur l’écran d’accueil.</span>
          <button className="btn sm" onClick={() => setOpen(true)}>
            Choisir
          </button>
        </div>
      </section>
    );
  return <NewPassword />;
}

function NewPassword() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <section className="card pad stack">
      <h2 style={{ margin: 0 }}>🔑 Mon mot de passe</h2>
      <input className="input" type="password" autoComplete="new-password" minLength={6} placeholder="6 caractères minimum" aria-label="Nouveau mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} />
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

/** Mon nom dans le foyer, modifiable */
function MyName({ name, owner }: { name: string; owner: boolean }) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(name);
  const toast = useToast();
  if (!edit)
    return (
      <div className="small row nowrap" style={{ gap: 6 }}>
        <span>
          {owner ? '👑' : '👤'} <strong>{name}</strong> <span className="muted">(vous)</span>
        </span>
        <button className="btn ghost sm" onClick={() => setEdit(true)}>
          ✏️ Changer mon nom
        </button>
      </div>
    );
  return (
    <form
      className="row nowrap"
      style={{ gap: 6 }}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await setDisplayName(value);
          setEdit(false);
          toast('Nom mis à jour ✅');
        } catch (err) {
          toast((err as Error).message);
        }
      }}
    >
      <input className="input" value={value} maxLength={40} aria-label="Mon nom dans le foyer" onChange={(e) => setValue(e.target.value)} autoFocus />
      <button className="btn sm primary">OK</button>
    </form>
  );
}
