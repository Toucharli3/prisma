// postfx.js — chaîne de post-traitement GPU (WebGL2), en surcouche du jeu.
//
// POURQUOI DU WEBGL DANS UN JEU CANVAS 2D. La simulation et le dessin restent
// intégralement en Canvas 2D : rien de la boucle de jeu ne change. On ajoute
// seulement une DERNIÈRE étape — le canvas 2D est envoyé en texture, traité par
// quelques shaders, puis affiché. C'est la même idée que `@react-three/post-
// processing` : ce qui sépare « des sprites qui brillent » d'une belle image.
//
// Ce que le GPU permet et que le Canvas 2D ne permettait PAS :
//   - seuil sur la LUMINANCE avec un genou doux. La version Canvas 2D seuillait
//     en multipliant l'image par elle-même, donc canal par canal : un cyan
//     saturé et large (le champ de couleur) survivait autant qu'un projectile
//     minuscule, et débordait sur toute l'image. La luminance les sépare.
//   - un vrai flou gaussien séparable (2×9 prises) au lieu du flou approximatif
//     obtenu en réduisant puis agrandissant une image.
//   - aberration chromatique et distorsion radiales, impossibles sans shader.
//
// COÛT. Un seul contexte WebGL, un envoi de texture par frame, et 3 passes dont
// 2 en quart de résolution. Le travail GPU ne dépend pas du nombre d'entités.
//
// DISPOSITION DOM. Le canvas 2D reste en place et continue de recevoir tous les
// événements (souris, tactile) ; le canvas WebGL est posé PAR-DESSUS en
// `pointer-events: none`, donc l'entrée n'est pas touchée. Si WebGL2 est
// indisponible, `available` reste faux et le jeu retombe sur la chaîne Canvas 2D.

import { CONFIG } from '../config.js';

const VERT = `#version 300 es
// Triangle plein écran : moins cher qu'un quad, et pas de couture diagonale.
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Passe 1 — extraction des zones lumineuses, en quart de résolution.
const FRAG_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform float uThreshold;
uniform float uSoft;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  // Luminance perceptuelle (Rec. 709) : c'est ELLE qui distingue un projectile
  // blanc d'une grande nappe colorée, là où un test par canal échouait.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(uThreshold, uThreshold + uSoft, l);
  outColor = vec4(c * k, 1.0);
}`;

