// input.js — clavier (ZQSD / WASD / flèches), souris et manette (gamepad).
// Expose un vecteur de déplacement normalisé et une détection « justPressed »
// pour la navigation des menus.

const keys = new Set();
const justPressed = new Set();

const MOVE = {
  up: ['KeyW', 'KeyZ', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'KeyQ', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

const anyDown = (codes) => {
  for (let i = 0; i < codes.length; i++) if (keys.has(codes[i])) return true;
  return false;
};

export const Input = {
  mouse: { x: 0, y: 0, down: false, clicked: false },
  _gamepadIndex: null,

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) justPressed.add(e.code);
      keys.add(e.code);
      if (PREVENT.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => {
      keys.clear();
      this.mouse.down = false;
    });

    const setMouse = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    canvas.addEventListener('mousemove', setMouse);
    canvas.addEventListener('mousedown', (e) => {
      setMouse(e);
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });

    window.addEventListener('gamepadconnected', (e) => {
      this._gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this._gamepadIndex = null;
    });
  },

  isDown(code) {
    return keys.has(code);
  },

  // Vrai une seule fois par appui (consommé en fin de frame).
  pressed(...codes) {
    for (const c of codes) if (justPressed.has(c)) return true;
    return false;
  },

  // Vecteur de déplacement normalisé (clavier + stick gauche manette).
  moveVector(out) {
    let x = 0;
    let y = 0;
    if (anyDown(MOVE.left)) x -= 1;
    if (anyDown(MOVE.right)) x += 1;
    if (anyDown(MOVE.up)) y -= 1;
    if (anyDown(MOVE.down)) y += 1;

    const gp = this._gamepad();
    if (gp) {
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      if (Math.abs(ax) > 0.2) x += ax;
      if (Math.abs(ay) > 0.2) y += ay;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    out.x = x;
    out.y = y;
    return out;
  },

  // Bouton « valider » (Entrée / Espace / clic / bouton A manette).
  confirmPressed() {
    if (this.pressed('Enter', 'Space')) return true;
    if (this.mouse.clicked) return true;
    const gp = this._gamepad();
    if (gp && gp.buttons[0] && gp.buttons[0].pressed && !this._aWasDown) {
      this._aWasDown = true;
      return true;
    }
    if (gp && (!gp.buttons[0] || !gp.buttons[0].pressed)) this._aWasDown = false;
    return false;
  },

  _gamepad() {
    if (this._gamepadIndex == null || !navigator.getGamepads) return null;
    return navigator.getGamepads()[this._gamepadIndex] || null;
  },

  // À appeler en fin de frame (après update + render).
  endFrame() {
    justPressed.clear();
    this.mouse.clicked = false;
  },
};
