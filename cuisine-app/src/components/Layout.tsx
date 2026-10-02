import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useUserData } from '../hooks/library';
import { Sheet } from './ui';

const TABS = [
  { to: '/', label: 'Accueil', icon: '🏠', end: true },
  { to: '/recettes', label: 'Recettes', icon: '🍽️' },
  { to: '/frigo', label: 'Frigo', icon: '🥕' },
  { to: '/semaine', label: 'Semaine', icon: '📅' },
  { to: '/courses', label: 'Courses', icon: '🛒' },
];

const MORE = [
  { to: '/favoris', label: 'Mes favoris & historique', icon: '❤️' },
  { to: '/garde-manger', label: 'Garde-manger', icon: '🏠' },
  { to: '/ajouter', label: 'Ajouter une recette', icon: '➕' },
  { to: '/stats', label: 'Statistiques de la bibliothèque', icon: '📊' },
  { to: '/sources', label: 'Sources & méthode nutritionnelle', icon: '📚' },
  { to: '/reglages', label: 'Réglages & sauvegarde', icon: '⚙️' },
];

export function Layout({ children }: { children: ReactNode }) {
  const [more, setMore] = useState(false);
  const { basket } = useUserData();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">🍲</span>
            <span>Notre Cuisine</span>
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
            <button className="icon-btn" aria-label="Menu" onClick={() => setMore(true)}>
              ☰
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <nav className="tabbar" aria-label="Navigation">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <span className="ti">{t.icon}</span>
            {t.label}
            {t.to === '/courses' && basket.size > 0 && <span className="badge-dot">{basket.size}</span>}
          </NavLink>
        ))}
      </nav>
      {more && (
        <Sheet title="Menu" onClose={() => setMore(false)}>
          <div className="menu-list" onClick={() => setMore(false)}>
            {MORE.map((m) => (
              <Link key={m.to} to={m.to}>
                <span className="mi">{m.icon}</span>
                {m.label}
              </Link>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