// Passe 2 — flou gaussien séparable (appliqué en H puis en V).
const FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir; // (1/w, 0) puis (0, 1/h)
out vec4 outColor;
void main() {
  float w[5] = float[](0.227027, 0.194594, 0.121621, 0.054054, 0.016216);
  vec3 sum = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    sum += texture(uTex, vUv + o).rgb * w[i];
    sum += texture(uTex, vUv - o).rgb * w[i];
  }
  outColor = vec4(sum, 1.0);
}`;

// Passe 3 — composition finale : scène + bloom, aberration, vignette, scanlines.
const FRAG_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uStrength;
uniform float uAberration;
uniform float uVignette;
uniform float uScanline;
uniform float uSaturation;
out vec4 outColor;
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);

  // Aberration chromatique : nulle au centre, croissante vers les bords —
  // l'objet regardé reste net, seule la périphérie « vibre ».
  vec2 off = d * uAberration * r2;
  vec3 scene = vec3(
    texture(uScene, vUv + off).r,
    texture(uScene, vUv).g,
    texture(uScene, vUv - off).b
  );

  vec3 col = scene + texture(uBloom, vUv).rgb * uStrength;

  // Saturation (le monde « reprend des couleurs » — thème du jeu).
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);

  col *= 1.0 - uVignette * r2 * 1.7;
  col *= 1.0 - uScanline * step(1.5, mod(gl_FragCoord.y, 3.0));
  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('postfx: shader', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function program(gl, fragSrc) {
  const v = compile(gl, gl.VERTEX_SHADER, VERT);
  const f = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('postfx: link', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

export const PostFX = {
  available: false,
  gl: null,
  canvas: null,
  _src: null, // canvas 2D source
  _w: 0,
  _h: 0,

  // Branche la chaîne au-dessus du canvas 2D. Sans effet (et sans erreur) si
  // WebGL2 n'est pas disponible : l'appelant retombe sur la chaîne Canvas 2D.
  init(sourceCanvas) {
    if (this.gl) return this.available;
    this._src = sourceCanvas;

    const c = document.createElement('canvas');
    c.id = 'fx';
    // Par-dessus le canvas 2D, mais TRANSPARENT aux événements : la souris et
    // le tactile continuent d'atteindre le canvas de jeu, en dessous.
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block';
    const gl = c.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) return false;

    this.canvas = c;
    this.gl = gl;
    this.pBright = program(gl, FRAG_BRIGHT);
    this.pBlur = program(gl, FRAG_BLUR);
    this.pComposite = program(gl, FRAG_COMPOSITE);
    if (!this.pBright || !this.pBlur || !this.pComposite) return false;

    this.vao = gl.createVertexArray(); // aucun attribut : tout vient de gl_VertexID
    this.sceneTex = this._makeTex(gl);
    this.fboA = { fb: gl.createFramebuffer(), tex: this._makeTex(gl) };
    this.fboB = { fb: gl.createFramebuffer(), tex: this._makeTex(gl) };
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // le canvas 2D a l'origine en haut

    sourceCanvas.parentNode.appendChild(c);
    this.available = true;
    return true;
  },

  _makeTex(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  },

  _resize() {
    const gl = this.gl;
    const w = this._src.width;
    const h = this._src.height;
    if (w === this._w && h === this._h) return;
    this._w = w;
    this._h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    // Les tampons de bloom vivent en quart de résolution : le flou y est plus
    // large pour un coût divisé par 16, et personne ne voit la différence.
    this.bw = Math.max(1, w >> 2);
    this.bh = Math.max(1, h >> 2);
    for (const f of [this.fboA, this.fboB]) {
      gl.bindTexture(gl.TEXTURE_2D, f.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bw, this.bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },

  _draw() {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  },

  // Traite la frame courante du canvas 2D et l'affiche. À appeler une fois par
  // frame, tout à la fin du rendu.
  present() {
    if (!this.available || !CONFIG.postfx.enabled) return false;
    const gl = this.gl;
    const p = CONFIG.postfx;
    this._resize();
    gl.bindVertexArray(this.vao);

    // Envoi de la frame 2D en texture.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._src);

    // 1. Extraction des zones lumineuses -> A (quart de résolution).
    gl.viewport(0, 0, this.bw, this.bh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fb);
    gl.useProgram(this.pBright);
    gl.uniform1i(gl.getUniformLocation(this.pBright, 'uScene'), 0);
    gl.uniform1f(gl.getUniformLocation(this.pBright, 'uThreshold'), p.threshold);
    gl.uniform1f(gl.getUniformLocation(this.pBright, 'uSoft'), p.soft);
    this._draw();

    // 2. Flou séparable : A -> B (horizontal), puis B -> A (vertical).
    gl.useProgram(this.pBlur);
    gl.uniform1i(gl.getUniformLocation(this.pBlur, 'uTex'), 0);
    const uDir = gl.getUniformLocation(this.pBlur, 'uDir');

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB.fb);
    gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
    gl.uniform2f(uDir, p.radius / this.bw, 0);
    this._draw();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA.fb);
    gl.bindTexture(gl.TEXTURE_2D, this.fboB.tex);
    gl.uniform2f(uDir, 0, p.radius / this.bh);
    this._draw();

    // 3. Composition à l'écran.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._w, this._h);
    gl.useProgram(this.pComposite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fboA.tex);
    gl.uniform1i(gl.getUniformLocation(this.pComposite, 'uScene'), 0);
    gl.uniform1i(gl.getUniformLocation(this.pComposite, 'uBloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.pComposite, 'uStrength'), p.strength);
    gl.uniform1f(gl.getUniformLocation(this.pComposite, 'uAberration'), p.aberration);
    gl.uniform1f(gl.getUniformLocation(this.pComposite, 'uVignette'), p.vignette);
    gl.uniform1f(gl.getUniformLocation(this.pComposite, 'uScanline'), CONFIG.perf ? 0 : p.scanline);
    gl.uniform1f(gl.getUniformLocation(this.pComposite, 'uSaturation'), p.saturation);
    this._draw();
    gl.activeTexture(gl.TEXTURE0);
    return true;
  },

  // Bascule l'affichage entre la chaîne GPU et le canvas 2D nu (écriture de
  // style seulement sur transition : cette fonction est appelée chaque frame).
  _visible: true,
  setVisible(on) {
    if (!this.canvas || on === this._visible) return;
    this._visible = on;
    this.canvas.style.display = on ? 'block' : 'none';
  },
};
