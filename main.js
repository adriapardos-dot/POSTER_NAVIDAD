'use strict';

/* ==========================================================
   Ningún niño sin juguete · Fundación ITACA · 21 de diciembre
   Interacciones: mouseenter / mouseleave / mousemove / click
   ========================================================== */

const POSTER_W = 848;
const POSTER_H = 1200;
const LETTER_RADIUS = 190;        // radio de influencia del cursor sobre las letras
const LETTER_COLORS = ['#f2b134', '#e63b2e', '#2bb3a3', '#f28ab2', '#7cc4f0'];
const DEFAULT_OFFER = { price: '10 €', gift: 'un juguete' };
const FIRE_COLORS = ['#fff3c4', '#f2b134', '#f2b134', '#e8742a', '#e63b2e'];
const BLOCK_LETTERS = ['J', 'U', 'G', 'A', 'R'];
const BLOCK_COLORS = ['#f28ab2', '#2bb3a3', '#f2b134', '#7cc4f0', '#e63b2e'];
const MAX_PARTICLES = 260;
const BOX = { x: 480, w: 312, bottom: 1140 }; // interior de la caja solidaria
const STEP = 1000 / 60;           // paso fijo del motor de física
const CAPTURE_MODE = new URLSearchParams(location.search).has('captura');

const poster = document.getElementById('poster');
const glow = document.getElementById('glow');
const title = document.getElementById('title');
const tag = document.getElementById('tag');
const offerEl = document.getElementById('offer');
const priceEl = document.getElementById('price');
const giftEl = document.getElementById('gift');
const countEl = document.getElementById('count');
const boxLabel = document.getElementById('boxLabel');
const fxLayer = document.getElementById('fx');
const snowCanvas = document.getElementById('snow');
const snowCtx = snowCanvas.getContext('2d');

const mouse = { x: POSTER_W / 2, y: POSTER_H / 2, vx: 0, vy: 0, inside: false };
const letters = [];
const toys = [];
const flakes = [];
const particles = [];
let scale = 1;
let donated = 0;
let wind = 0;
let physics = null;

/* ----------------------------------------------------------
   Utilidades
   ---------------------------------------------------------- */

/** Escala el cartel para que quepa en la ventana sin deformarse. */
function fitPoster() {
  scale = CAPTURE_MODE
    ? 1
    : Math.min(window.innerWidth / (POSTER_W + 48), window.innerHeight / (POSTER_H + 48));
  document.documentElement.style.setProperty('--s', scale);
}

/** Convierte las coordenadas del ratón a coordenadas internas del cartel (848 × 1200). */
function toPosterCoords(event) {
  const rect = poster.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale,
  };
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Reinicia una animación CSS de "rebote" en un elemento. */
function bump(el) {
  el.classList.remove('is-bump');
  void el.offsetWidth;
  el.classList.add('is-bump');
}

/* ----------------------------------------------------------
   Titular: letras que reaccionan al cursor (mousemove)
   ---------------------------------------------------------- */

function splitTitle() {
  title.querySelectorAll('.title-line').forEach((line) => {
    const text = line.textContent.trim();
    line.textContent = '';
    [...text].forEach((char) => {
      const span = document.createElement('span');
      if (char === ' ') {
        span.className = 'space';
        line.appendChild(span);
        return;
      }
      span.className = 'letter';
      span.textContent = char;
      line.appendChild(span);
      letters.push({
        el: span,
        cx: 0,
        cy: 0,
        color: LETTER_COLORS[letters.length % LETTER_COLORS.length],
      });
    });
  });
}

/** Guarda el centro de cada letra (offsets sin transformar, en px del cartel). */
function measureLetters() {
  letters.forEach((letter) => {
    letter.cx = title.offsetLeft + letter.el.offsetLeft + letter.el.offsetWidth / 2;
    letter.cy = title.offsetTop + letter.el.offsetTop + letter.el.offsetHeight / 2;
  });
}

