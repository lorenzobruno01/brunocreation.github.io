import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/app.css';
import { LibraryProvider, UserDataProvider, useLibrary } from './hooks/library';
import { ToastProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Recipes } from './pages/Recipes';
import { RecipeDetail } from './pages/RecipeDetail';
import { CookMode } from './pages/CookMode';
import { Fridge } from './pages/Fridge';
import { Pantry } from './pages/Pantry';
import { Planner } from './pages/Planner';
import { Shopping } from './pages/Shopping';
import { Favorites } from './pages/Favorites';
import { RecipeForm } from './pages/RecipeForm';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';
import { Needs } from './pages/Needs';
import { MyDay } from './pages/MyDay';
import { Learned } from './pages/Learned';
import { Weight } from './pages/Weight';
import { Batch } from './pages/Batch';
import { MyWeek } from './pages/MyWeek';
import { Account, JoinHousehold } from './pages/Account';
import { Onboarding } from './components/Onboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initCloud } from './cloud/sync';
import { installDomGuard, logIncident } from './domGuard';

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
          </Layout>
        }
      />
    </Routes>
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
