// Profil actif sur CET appareil (« qui regarde ? ») — propre à chaque
// téléphone, donc gardé dans localStorage et jamais synchronisé.
import { useSyncExternalStore } from 'react';
import type { NutritionProfile } from '../domain/micronutrients';
import { useCloud } from '../cloud/sync';
import { useProfiles } from './library';

const KEY = 'cuisine.activeProfile';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveProfile(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* navigation privée : choix gardé le temps de la session */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

/** Profil choisi ; à défaut, celui du compte connecté, puis le premier */
export function useActiveProfile(list?: NutritionProfile[]): NutritionProfile {
  const all = useProfiles();
  const profiles = list?.length ? list : all;
  const id = useSyncExternalStore(subscribe, read, () => null);
  const cloud = useCloud();
  return profiles.find((p) => p.id === id) ?? profiles.find((p) => cloud.userId && p.userId === cloud.userId) ?? profiles[0];
}

/** Masquer calories et poids pour le profil actif */
export const useHideNumbers = () => !!useActiveProfile().hideNumbers;
