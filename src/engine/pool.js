// pool.js — object pooling générique. Aucune allocation dans les boucles
// chaudes : les objets morts sont recyclés au lieu d'être collectés par le GC.
//
// Convention : chaque objet possède un booléen `alive`. Pour « tuer » un objet,
// mettre `alive = false` puis appeler `pool.sweep()` une fois par frame.

export class Pool {
  constructor(factory, initial = 0) {
    this.factory = factory; // () => nouvel objet
    this.active = []; // objets vivants (tableau dense)
    this.free = []; // objets recyclables
    for (let i = 0; i < initial; i++) this.free.push(factory());
  }

  get count() {
    return this.active.length;
  }

  // Récupère un objet (recyclé si possible) et le marque vivant.
  // L'appelant l'initialise ensuite (ex. obj.init(...)).
  obtain() {
    const o = this.free.length ? this.free.pop() : this.factory();
    o.alive = true;
    this.active.push(o);
    return o;
  }

  // Retire les objets morts (swap-remove O(1) par élément).
  sweep() {
    const a = this.active;
    for (let i = a.length - 1; i >= 0; i--) {
      if (!a[i].alive) {
        const o = a[i];
        a[i] = a[a.length - 1];
        a.pop();
        this.free.push(o);
      }
    }
  }

  forEach(fn) {
    const a = this.active;
    for (let i = 0; i < a.length; i++) fn(a[i], i);
  }

  // Recycle tout (réinitialisation de niveau/partie).
  clear() {
    const a = this.active;
    while (a.length) {
      const o = a.pop();
      o.alive = false;
      this.free.push(o);
    }
  }
}
