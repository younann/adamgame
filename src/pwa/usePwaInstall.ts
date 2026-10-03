'use client';

import { useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Captured globally so the event isn't lost if it fires before the Parent Zone mounts. */
let deferred: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // never show the browser's child-facing mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedFlag = true;
    notify();
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', notify);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return !!(window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || nav.standalone === true);
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac with touch
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export interface PwaInstallState {
  canPrompt: boolean;
  prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'>;
  isStandalone: boolean;
  isIOS: boolean;
  isInstalled: boolean;
}

export function usePwaInstall(): PwaInstallState {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const isStandalone = useSyncExternalStore(subscribe, detectStandalone, () => false);
  const isIOS = useSyncExternalStore(subscribe, detectIOS, () => false);

  const prompt = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    const ev = deferred;
    await ev.prompt();
    const choice = await ev.userChoice;
    deferred = null;
    notify();
    return choice.outcome;
  }, []);

  return { canPrompt: !!deferred, prompt, isStandalone, isIOS, isInstalled: isStandalone || installedFlag };
}