/** Las letras cercanas al cursor saltan, giran y cambian de color. */
function updateLetters() {
  letters.forEach((letter) => {
    const dx = mouse.x - letter.cx;
    const dy = mouse.y - letter.cy;
    const dist = Math.hypot(dx, dy) || 1;
    const force = mouse.inside ? Math.max(0, 1 - dist / LETTER_RADIUS) : 0;

    if (force === 0) {
      letter.el.style.transform = '';
      letter.el.style.color = '';
      return;
    }

    const eased = force * force * (3 - 2 * force);
    const pushX = (-dx / dist) * eased * 14;
    const lift = -eased * 34;
    const tilt = (dx > 0 ? -1 : 1) * eased * 12;
    letter.el.style.transform = `translate(${pushX}px, ${lift}px) rotate(${tilt}deg) scale(${1 + eased * 0.14})`;
    letter.el.style.color = eased > 0.35 ? letter.color : '';
  });
}

/* ----------------------------------------------------------
   Juguetes flotantes: mouseenter / mouseleave / click
   ---------------------------------------------------------- */

function initToys() {
  poster.querySelectorAll('.toy').forEach((el, i) => {
    const toy = {
      el,
      svg: el.querySelector('svg'),
      type: el.dataset.type,
      gift: el.dataset.gift,
      price: el.dataset.price,
      depth: parseFloat(el.dataset.depth) || 1,
      baseRot: parseFloat(el.dataset.rot) || 0,
      phase: i * 1.7,
      hover: 0,
      hoverTarget: 0,
      presence: 1,
      gone: false,
      px: 0,
      py: 0,
      t: { x: 0, y: 0, rot: 0, s: 1 },  // transformación actual del juguete
      extra: { x: 0, y: 0, rot: 0 },    // desplazamiento propio de su animación
    };

    el.addEventListener('mouseenter', () => handleToyEnter(toy));
    el.addEventListener('mouseleave', () => handleToyLeave(toy));
    el.addEventListener('click', () => donateToy(toy));
    toys.push(toy);
  });
}

/** mouseenter: el juguete crece, se ilumina, muestra su precio y actualiza el mensaje. */
function handleToyEnter(toy) {
  if (toy.gone) return;
  toy.hoverTarget = 1;
  toy.el.classList.add('is-active');
  toy.el.style.filter = 'drop-shadow(0 0 20px rgba(242, 177, 52, .9))';
  toy.el.style.zIndex = '6';
  showTag(toy);
  setOffer(toy.price, toy.gift);

  const effect = TOY_EFFECTS[toy.type];
  if (effect && effect.enter) effect.enter(toy);
}

/** mouseleave: el juguete vuelve a su estado inicial y el mensaje se restablece. */
function handleToyLeave(toy) {
  toy.hoverTarget = 0;
  toy.el.classList.remove('is-active');
  toy.el.style.filter = '';
  toy.el.style.zIndex = '';
  hideTag();
  setOffer(DEFAULT_OFFER.price, DEFAULT_OFFER.gift);

  const effect = TOY_EFFECTS[toy.type];
  if (effect && effect.leave) effect.leave(toy);
}

function showTag(toy) {
  const { el } = toy;
  tag.innerHTML = `${capitalize(toy.gift)} · ${toy.price}<small>clic para donarlo</small>`;
  const top = el.offsetTop - el.offsetHeight * 0.12;
  const below = top < 180; // si el juguete está muy arriba, la etiqueta va debajo
  tag.style.left = `${el.offsetLeft + el.offsetWidth / 2}px`;
  tag.style.top = below ? `${el.offsetTop + el.offsetHeight * 1.14}px` : `${top}px`;
  tag.classList.toggle('is-below', below);
  tag.classList.add('is-visible');
}

function hideTag() {
  tag.classList.remove('is-visible');
}

