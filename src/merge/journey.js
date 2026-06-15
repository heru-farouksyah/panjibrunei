// Journey map (component #4 meta-progression) — a campaign world map like a
// classic level-select: a light-blue gradient world, dashed roads linking nodes,
// star ratings on cleared stops, and locked/fogged nodes you can see but not yet
// reach. Clearing a node's orders earns stars and unlocks the next stop.
import { JOURNEY, ORDERS_PER_NODE, NODE_STORY } from './data.js';

export class Journey {
  constructor(game) { this.game = game; this.s = game.state; }

  cleared(id) { return (this.s.stars[id] || 0) >= ORDERS_PER_NODE; }
  unlocked(node) { return node.prev === null || this.cleared(node.prev); }

  byId(id) { return JOURNEY.find((n) => n.id === id); }

  mount(container) {
    this.el = document.createElement('div');
    this.el.className = 'journey';
    container.appendChild(this.el);
    this.render();
  }

  render() {
    const cur = this.s.node;
    const roads = JOURNEY.filter((n) => n.prev).map((n) => {
      const a = this.byId(n.prev), b = n;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 26; // bowed road
      const done = this.cleared(n.prev);
      return `<path d="M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" class="road ${done ? 'road-done' : ''}"/>`;
    }).join('');

    const nodes = JOURNEY.map((n) => {
      const unlocked = this.unlocked(n);
      const stars = this.s.stars[n.id] || 0;
      const isCur = n.id === cur;
      const cls = `node ${unlocked ? 'open' : 'locked'} ${isCur ? 'cur' : ''}`;
      const starRow = unlocked
        ? `<g transform="translate(${n.x},${n.y - 34})">${[0, 1, 2].map((i) =>
            `<text x="${(i - 1) * 14}" y="0" class="star ${i < stars ? 'on' : ''}">★</text>`).join('')}</g>`
        : '';
      const marker = unlocked
        ? `<path d="M${n.x - 15} ${n.y - 16} h30 v20 l-15 14 l-15 -14 z" class="shield"/>` +
          `<text x="${n.x}" y="${n.y + 1}" class="node-ic">⌂</text>`
        : `<circle cx="${n.x}" cy="${n.y}" r="15" class="shield"/>` +
          `<text x="${n.x}" y="${n.y + 5}" class="node-ic lock">🔒</text>`;
      return `<g class="${cls}" data-id="${n.id}">${starRow}${marker}` +
        `<text x="${n.x}" y="${n.y + 30}" class="node-name">${n.name}</text></g>`;
    }).join('');

    this.el.innerHTML = `
      <svg viewBox="0 0 760 360" preserveAspectRatio="xMidYMid meet" class="journey-svg">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#dff1fb"/>
            <stop offset="42%" stop-color="#a9d4ec"/>
            <stop offset="100%" stop-color="#6fa9cf"/>
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="760" height="360" fill="url(#sky)"/>
        <rect width="760" height="360" fill="url(#glow)"/>
        ${this.decor()}
        ${roads}
        ${nodes}
      </svg>
      <div class="journey-title">The River Journey</div>`;

    for (const g of this.el.querySelectorAll('.node.open')) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => this.game.enterNode(g.dataset.id));
    }
  }

  // light decorative "map" flourishes: rivers, hills, wave hatching
  decor() {
    return `
      <path d="M-10 300 C 150 280 220 330 380 312 C 540 296 620 340 770 318" class="map-river"/>
      <path d="M40 90 q14 -16 28 0 q14 -16 28 0" class="map-hill"/>
      <path d="M600 70 q14 -16 28 0 q14 -16 28 0" class="map-hill"/>
      <path d="M120 60 q10 -12 20 0" class="map-hill"/>
      <g class="map-waves">
        <path d="M650 300 q8 -7 16 0 M650 312 q8 -7 16 0"/>
        <path d="M60 200 q8 -7 16 0"/>
      </g>`;
  }
}
