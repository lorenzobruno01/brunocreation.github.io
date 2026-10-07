import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useStoredProfiles, useUserData } from '../hooks/library';
import { setActiveProfile, useActiveProfile } from '../hooks/activeProfile';
import { Sheet } from './ui';
import { cloudEnabled, useCloud } from '../cloud/sync';
import { BRAND } from '../config/brand';

const TABS = [
  { to: '/', label: 'Accueil', icon: '🏠', end: true },
  { to: '/recettes', label: 'Recettes', icon: '🍽️' },
  { to: '/semaine', label: 'Planning', icon: '📅' },
  { to: '/courses', label: 'Courses', icon: '🛒' },
  { to: '/moi', label: 'Moi', icon: '👤' },
];

export function Layout({ children }: { children: ReactNode }) {
  const [who, setWho] = useState(false);
  const profiles = useStoredProfiles() ?? [];
  const active = useActiveProfile(profiles);
  const { basket } = useUserData();
  const cloud = useCloud();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <img className="brand-mark" src="icon.svg" alt="" width={32} height={32} />
            <span>{BRAND.name}</span>
          </Link>
          <nav className="topnav" aria-label="Navigation principale">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end}>
                {t.icon} {t.label}
              </NavLink>
            ))}
            <NavLink to="/favoris">❤️ Favoris</NavLink>
          </nav>
          <div className="topbar-actions">
            <Link to="/recettes?focus=1" className="icon-btn" aria-label="Rechercher" style={{ textDecoration: 'none' }}>
              🔎
            </Link>
            {profiles.length > 1 && (
              <button className="who-btn" onClick={() => setWho(true)} aria-label={`Profil actif : ${active.name}. Changer`} title="Qui regarde ?">
                {active.sex === 'homme' ? '👨' : '👩'} <span>{active.name}</span>
              </button>
            )}
            {cloudEnabled && (
              <Link to="/compte" className="icon-btn" aria-label={cloud.email ? `Compte : ${cloud.email}` : 'Se connecter'} title={cloud.email ?? 'Se connecter'} style={{ textDecoration: 'none', position: 'relative' }}>
                {cloud.email ? '☁️' : '🔑'}
                {cloud.email && <span className={`sync-dot ${cloud.status}`} />}
              </Link>
            )}

          </div>
        </div>
      </header>
      <main>
        {cloud.pendingImport && (
          <Link to="/compte" className="callout info small row between" style={{ textDecoration: 'none', color: 'inherit', margin: '12px 16px 0' }}>
            <span>📥 Des données de ce téléphone peuvent être ajoutées à votre foyer.</span>
            <span>›</span>
          </Link>
        )}
        {children}
      </main>
      <nav className="tabbar" aria-label="Navigation">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <span className="ti">{t.icon}</span>
            {t.label}
            {t.to === '/courses' && basket.size > 0 && <span className="badge-dot">{basket.size}</span>}
          </NavLink>
        ))}
      </nav>
      {who && (
        <Sheet title="Qui regarde ?" onClose={() => setWho(false)}>
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>
              Les pourcentages des recettes, « Mes besoins » et l’affichage des chiffres suivent le profil choisi sur ce téléphone.
            </p>
            <div className="choice-list">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className={`choice ${p.id === active.id ? 'on' : ''}`}
                  onClick={() => {
                    setActiveProfile(p.id);
                    setWho(false);
                  }}
                >
                  <span className="ce">{p.sex === 'homme' ? '👨' : '👩'}</span>
                  <strong>{p.name}</strong>
                </button>
              ))}
            </div>
            <Link to="/besoins" className="btn" onClick={() => setWho(false)}>
              🎯 Voir les besoins de {active.name}
            </Link>
          </div>
        </Sheet>
      )}

    </div>
  );
}
