// Hero ROSTER (§8) — ties each pick's model + kit + base stats + meta together.
// The match (index.js) reads the chosen entry: build() makes the ship, skills()
// makes a fresh kit, and { hp,dmg,rng,atkCd,speed } seed the combat unit.
// Phase 9a ships 3 of 6 (Bahtera + Meriam + Hammerhead); the rest are stubbed.

import { buildBahtera, buildMeriam, buildHammerhead } from './units.js';
import { bahteraSkills, meriamSkills, hammerheadSkills } from './skills.js';

export const ROSTER = [
  {
    id: 'bahtera', name: 'Bahtera', era: 'Traditional', role: 'Tank · Bruiser', icon: '⛵', accent: '#35b6ff',
    blurb: 'A heavy war-junk that rams the line, hooks stragglers, and unloads a broadside.',
    hp: 760, dmg: 24, rng: 7.5, atkCd: 0.85, speed: 16,
    build: buildBahtera, skills: bahteraSkills,
  },
  {
    id: 'meriam', name: 'Meriam', era: 'Traditional', role: 'Artillery · Mage', icon: '💣', accent: '#ffb24a',
    blurb: 'A gun-barge that rains shells from afar — area barrages, piercing chain shot, a devastating bombardment.',
    hp: 640, dmg: 30, rng: 11, atkCd: 1.2, speed: 13,
    build: buildMeriam, skills: meriamSkills,
  },
  {
    id: 'hammerhead', name: 'Hammerhead', era: 'Modern', role: 'Assassin', icon: '🦈', accent: '#7fe0c0',
    blurb: 'A fast steel gunboat that dashes in, saws through clusters, and leaps onto a target to finish it.',
    hp: 700, dmg: 22, rng: 6, atkCd: 0.7, speed: 19,
    build: buildHammerhead, skills: hammerheadSkills,
  },
];

export const heroById = (id) => ROSTER.find((h) => h.id === id) || ROSTER[0];
