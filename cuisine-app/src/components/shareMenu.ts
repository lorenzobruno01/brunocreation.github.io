// Menu de la semaine en image (1080 × 1350, format portrait des messageries)
import type { IndexedRecipe, PlanEntry, Slot } from '../domain/types';
import { BRAND } from '../config/brand';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SLOT_ICON: Record<Slot, string> = { matin: '🌅', midi: '☀️', collation: '🍎', soir: '🌙' };

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

export async function weekMenuImage(dates: string[], plan: PlanEntry[], byId: Map<string, IndexedRecipe>, slots: Slot[], badge: boolean): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f8e3d8');
  g.addColorStop(1, '#fbf6ef');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b1d14';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('Notre menu de la semaine', 64, 120);
  ctx.font = '32px system-ui, sans-serif';
  ctx.fillStyle = '#7a5a45';
  const d0 = new Date(dates[0] + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const d6 = new Date(dates[6] + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  ctx.fillText(`du ${d0} au ${d6}${badge ? '  ·  🏆 100 % des besoins couverts' : ''}`, 64, 172);
  const shown = slots.filter((s) => s === 'midi' || s === 'soir').length ? slots.filter((s) => s === 'midi' || s === 'soir') : slots;
  const rowH = (H - 300) / 7;
  dates.forEach((date, i) => {
    const y = 220 + i * rowH;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.roundRect(48, y, W - 96, rowH - 12, 24);
    ctx.fill();
    ctx.fillStyle = '#c2552d';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(DAYS[i], 80, y + 52);
    ctx.font = '30px system-ui, sans-serif';
    ctx.fillStyle = '#2b1d14';
    shown.forEach((slot, k) => {
      const e = plan.find((x) => x.date === date && x.slot === slot);
      const r = e && byId.get(e.recipeId);
      const label = r ? `${SLOT_ICON[slot]} ${r.name}` : `${SLOT_ICON[slot]} —`;
      ctx.fillText(fit(ctx, label, W - 380), 300, y + 52 + k * 44);
    });
  });
  ctx.fillStyle = '#7a5a45';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText(`${BRAND.emoji} ${BRAND.name} — ${BRAND.tagline}`, 64, H - 40);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

/** Partage (téléphone) ou téléchargement (ordinateur) */
export async function shareImage(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