function setOffer(price, gift) {
  if (priceEl.textContent === price && giftEl.textContent === gift) return;
  priceEl.textContent = price;
  giftEl.textContent = gift;
  bump(offerEl);
}

/** click: el juguete desaparece del cartel y cae dentro de la caja solidaria. */
function donateToy(toy) {
  if (toy.gone) return;
  handleToyLeave(toy);
  toy.gone = true;
  toy.el.style.pointerEvents = 'none';
  dropIntoBox(toy.type);

  setTimeout(() => {
    toy.gone = false;
    toy.el.style.pointerEvents = '';
  }, 1800);
}

function dropIntoBox(type) {
  donated += 1;
  countEl.textContent = donated;
  bump(boxLabel);

  if (physics) {
    const x = BOX.x + 34 + Math.random() * (BOX.w - 68);
    physics.spawn(type, x, 760 - Math.random() * 40);
  }
}

/** Anima cada juguete: flotación, parallax con el ratón y estado hover. */
function updateToy(toy, now) {
  toy.hover += (toy.hoverTarget - toy.hover) * 0.14;
  toy.presence += ((toy.gone ? 0 : 1) - toy.presence) * 0.12;

  // Parallax: los juguetes se desplazan en sentido contrario al cursor según su profundidad
  const targetX = mouse.inside ? -((mouse.x - POSTER_W / 2) / (POSTER_W / 2)) * toy.depth * 24 : 0;
  const targetY = mouse.inside ? -((mouse.y - POSTER_H / 2) / (POSTER_H / 2)) * toy.depth * 24 : 0;
  toy.px += (targetX - toy.px) * 0.08;
  toy.py += (targetY - toy.py) * 0.08;

  const effect = TOY_EFFECTS[toy.type] || {};
  const wiggleAmount = effect.wiggle !== undefined ? effect.wiggle : 7;

  const bob = Math.sin(now / 900 + toy.phase) * 7 * (1 - toy.hover);
  const wiggle = Math.sin(now / 80) * wiggleAmount * toy.hover;
  const rot = toy.baseRot * (1 - toy.hover) + wiggle + Math.sin(now / 1400 + toy.phase) * 3;
  const size = (1 + toy.hover * 0.28) * (0.3 + 0.7 * toy.presence);
  const fall = (1 - toy.presence) * 90;

  toy.t = { x: toy.px, y: toy.py + bob + fall, rot, s: size };
  toy.el.style.transform =
    `translate(${toy.t.x.toFixed(2)}px, ${toy.t.y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${size.toFixed(3)})`;
  toy.el.style.opacity = toy.presence.toFixed(3);

  // Movimiento propio de cada juguete: se aplica al dibujo (svg) y no a la caja
  // que detecta el ratón, así el juguete puede moverse sin perder el hover.
  toy.extra = effect.offset ? effect.offset(toy, now) : { x: 0, y: 0, rot: 0 };
  toy.svg.style.transform = effect.offset
    ? `translate(${toy.extra.x.toFixed(2)}px, ${toy.extra.y.toFixed(2)}px) rotate(${(toy.extra.rot || 0).toFixed(2)}deg)`
    : '';

  if (toy.hoverTarget === 1 && !toy.gone && effect.frame) effect.frame(toy, now);
}

/**
 * Devuelve la posición en el cartel de un punto del juguete.
 * fx, fy: fracciones (0–1) del ancho y alto del juguete.
 */
function toyPoint(toy, fx, fy) {
  const { el, t, extra } = toy;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const lx = (fx - 0.5) * w + extra.x;
  const ly = (fy - 0.5) * h + extra.y;
  const angle = (t.rot * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: el.offsetLeft + w / 2 + t.x + (lx * cos - ly * sin) * t.s,
    y: el.offsetTop + h / 2 + t.y + (lx * sin + ly * cos) * t.s,
    angle,
  };
}

