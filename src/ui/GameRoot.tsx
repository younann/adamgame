'use client';

import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/state/gameStore';
import { registerServiceWorker } from '@/pwa/register';
import { usePwaInstall } from '@/pwa/usePwaInstall';
import type { GameEngine } from '@/game/engine/GameEngine';
import { logError } from '@/game/engine/errorLog';
import { Hud } from './Hud';
import { Captions } from './Captions';
import { PauseOverlay } from './PauseOverlay';
import { SparkyFixing } from './SparkyFixing';
import { A11yChoices } from './A11yChoices';
import { DebugOverlay } from './DebugOverlay';
import { LoadingScreen } from './LoadingScreen';

/**
 * The full-screen game shell: Pixi canvas (the game) with a thin DOM layer on top
 * (HUD, captions, pause, accessibility). No page scrolling, zooming or selection.
 */
export default function GameRoot() {
  const hostRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [ready, setReady] = useState(false);
  // capture beforeinstallprompt early so the Parent Zone can offer installation
  usePwaInstall();

  useEffect(() => {
    let cancelled = false;
    registerServiceWorker();
    (async () => {
      try {
        await useGame.getState().hydrate();
        const { GameEngine } = await import('@/game/engine/GameEngine');
        if (cancelled || !hostRef.current) return;
        const e = new GameEngine();
        engineRef.current = e;
        await e.init(hostRef.current);
        if (cancelled) {
          e.destroy();
          return;
        }
        (window as unknown as { __adam?: unknown }).__adam = process.env.NODE_ENV !== 'production' ? e : undefined;
        if (process.env.NODE_ENV !== 'production') (window as unknown as { __adamStore?: unknown }).__adamStore = useGame;
        setEngine(e);
        setReady(true);
        await e.scenes.goto('boot');
      } catch (err) {
        logError('engine-init', err);
        useGame.getState().setSparkyFixing(true);
      }
    })();
    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  // block pinch-zoom / double-tap zoom / context menu inside the game shell
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', prevent);
    el.addEventListener('contextmenu', prevent);
    el.addEventListener('dblclick', prevent);
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    el.addEventListener('touchmove', touchMove, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('contextmenu', prevent);
      el.removeEventListener('dblclick', prevent);
      el.removeEventListener('touchmove', touchMove);
    };
  }, []);

  return (
    <div ref={shellRef} className="game-shell" dir="rtl">
      <div ref={hostRef} className="absolute inset-0" />
      {!ready && <LoadingScreen />}
      {engine && <Hud engine={engine} shell={shellRef} />}
      <Captions />
      {engine && <PauseOverlay engine={engine} />}
      <SparkyFixing />
      <A11yChoices />
      {process.env.NODE_ENV !== 'production' && engine && <DebugOverlay engine={engine} />}
    </div>
  );
}
