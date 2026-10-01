// Partie légère de l'IA (chargée immédiatement). Le SDK Anthropic et les
// prompts sont chargés à la demande, au premier usage de l'assistant.
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recommandé)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (plus économique)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (le plus rapide)' },
];

export class AiError extends Error {}

export const loadAi = () => import('./claude');