/* ----------------------------------------------------------
   Animación propia de cada juguete
   - enter / leave: al entrar y salir con el ratón
   - frame: cada fotograma mientras está activo (partículas)
   - offset: desplazamiento extra del dibujo
   - wiggle: cuánto se balancea al pasar el ratón
   ---------------------------------------------------------- */

const TOY_EFFECTS = {
  /* Cohete: tira fuego y humo, tiembla y despega un poco */
  rocket: {
    wiggle: 0,
    offset(toy) {
      const h = toy.hover;
      return { x: rand(-1.5, 1.5) * h, y: -18 * h, rot: 0 };
    },
    frame(toy) {
      const p = toyPoint(toy, 0.5, 0.86);
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      for (let i = 0; i < 3; i += 1) {
        const lx = rand(-1.3, 1.3);
        const ly = rand(3, 6.5);
        spawnParticle({
          x: p.x, y: p.y,
          vx: lx * cos - ly * sin,
          vy: lx * sin + ly * cos,
          size: rand(7, 15),
          color: pick(FIRE_COLORS),
          className: 'particle--fire',
          life: rand(14, 26),
        });
      }
      if (Math.random() < 0.3) {
        spawnParticle({
          x: p.x, y: p.y + 14,
          vx: rand(-0.7, 0.7), vy: rand(0.8, 1.8),
          size: rand(10, 16),
          color: 'rgba(246, 238, 221, .3)',
          life: 45,
          grow: 2.2,
        });
      }
    },
  },

  /* Osito: guiña un ojo, mueve las orejas y suelta corazones */
  bear: {
    wiggle: 5,
    frame(toy) {
      if (Math.random() > 0.08) return;
      const p = toyPoint(toy, rand(0.2, 0.8), 0.08);
      spawnParticle({
        x: p.x, y: p.y,
        vx: rand(-0.6, 0.6), vy: rand(-1.8, -1),
        text: '♥',
        fontSize: rand(18, 30),
        textColor: pick(['#f28ab2', '#e63b2e', '#f6eedd']),
        life: 70,
        sway: true,
      });
    },
  },

  /* Patito: abre el pico, dice "¡Cuac!" y suelta burbujas */
  duck: {
    wiggle: 0,
    enter(toy) {
      toy.quackTimer = 0;
    },
    frame(toy) {
      toy.quackTimer -= 1;
      if (toy.quackTimer <= 0) {
        toy.quackTimer = 75;
        // El bocadillo sale hacia el lado donde hay más espacio en el cartel
        const toLeft = toy.el.offsetLeft > POSTER_W / 2;
        const p = toyPoint(toy, toLeft ? 0 : 1, 0.45);
        spawnParticle({
          x: p.x + (toLeft ? -40 : 40), y: p.y,
          vx: toLeft ? -0.6 : 0.6, vy: -0.25,
          text: '¡Cuac!',
          className: 'particle--quack',
          life: 60,
        });
      }
      if (Math.random() < 0.15) {
        const p = toyPoint(toy, rand(0.2, 0.8), 0.92);
        spawnParticle({
          x: p.x, y: p.y,
          vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.8),
          size: rand(5, 11),
          className: 'particle--bubble',
          life: 50,
          keepSize: true,
          sway: true,
        });
      }
    },
  },

  /* Coche: arranca, giran las ruedas, enciende las luces y echa humo */
  car: {
    wiggle: 1.5,
    offset(toy, now) {
      const h = toy.hover;
      return { x: 22 * h, y: Math.sin(now / 60) * 1.2 * h, rot: 0 };
    },
    frame(toy) {
      if (Math.random() > 0.3) return;
      const p = toyPoint(toy, 0.06, 0.62);
      spawnParticle({
        x: p.x, y: p.y,
        vx: rand(-2.6, -1.4), vy: rand(-0.6, -0.1),
        size: rand(8, 14),
        color: 'rgba(246, 238, 221, .45)',
        life: 40,
        grow: 2,
      });
    },
  },

  /* Pelota: bota, gira y suelta chispas al tocar el suelo */
  ball: {
    wiggle: 0,
    offset(toy, now) {
      toy.bounce = Math.abs(Math.sin(now / 170));
      return { x: 0, y: -toy.bounce * 26 * toy.hover, rot: 0 };
    },
    frame(toy) {
      if (toy.bounce > 0.5) toy.canSpark = true;
      if (toy.bounce > 0.12 || !toy.canSpark) return;
      toy.canSpark = false;
      const p = toyPoint(toy, 0.5, 0.97);
      for (let i = 0; i < 7; i += 1) {
        spawnParticle({
          x: p.x, y: p.y,
          vx: rand(-3, 3), vy: rand(-2.5, -0.5),
          gravity: 0.12,
          text: '✦',
          fontSize: rand(10, 16),
          textColor: pick(LETTER_COLORS),
          life: 30,
        });
      }
    },
  },

  /* Bloque: va deletreando J-U-G-A-R y lanza confeti */
  block: {
    enter(toy) {
      toy.letterIndex = -1;
      nextBlockLetter(toy);
      toy.blockTimer = setInterval(() => nextBlockLetter(toy), 320);
    },
    leave(toy) {
      clearInterval(toy.blockTimer);
      resetBlock(toy);
    },
  },
};

