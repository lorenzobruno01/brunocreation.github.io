import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
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
import { Assistant } from './pages/Assistant';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';

// Thème mémorisé (clair / sombre / auto)
try {
  const t = localStorage.getItem('cuisine.theme');
  if (t) document.documentElement.setAttribute('data-theme', t);
} catch {
  /* stockage indisponible */
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

function Shell() {
  const { ready } = useLibrary();
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
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/reglages" element={<Settings />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
  </StrictMode>,
);
