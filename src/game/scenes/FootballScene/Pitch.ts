/**
 * Perspective model of the pitch. v = depth (0 = goal line, 1 = near camera), u = -1..1 across.
 * Phone portrait: goal high above Adam. Tablet landscape: the same model with a wider
 * stadium, so Adam and the goalkeeper are both large and visible.
 */
export interface Pitch {
  w: number;
  h: number;
  cx: number;
  U: number;
  goalY: number;
  nearY: number;
  farHalf: number;
  nearHalf: number;
  sFar: number;
  sNear: number;
  goalHalf: number;
  goalH: number;
  horizonY: number;
  pitchTop: number;
  landscape: boolean;
  y(v: number): number;
  half(v: number): number;
  x(u: number, v: number): number;
  s(v: number): number;
}

export function makePitch(w: number, h: number, safeTop: number, safeBottom: number): Pitch {
  const landscape = w > h * 1.1;
  const U = landscape ? Math.min(w * 0.5, h * 0.62) : Math.min(w, h * 0.56);
  const goalHalf = U * 0.37;
  const goalH = goalHalf * 0.88;
  const topReserve = safeTop + (landscape ? 64 : 84);
  const goalY = Math.max(h * (landscape ? 0.42 : 0.36), topReserve + goalH + U * 0.12);
  const nearTarget = h - safeBottom - (landscape ? 40 : 70);
  const nearY = goalY + (nearTarget - goalY) / 0.72;
  const farHalf = landscape ? w * 0.42 : U * 0.62;
  const nearHalf = landscape ? w * 0.95 : U * 1.25;
  const sNear = (U / 390) * (landscape ? 1.05 : 1.0);
  const sFar = sNear * 0.5;
  const cx = w / 2;
  const horizonY = Math.max(safeTop + 10, goalY - goalH - U * (landscape ? 0.42 : 0.5));
  const pitchTop = goalY - goalH * 0.32;
  const y = (v: number) => goalY + (nearY - goalY) * v;
  const half = (v: number) => farHalf + (nearHalf - farHalf) * v;
  return {
    w, h, cx, U, goalY, nearY, farHalf, nearHalf, sFar, sNear, goalHalf, goalH, horizonY, pitchTop, landscape,
    y,
    half,
    x: (u: number, v: number) => cx + u * half(v),
    s: (v: number) => sFar + (sNear - sFar) * v,
  };
}
