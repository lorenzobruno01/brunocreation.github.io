import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logIncident } from '../domGuard';

interface State {
  error: Error | null;
  /** nombre de nouvelles tentatives automatiques pour la page en cours */
  retries: number;
}

/**
 * Évite la page blanche. En cas d'erreur d'affichage, la page est d'abord
 * reconstruite automatiquement (deux fois au plus), puis rechargée ; si l'erreur
 * persiste malgré tout, un message s'affiche avec un bouton pour recharger.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null, retries: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    logIncident(`${error.name}: ${error.message}\n${(info.componentStack ?? '').split('\n').slice(0, 6).join('\n')}`);
    // fichier d'une ancienne version introuvable après une mise à jour du site : on recharge une fois
    if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)) {
      try {
        if (!sessionStorage.getItem('cuisine.reloaded')) {
          sessionStorage.setItem('cuisine.reloaded', '1');
          location.reload();
          return;
        }
      } catch {
        /* stockage indisponible */
      }
    }
    if (this.state.retries < 2) {
      setTimeout(() => this.setState((s) => ({ error: null, retries: s.retries + 1 })), 0);
      return;
    }
    // la reconstruction n'a pas suffi : rechargement automatique (au plus une fois toutes les 15 s)
    try {
      const last = Number(sessionStorage.getItem('cuisine.autoReload') ?? 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem('cuisine.autoReload', String(Date.now()));
        location.reload();
      }
    } catch {
      /* stockage indisponible */
    }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // changer de page repart de zéro
    if (prev.resetKey !== this.props.resetKey && (this.state.error || this.state.retries)) this.setState({ error: null, retries: 0 });
  }

  render() {
    if (!this.state.error) return <div key={this.state.retries} style={{ display: 'contents' }}>{this.props.children}</div>;
    if (this.state.retries < 2) return null; // reconstruction en cours
    return (
      <div className="page narrow stack" style={{ paddingTop: 40 }}>
        <h1>😕 Oups, cette page n’a pas pu s’afficher</h1>
        <p className="muted">Vos données ne sont pas perdues. Rechargez la page ; si le problème revient, envoyez le message ci-dessous.</p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2, #eee)', padding: 12, borderRadius: 12 }}>{this.state.error.message}</pre>
        <div>
          <button className="btn primary" onClick={() => location.reload()}>
            🔄 Recharger
          </button>
        </div>
      </div>
    );
  }
}
