import { lazy, StrictMode, Suspense, useEffect, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/app.css';
import { LibraryProvider, UserDataProvider, useLibrary } from './hooks/library';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
const Recipes = lazyPage(() => import('./pages/Recipes').then((m) => ({ default: m.Recipes })));
const RecipeDetail = lazyPage(() => import('./pages/RecipeDetail').then((m) => ({ default: m.RecipeDetail })));
const CookMode = lazyPage(() => import('./pages/CookMode').then((m) => ({ default: m.CookMode })));
const Fridge = lazyPage(() => import('./pages/Fridge').then((m) => ({ default: m.Fridge })));
const Pantry = lazyPage(() => import('./pages/Pantry').then((m) => ({ default: m.Pantry })));
const Planner = lazyPage(() => import('./pages/Planner').then((m) => ({ default: m.Planner })));
const Shopping = lazyPage(() => import('./pages/Shopping').then((m) => ({ default: m.Shopping })));
const Favorites = lazyPage(() => import('./pages/Favorites').then((m) => ({ default: m.Favorites })));
const RecipeForm = lazyPage(() => import('./pages/RecipeForm').then((m) => ({ default: m.RecipeForm })));
const Stats = lazyPage(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));
const Settings = lazyPage(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Sources = lazyPage(() => import('./pages/Sources').then((m) => ({ default: m.Sources })));
const Needs = lazyPage(() => import('./pages/Needs').then((m) => ({ default: m.Needs })));
const Me = lazyPage(() => import('./pages/Me').then((m) => ({ default: m.Me })));
const MyDay = lazyPage(() => import('./pages/MyDay').then((m) => ({ default: m.MyDay })));
const Learned = lazyPage(() => import('./pages/Learned').then((m) => ({ default: m.Learned })));
const Weight = lazyPage(() => import('./pages/Weight').then((m) => ({ default: m.Weight })));
const Batch = lazyPage(() => import('./pages/Batch').then((m) => ({ default: m.Batch })));
import { StravaReturn } from './components/StravaReturn';
import { WhoAmI } from './components/WhoAmI';
const MyWeek = lazyPage(() => import('./pages/MyWeek').then((m) => ({ default: m.MyWeek })));
const Account = lazyPage(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const JoinHousehold = lazyPage(() => import('./pages/Account').then((m) => ({ default: m.JoinHousehold })));
import { Onboarding } from './components/Onboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initCloud } from './cloud/sync';
import { removeComposedRecipes } from './db/db';
import { installDomGuard, logIncident } from './domGuard';

/**
 * Pages chargées à la demande (première ouverture plus rapide). Après une mise
 * à jour du site, un ancien morceau peut avoir disparu : on recharge une fois.
 */
function lazyPage<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((e) => {
      const KEY = 'cuisine.chunkReload';
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        location.reload();
      }
      throw e;
    }),
  );
}

// Extensions de navigateur qui modifient la page : éviter le plantage au changement de page
installDomGuard();
window.addEventListener('error', (e) => logIncident(`erreur : ${e.message}`));
window.addEventListener('unhandledrejection', (e) => logIncident(`promesse : ${(e.reason as Error)?.message ?? String(e.reason)}`));

// Thème mémorisé (clair / sombre / auto)
try {
  const t = localStorage.getItem('cuisine.theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch {
  /* stockage indisponible */
}

// Demande au navigateur de ne pas effacer la base locale (recettes ajoutées, planning…)
navigator.storage?.persist?.().catch(() => {});

// Compte et synchronisation (si activés dans src/cloud/config.ts)
initCloud();
// après le démarrage de la synchronisation, pour que les suppressions partent aussi vers le foyer
setTimeout(() => void removeComposedRecipes(), 4000);

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Shell() {
  const { ready } = useLibrary();
  const { pathname } = useLocation();
  if (!ready)
    return (
      <div className="loading-screen">
        <div>
          <div className="spinner" />
          <p className="muted">Ouverture de la bibliothèque…</p>
        </div>
      </div>
    );
  return (
    <Suspense fallback={<div className="page center muted">Chargement…</div>}>
    <Routes>
      <Route path="/recette/:id/cuisine" element={<CookMode />} />
      <Route
        path="*"
        element={
          <Layout>
            <ErrorBoundary resetKey={pathname}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/recettes" element={<Recipes />} />
                <Route path="/recette/:id" element={<RecipeDetail />} />
                <Route path="/frigo" element={<Fridge />} />
                <Route path="/garde-manger" element={<Pantry />} />
                <Route path="/semaine" element={<Planner />} />
                <Route path="/courses" element={<Shopping />} />
                <Route path="/favoris" element={<Favorites />} />
                <Route path="/ajouter" element={<RecipeForm key="new" />} />
                <Route path="/modifier/:id" element={<RecipeForm />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/reglages" element={<Settings />} />
                <Route path="/moi" element={<Me />} />
                <Route path="/besoins" element={<Needs />} />
                <Route path="/ma-journee" element={<MyDay />} />
                <Route path="/appris" element={<Learned />} />
                <Route path="/poids" element={<Weight />} />
                <Route path="/batch" element={<Batch />} />
                <Route path="/ma-semaine" element={<MyWeek />} />
                <Route path="/besoins/:id" element={<Needs />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/compte" element={<Account />} />
                <Route path="/rejoindre/:code" element={<JoinHousehold />} />
                <Route path="/acheter" element={<Navigate to="/courses" replace />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </ErrorBoundary>
            <Onboarding />
            <StravaReturn />
            <WhoAmI />
          </Layout>
        }
      />
    </Routes>
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <ScrollTop />
        <ToastProvider>
          <LibraryProvider>
            <UserDataProvider>
              <Shell />
            </UserDataProvider>
          </LibraryProvider>
        </ToastProvider>
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
