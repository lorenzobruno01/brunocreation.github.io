// ─────────────────────────────────────────────────────────────
// Protection contre les extensions de navigateur (gestionnaires de
// mots de passe, traducteurs, correcteurs…) qui modifient la page
// à l'insu de React : au changement de page, React ne retrouve plus
// ses éléments et l'affichage plante (« removeChild » / « insertBefore »).
// Parade recommandée sur le dépôt de React (issue #11538).
// ─────────────────────────────────────────────────────────────
export function installDomGuard() {
  if (typeof Node !== 'function' || !Node.prototype) return;
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) return child.parentNode.removeChild(child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}

/** Journal des derniers incidents (pour le diagnostic, consultable dans Réglages) */
export function logIncident(message: string, where = location.hash) {
  try {
    const list: Array<{ at: string; where: string; message: string }> = JSON.parse(localStorage.getItem('cuisine.incidents') ?? '[]');
    list.unshift({ at: new Date().toISOString(), where, message: message.slice(0, 600) });
    localStorage.setItem('cuisine.incidents', JSON.stringify(list.slice(0, 10)));
  } catch {
    /* stockage indisponible */
  }
}

export function readIncidents(): Array<{ at: string; where: string; message: string }> {
  try {
    return JSON.parse(localStorage.getItem('cuisine.incidents') ?? '[]');
  } catch {
    return [];
  }
}

export function clearIncidents() {
  try {
    localStorage.removeItem('cuisine.incidents');
  } catch {
    /* stockage indisponible */
  }
}