function nextBlockLetter(toy) {
  const letter = toy.el.querySelector('.block-letter');
  const frame = toy.el.querySelector('.block-frame');
  toy.letterIndex = (toy.letterIndex + 1) % BLOCK_LETTERS.length;

  letter.textContent = BLOCK_LETTERS[toy.letterIndex];
  frame.setAttribute('fill', BLOCK_COLORS[toy.letterIndex]);
  letter.classList.remove('is-pop');
  void letter.getBBox();
  letter.classList.add('is-pop');

  const p = toyPoint(toy, 0.5, 0.15);
  for (let i = 0; i < 6; i += 1) {
    spawnParticle({
      x: p.x, y: p.y,
      vx: rand(-3, 3), vy: rand(-4.5, -1.5),
      gravity: 0.22,
      size: rand(5, 9),
      color: pick(BLOCK_COLORS),
      className: 'particle--confetti',
      spin: rand(-12, 12),
      life: 45,
      keepSize: true,
    });
  }
}

function resetBlock(toy) {
  toy.el.querySelector('.block-letter').textContent = 'A';
  toy.el.querySelector('.block-frame').setAttribute('fill', '#f28ab2');
}

/* ----------------------------------------------------------
   Sistema de partículas
   ---------------------------------------------------------- */

function spawnParticle(options) {
  if (particles.length >= MAX_PARTICLES) return;

  const el = document.createElement('span');
  el.className = `particle ${options.className || ''}`;

  if (options.text) {
    el.textContent = options.text;
    if (!options.className) el.classList.add('particle--text');
    if (options.fontSize) el.style.fontSize = `${options.fontSize}px`;
    if (options.textColor) el.style.color = options.textColor;
  } else {
    el.style.width = `${options.size}px`;
    el.style.height = `${options.size}px`;
    if (options.color) el.style.background = options.color;
  }

  fxLayer.appendChild(el);
  particles.push({
    el,
    x: options.x,
    y: options.y,
    vx: options.vx || 0,
    vy: options.vy || 0,
    gravity: options.gravity || 0,
    life: options.life,
    maxLife: options.life,
    grow: options.grow || 0,
    keepSize: Boolean(options.keepSize || options.text),
    sway: options.sway ? rand(0, 6) : null,
    spin: options.spin || 0,
    rot: 0,
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= 1;

    if (p.life <= 0) {
      p.el.remove();
      particles.splice(i, 1);
      continue;
    }

    p.vy += p.gravity;
    p.x += p.vx + (p.sway !== null ? Math.sin(p.life / 8 + p.sway) * 0.6 : 0);
    p.y += p.vy;
    p.rot += p.spin;

    const k = p.life / p.maxLife;   // 1 → 0 a lo largo de su vida
    const age = p.maxLife - p.life;
    let size;
    if (p.grow) size = 1 + (1 - k) * p.grow;
    else if (p.keepSize) size = Math.min(1, age / 5);
    else size = k;

    p.el.style.transform =
      `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) rotate(${p.rot.toFixed(1)}deg) scale(${size.toFixed(3)})`;
    p.el.style.opacity = Math.min(1, k * 2.5).toFixed(3);
  }
}

/* ----------------------------------------------------------
   Caja solidaria con física (Matter.js)
   ---------------------------------------------------------- */

function createPhysics() {
  if (typeof Matter === 'undefined') {
    console.warn('Matter.js no se ha cargado: la caja cuenta donaciones sin física.');
    return null;
  }

  const { Engine, Bodies, Body, Composite } = Matter;
  const layer = document.getElementById('physics');
  const engine = Engine.create();
  engine.gravity.y = 1.1;

  const SIZE = 58;
  const MAX_TOYS = 22;
  const PUSH_RADIUS = 85;
  const T = 80; // grosor de las paredes invisibles
  const wall = { isStatic: true, friction: 0.6 };

  Composite.add(engine.world, [
    Bodies.rectangle(BOX.x - T / 2, 850, T, 700, wall),
    Bodies.rectangle(BOX.x + BOX.w + T / 2, 850, T, 700, wall),
    Bodies.rectangle(BOX.x + BOX.w / 2, BOX.bottom + T / 2, BOX.w + T * 2, T, wall),
  ]);

  const items = [];

  function spawn(type, x, y) {
    const body = Bodies.rectangle(x, y, SIZE, SIZE, {
      chamfer: { radius: 16 },
      restitution: 0.35,
      friction: 0.5,
      frictionAir: 0.015,
      angle: (Math.random() - 0.5) * 1.2,
    });
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.25);
    Composite.add(engine.world, body);

    const el = document.createElement('div');
    el.className = 'phys-toy';
    el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#t-${type}"></use></svg>`;
    layer.appendChild(el);
    items.push({ body, el });

    if (items.length > MAX_TOYS) {
      const oldest = items.shift();
      Composite.remove(engine.world, oldest.body);
      oldest.el.classList.add('is-leaving');
      setTimeout(() => oldest.el.remove(), 400);
    }
  }

  /** mousemove: el cursor empuja los juguetes de la caja. */
  function pushFromCursor() {
    if (!mouse.inside) return;
    items.forEach(({ body }) => {
      const dx = body.position.x - mouse.x;
      const dy = body.position.y - mouse.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > PUSH_RADIUS) return;
      const f = (1 - dist / PUSH_RADIUS) * body.mass;
      Body.applyForce(body, body.position, {
        x: f * ((dx / dist) * 0.004 + mouse.vx * 0.0003),
        y: f * ((dy / dist) * 0.004 + mouse.vy * 0.0003),
      });
    });
  }

  function update() {
    pushFromCursor();
    Engine.update(engine, STEP);
  }

  function render() {
    items.forEach(({ body, el }) => {
      el.style.transform =
        `translate(${(body.position.x - SIZE / 2).toFixed(2)}px, ${(body.position.y - SIZE / 2).toFixed(2)}px) rotate(${body.angle.toFixed(4)}rad)`;
    });
  }

  return { spawn, update, render };
}

