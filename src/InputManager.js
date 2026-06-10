/**
 * Unified input handler — abstracts mouse and touch into three events:
 *  - onChargeStart()  user begins holding
 *  - onChargeEnd()    user releases
 */
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this._onChargeStart = null;
    this._onChargeEnd = null;
    this._active = true;

    // Mouse
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (this._active) this._onChargeStart?.();
    });
    canvas.addEventListener('mouseup', (e) => {
      e.preventDefault();
      if (this._active) this._onChargeEnd?.();
    });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._active) this._onChargeStart?.();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this._active) this._onChargeEnd?.();
    }, { passive: false });
  }

  onChargeStart(fn) { this._onChargeStart = fn; }
  onChargeEnd(fn)   { this._onChargeEnd = fn; }

  enable()  { this._active = true; }
  disable() { this._active = false; }
}
