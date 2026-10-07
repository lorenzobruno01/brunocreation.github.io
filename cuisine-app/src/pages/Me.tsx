import { Link } from 'react-router-dom';
import { useStoredProfiles } from '../hooks/library';
import { useActiveProfile } from '../hooks/activeProfile';
import { usePendingFeedback } from '../hooks/feedback';
import { useCloud } from '../cloud/sync';

interface Entry {
  to: string;
  icon: string;
  label: string;
  hint: string;
  badge?: string;
}

/** Onglet « Moi » : tout ce qui concerne la personne et le foyer, en un seul endroit */
export function Me() {
  const stored = useStoredProfiles() ?? [];
  const me = useActiveProfile(stored);
  const pending = usePendingFeedback(me.id);
  const cloud = useCloud();
  const sections: Array<{ title: string; items: Entry[] }> = [
    {
      title: 'Au quotidien',
      items: [
        { to: '/ma-journee', icon: '☀️', label: 'Ma journée', hint: 'mes repas, ma part, ce qu’il me manque' },
        { to: '/ma-semaine', icon: '📊', label: 'Mon bilan de la semaine', hint: 'vitamines et minéraux, manques, excès' },
        { to: '/appris', icon: '💬', label: 'Mes avis', hint: 'ce que l’appli a appris de mes goûts', badge: pending.length ? String(pending.length) : undefined },
        { to: '/poids', icon: '⚖️', label: 'Mon poids', hint: 'courbe et bilan sur 14 jours' },
      ],
    },
    {
      title: 'Mon profil',
      items: [
        { to: '/besoins', icon: '🎯', label: 'Mes besoins', hint: 'calories, protéines, vitamines : le calcul expliqué' },
        { to: '/reglages', icon: '🧍', label: 'Mon profil et mon foyer', hint: 'taille, sport, objectif, goûts, personnes' },
        { to: '/compte', icon: cloud.email ? '☁️' : '🔑', label: cloud.email ? 'Mon compte et mon foyer' : 'Me connecter', hint: cloud.email ? `${cloud.household?.name ?? 'Foyer'} · inviter, synchroniser` : 'retrouver mes données sur tous mes appareils' },
      ],
    },
    {
      title: 'Ma cuisine',
      items: [
        { to: '/frigo', icon: '🥕', label: 'J’ai ces ingrédients', hint: 'trouver un plat avec ce que j’ai, restes' },
        { to: '/favoris', icon: '❤️', label: 'Favoris et historique', hint: 'mes plats préférés et déjà cuisinés' },
        { to: '/garde-manger', icon: '🏠', label: 'Garde-manger', hint: 'ce que j’ai toujours dans mes placards' },
        { to: '/ajouter', icon: '➕', label: 'Ajouter une recette', hint: 'une recette de famille, un plat à moi' },
        { to: '/sources', icon: '📚', label: 'Sources et méthode', hint: 'études, livres, références' },
      ],
    },
  ];
  return (
    <div className="page stack">
      <h1 style={{ margin: 0 }}>
        {me.sex === 'homme' ? '👨' : '👩'} {stored.length ? me.name : 'Moi'}
      </h1>
      {sections.map((s) => (
        <section key={s.title} className="stack" style={{ gap: 6 }}>
          <h2 className="small muted" style={{ margin: '6px 0 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {s.title}
          </h2>
          <div className="card me-list">
            {s.items.map((it) => (
              <Link key={it.to} to={it.to} className="me-item">
                <span className="mi">{it.icon}</span>
                <span className="grow">
                  <strong>{it.label}</strong>
                  <span className="mh">{it.hint}</span>
                </span>
                {it.badge && <span className="badge-dot static">{it.badge}</span>}
                <span className="muted">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