/* ----------------------------------------------------------
   Nieve: el viento sigue al cursor
   ---------------------------------------------------------- */

function createFlakes(amount) {
  for (let i = 0; i < amount; i += 1) {
    flakes.push({
      x: Math.random() * POSTER_W,
      y: Math.random() * POSTER_H,
      r: 1 + Math.random() * 2.6,
      speed: 0.35 + Math.random() * 1.1,
      sway: Math.random() * Math.PI * 2,
    });
  }
}

function drawSnow(now) {
  const targetWind = mouse.inside ? ((mouse.x - POSTER_W / 2) / (POSTER_W / 2)) * 1.6 : 0;
  wind += (targetWind - wind) * 0.03;

  snowCtx.clearRect(0, 0, POSTER_W, POSTER_H);
  snowCtx.fillStyle = 'rgba(246, 238, 221, 0.7)';
  snowCtx.beginPath();

  flakes.forEach((flake) => {
    flake.y += flake.speed;
    flake.x += wind * flake.r * 0.5 + Math.sin(now / 1000 + flake.sway) * 0.3;

    if (flake.y > POSTER_H + 5) { flake.y = -5; flake.x = Math.random() * POSTER_W; }
    if (flake.x > POSTER_W + 5) flake.x = -5;
    if (flake.x < -5) flake.x = POSTER_W + 5;

    snowCtx.moveTo(flake.x + flake.r, flake.y);
    snowCtx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
  });

  snowCtx.fill();
}

