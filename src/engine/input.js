// input.js — clavier (ZQSD / WASD / flèches), souris, tactile et manette.
// Expose un vecteur de déplacement normalisé et une détection « justPressed »
// pour la navigation des menus.
//
// Tactile : un stick virtuel apparaît là où le pouce se pose (moitié gauche de
// l'écran, seulement quand la scène de jeu l'active via touch.stickEnabled) ;
// des boutons virtuels (dash/bombe/burst/pause) sont mappés sur les touches
// clavier correspondantes ; tout autre tap est traité comme un clic souris
// (menus, cartes d'upgrade, reprise de pause).

import { CONFIG } from '../config.js';

const keys = new Set();
const justPressed = new Set();

const STICK_RADIUS = 52; // rayon (px) de la course du stick virtuel
const STICK_DEADZONE = 8;

const MOVE = {
  up: ['KeyW', 'KeyZ', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'KeyQ', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'F3']);

const anyDown = (codes) => {
  for (let i = 0; i < codes.length; i++) if (keys.has(codes[i])) return true;
  return false;
};

export const Input = {
  mouse: { x: 0, y: 0, down: false, clicked: false },
  // seen : au moins un contact tactile depuis le lancement -> le HUD affiche
  // les contrôles virtuels. stickEnabled : posé par la scène de jeu (les
  // overlays/menus reçoivent des taps « purs »).
  touch: { seen: false, stickEnabled: false, id: -1, baseX: 0, baseY: 0, knobX: 0, knobY: 0, vx: 0, vy: 0 },
  _btnTouch: {}, // identifier -> code de la touche virtuelle maintenue
  _touchButtons: null,
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

    // --- Tactile ---
    window.addEventListener('resize', () => (this._touchButtons = null));
    canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
  },

  // Boutons virtuels (positions écran CSS px), recalculés au resize.
  touchButtons() {
    if (!this._touchButtons) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this._touchButtons = [
        { code: 'Space', label: 'DASH', x: w - 66, y: h - 74, r: 38 },
        { code: 'KeyE', label: 'BOMBE', x: w - 156, y: h - 122, r: 28 },
        { code: 'KeyR', label: 'BURST', x: w - 66, y: h - 176, r: 28 },
        { code: 'Escape', label: 'II', x: w - 30, y: 74, r: 20 },
      ];
    }
    return this._touchButtons;
  },

  _hitTouchButton(x, y) {
    for (const b of this.touchButtons()) {
      const dx = x - b.x;
      const dy = y - b.y;
      const r = b.r + 8; // marge de tolérance
      if (dx * dx + dy * dy <= r * r) return b;
    }
    return null;
  },

  _onTouchStart(e) {
    e.preventDefault(); // supprime les clics souris synthétiques et le scroll
    this.touch.seen = true;
    for (const t of e.changedTouches) {
      const x = t.clientX;
      const y = t.clientY;
      const btn = this._hitTouchButton(x, y);
      if (btn) {
        justPressed.add(btn.code);
        keys.add(btn.code);
        this._btnTouch[t.identifier] = btn.code;
      } else if (this.touch.stickEnabled && this.touch.id < 0 && x < window.innerWidth * 0.55) {
        // Le stick naît là où le pouce se pose.
        this.touch.id = t.identifier;
        this.touch.baseX = this.touch.knobX = x;
        this.touch.baseY = this.touch.knobY = y;
        this.touch.vx = 0;
        this.touch.vy = 0;
      } else {
        // Tap = clic (menus, cartes d'upgrade, reprise de pause).
        this.mouse.x = x;
        this.mouse.y = y;
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    }
  },

  _onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== this.touch.id) continue;
      let dx = t.clientX - this.touch.baseX;
      let dy = t.clientY - this.touch.baseY;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        dx *= STICK_RADIUS / d;
        dy *= STICK_RADIUS / d;
      }
      this.touch.knobX = this.touch.baseX + dx;
      this.touch.knobY = this.touch.baseY + dy;
      if (d > STICK_DEADZONE) {
        this.touch.vx = dx / STICK_RADIUS;
        this.touch.vy = dy / STICK_RADIUS;
      } else {
        this.touch.vx = 0;
        this.touch.vy = 0;
      }
    }
  },

  _onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.touch.id) {
        this.touch.id = -1;
        this.touch.vx = 0;
        this.touch.vy = 0;
      }
      const code = this._btnTouch[t.identifier];
      if (code) {
        keys.delete(code);
        delete this._btnTouch[t.identifier];
      }
    }
    if (e.touches.length === 0) this.mouse.down = false;
  },

  isDown(code) {
    return keys.has(code);
  },

  // Vrai une seule fois par appui (consommé en fin de frame).
  pressed(...codes) {
    for (const c of codes) if (justPressed.has(c)) return true;
    return false;
  },

  // Vecteur de déplacement normalisé (clavier + stick manette + stick tactile).
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

    x += this.touch.vx;
    y += this.touch.vy;

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

  // Boutons manette -> touches virtuelles : A/RB = dash (Espace), B = bombe (E),
  // X = Prisma Burst (R), Start = pause (Échap). À appeler en début de frame.
  _padWas: {},
  pollGamepad() {
    const gp = this._gamepad();
    if (!gp) return;
    const MAP = [[0, 'Space'], [5, 'Space'], [1, 'KeyE'], [2, 'KeyR'], [9, 'Escape']];
    for (let i = 0; i < MAP.length; i++) {
      const btn = MAP[i][0];
      const code = MAP[i][1];
      const down = !!(gp.buttons[btn] && gp.buttons[btn].pressed);
      if (down && !this._padWas[btn]) {
        justPressed.add(code);
        keys.add(code);
      } else if (!down && this._padWas[btn]) {
        keys.delete(code);
      }
      this._padWas[btn] = down;
    }
  },

  // Vibration manette (Gamepad Haptics). Silencieuse si non gérée par la
  // manette ou le navigateur — aucun test de compatibilité à faire côté appelant.
  rumble(strength = 0.5, ms = 150) {
    if (!CONFIG.rumble.enabled) return;
    const gp = this._gamepad();
    const act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    try {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 });
    } catch {
      /* effet non géré : on ignore */
    }
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
