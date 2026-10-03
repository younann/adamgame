import { Container } from 'pixi.js';

/** A thing standing on the pitch, positioned in perspective (u across, v depth). */
export class Actor {
  u = 0;
  v = 0;
  lift = 0;
  k = 1;
  free = false;
  x = 0;
  y = 0;
  /** optional link to a learning choice (colour balls, cones, teammates…) */
  choiceId?: string;
  /** counting number shown on this object */
  num?: number;
  /** tap-bounce offset, animated separately so a bounce never stops a roll/move tween */
  readonly hop = { h: 0 };
  readonly inner = new Container();
  constructor(readonly view: Container) {
    view.addChild(this.inner);
  }
}
