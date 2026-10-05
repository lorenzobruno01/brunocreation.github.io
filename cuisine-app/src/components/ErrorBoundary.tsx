import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Évite la page blanche : en cas d'erreur d'affichage, message + bouton pour recharger */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    // fichier d'une ancienne version introuvable après une mise à jour du site : on recharge une fois
    if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message)) {
      try {
        if (!sessionStorage.getItem('cuisine.reloaded')) {
          sessionStorage.setItem('cuisine.reloaded', '1');
          location.reload();
        }
      } catch {
        /* stockage indisponible */
      }
    }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // changer de page efface l'erreur
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page narrow stack" style={{ paddingTop: 40 }}>
        <h1>😕 Oups, cette page n’a pas pu s’afficher</h1>
        <p className="muted">Vos données ne sont pas perdues. Rechargez la page ; si le problème revient, envoyez le message ci-dessous.</p>
        <pre
          className="small"
          style={{
            whiteSpace: 'pre-wrap',
            background: 'var(--surface-2, #eee)',
            padding: 12,
            borderRadius: 12,
          }}
        >
          {this.state.error.message}
        </pre>
        <div>
          <button className="btn primary" onClick={() => location.reload()}>
            🔄 Recharger
          </button>
        </div>
      </div>
    );
  }
}
