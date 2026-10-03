import { useGame } from '@/state/gameStore';

let webgl2: boolean | null = null;

/** WebGL2 available and the parent hasn't switched to classic (2D) graphics. */
export function canUse3D(): boolean {
  if (useGame.getState().save.settings.graphics === 'classic') return false;
  if (webgl2 === null) {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      webgl2 = !!gl;
      (gl?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}
