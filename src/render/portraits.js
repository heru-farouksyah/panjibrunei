// Procedural hero portraits for the faction-select cards — a stylized bust per
// Panji, tinted by the faction colour, drawn as SVG (matches the icon style in
// icons.js). Drop-in for real art: set `portrait` on a faction in factions.json
// to an image path and the card uses that instead (see screens.js).

const SKIN = '#c89a6a';
const SKIN_SHADE = '#a87c4f';

// Per-faction headgear + accent. `head` is drawn over the head in the faction
// colour; `accent` is an optional behind-the-shoulder motif (weapon/shield).
const HEROES = {
  semaun: { // Awang Semaun — the giant strongman: top-knot, massive shoulders
    shoulders: 'M14,100 C16,74 34,66 50,66 C66,66 84,74 86,100 Z',
    head: 'M38,30 a12,12 0 0,1 24,0 Z',         // hair cap
    knot: true,
    accent: 'club',
  },
  sakam: { // the swift: simple headband, spear
    shoulders: 'M20,100 C22,78 36,70 50,70 C64,70 78,78 80,100 Z',
    head: 'M37,34 h26 v5 h-26 Z',                // headband
    accent: 'spear',
  },
  hassan: { // the defender: rounded helm + shield
    shoulders: 'M16,100 C18,76 35,68 50,68 C65,68 82,76 84,100 Z',
    head: 'M36,32 a14,12 0 0,1 28,0 Z',          // helmet dome
    crest: true,
    accent: 'shield',
  },
  shahbandar: { // the merchant harbourmaster: tengkolok + beard
    shoulders: 'M18,100 C20,77 35,69 50,69 C65,69 80,77 82,100 Z',
    head: 'M35,33 q15,-16 30,0 q-4,-6 -15,-6 q-11,0 -15,6 Z', // folded headcloth
    beard: true,
    accent: 'coin',
  },
  saman: { // Haji Saman, the resistance: peaked tanjak headcloth, kris
    shoulders: 'M18,100 C20,77 35,69 50,69 C65,69 80,77 82,100 Z',
    head: 'M34,34 L50,18 L66,34 q-16,-7 -32,0 Z', // peaked tanjak
    accent: 'kris',
  },
  badar: { // the shadow tactician: hood, face in shadow
    shoulders: 'M14,100 C16,72 34,64 50,64 C66,64 84,72 86,100 Z',
    head: 'M32,40 q18,-26 36,0 q-18,-10 -36,0 Z', // deep hood
    hood: true,
    accent: 'dagger',
  },
};

function accentSVG(kind, color) {
  switch (kind) {
    case 'spear': return `<rect x="78" y="22" width="3" height="60" rx="1.5" fill="#6b5638"/><path d="M79.5,16 l5,10 h-10 Z" fill="#cdd3da"/>`;
    case 'club': return `<rect x="76" y="34" width="6" height="48" rx="3" fill="#6b5638"/><circle cx="79" cy="32" r="9" fill="#6b5638"/>`;
    case 'kris': return `<path d="M80,82 q-2,-22 2,-44 q3,8 -1,14 q4,8 -1,16 q3,8 0,14 Z" fill="#cdd3da" stroke="${color}" stroke-width="1"/>`;
    case 'dagger': return `<path d="M80,80 L82,40 L84,80 Z" fill="#cdd3da"/><rect x="79" y="80" width="6" height="6" fill="${color}"/>`;
    case 'shield': return `<path d="M74,30 q8,-3 16,0 v14 q0,12 -8,16 q-8,-4 -8,-16 Z" fill="${color}" stroke="#cdd3da" stroke-width="1.2"/>`;
    case 'coin': return `<circle cx="80" cy="40" r="8" fill="#e6bb3e"/><circle cx="80" cy="40" r="4.5" fill="none" stroke="#9a7a1e" stroke-width="1.2"/>`;
    default: return '';
  }
}

// Returns an SVG string (viewBox 0 0 100 100) for the faction's hero bust.
export function heroPortraitSVG(factionId, color = '#888888') {
  const h = HEROES[factionId] || HEROES.semaun;
  const id = `pg_${factionId}`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" class="hero-portrait-svg">
    <defs>
      <radialGradient id="${id}" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="${color}"/>
        <stop offset="62%" stop-color="${color}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#14160f"/>
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="url(#${id})"/>
    ${h.accent ? accentSVG(h.accent, color) : ''}
    <path d="${h.shoulders}" fill="${color}" stroke="#14160f" stroke-width="1.5"/>
    <path d="M44,58 h12 v10 h-12 Z" fill="${SKIN_SHADE}"/>            <!-- neck -->
    <ellipse cx="50" cy="44" rx="13" ry="15" fill="${SKIN}"/>           <!-- head -->
    ${h.beard ? `<path d="M40,48 q10,16 20,0 q-10,8 -20,0 Z" fill="#3a2c1c"/>` : ''}
    <ellipse cx="45" cy="44" rx="1.6" ry="2" fill="#2a2018"/>           <!-- eyes -->
    <ellipse cx="55" cy="44" rx="1.6" ry="2" fill="#2a2018"/>
    ${h.hood ? `<path d="${h.head}" fill="#14160f" opacity="0.92"/>` : `<path d="${h.head}" fill="${color}" stroke="#14160f" stroke-width="1"/>`}
    ${h.knot ? `<circle cx="50" cy="22" r="5" fill="#2a2018"/>` : ''}
    ${h.crest ? `<rect x="48.5" y="14" width="3" height="10" fill="#e6bb3e"/>` : ''}
  </svg>`;
}
