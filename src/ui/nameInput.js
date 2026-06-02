// nameInput.js — champ <input> DOM pour saisir le pseudo (overlay sur le canvas).
// stopPropagation des touches pour que la saisie n'atteigne pas les contrôles du jeu.

export function createNameInput(getName, setName) {
  const el = document.createElement('input');
  el.type = 'text';
  el.maxLength = 16;
  el.placeholder = 'Ton pseudo';
  el.className = 'prisma-name';
  el.autocomplete = 'off';
  el.spellcheck = false;
  el.value = getName() || '';

  // Empêche les touches de saisie d'atteindre les écouteurs du jeu (déplacement,
  // « commencer », etc.).
  const stop = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') el.blur();
  };
  el.addEventListener('keydown', stop);
  el.addEventListener('keyup', (e) => e.stopPropagation());
  el.addEventListener('input', () => setName(el.value));

  document.getElementById('app').appendChild(el);

  return {
    el,
    position(cx, y, w) {
      el.style.left = cx + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
    },
    show() {
      el.style.display = 'block';
    },
    hide() {
      el.style.display = 'none';
    },
    value() {
      return el.value.trim();
    },
    destroy() {
      el.remove();
    },
  };
}