/* ----------------------------------------------------------
   Eventos generales del cartel
   ---------------------------------------------------------- */

function handlePosterMove(event) {
  const point = toPosterCoords(event);
  mouse.vx = point.x - mouse.x;
  mouse.vy = point.y - mouse.y;
  mouse.x = point.x;
  mouse.y = point.y;
  mouse.inside = true;

  poster.style.setProperty('--mx', `${point.x}px`);
  poster.style.setProperty('--my', `${point.y}px`);
  updateLetters();
}

function handlePosterEnter(event) {
  const point = toPosterCoords(event);
  mouse.x = point.x;
  mouse.y = point.y;
  mouse.inside = true;
  glow.style.opacity = '1';
}

function handlePosterLeave() {
  mouse.inside = false;
  glow.style.opacity = '0';
  updateLetters();
}

/* ----------------------------------------------------------
   Bucle de animación
   ---------------------------------------------------------- */

let lastTime = performance.now();
let accumulator = 0;

function animate(now) {
  const delta = Math.min(now - lastTime, 100);
  lastTime = now;

  toys.forEach((toy) => updateToy(toy, now));
  updateParticles();

  if (physics) {
    accumulator += delta;
    while (accumulator >= STEP) {
      physics.update();
      accumulator -= STEP;
    }
    physics.render();
  }

  drawSnow(now);

  mouse.vx *= 0.8;
  mouse.vy *= 0.8;

  requestAnimationFrame(animate);
}

/* ----------------------------------------------------------
   Inicio
   ---------------------------------------------------------- */

function init() {
  fitPoster();
  splitTitle();
  measureLetters();
  initToys();
  createFlakes(110);
  physics = createPhysics();

  poster.addEventListener('mousemove', handlePosterMove);
  poster.addEventListener('mouseenter', handlePosterEnter);
  poster.addEventListener('mouseleave', handlePosterLeave);
  window.addEventListener('resize', fitPoster);
  document.fonts.ready.then(measureLetters);

  // Primeras donaciones para que la caja no empiece vacía
  const firstToys = ['bear', 'ball', 'duck', 'car', 'block', 'rocket', 'ball', 'bear', 'duck', 'car'];

  if (CAPTURE_MODE && physics) {
    // Modo captura (?captura): la caja aparece ya llena y estable para el pantallazo final
    firstToys.forEach((type, i) => {
      dropIntoBox(type);
      for (let s = 0; s < 40 + i * 4; s += 1) physics.update();
    });
    for (let s = 0; s < 400; s += 1) physics.update();
    physics.render();
  } else {
    firstToys.forEach((type, i) => {
      setTimeout(() => dropIntoBox(type), 400 + i * 220);
    });
  }

  requestAnimationFrame(animate);
}

init();
