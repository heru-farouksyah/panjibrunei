// Hero ROSTER (§8) — ties each pick's model + kit + base stats + meta together.
// The match (index.js) reads the chosen entry: build() makes the ship, skills()
// makes a fresh kit, and { hp,dmg,rng,atkCd,speed } seed the combat unit.
// Phase 9a ships 3 of 6 (Bahtera + Meriam + Hammerhead); the rest are stubbed.

import { buildBahtera, buildMeriam, buildHammerhead, buildNakhoda, buildTempest, buildSentinel } from './units.js';
import { bahteraSkills, meriamSkills, hammerheadSkills, nakhodaSkills, tempestSkills, sentinelSkills } from './skills.js';

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
  {
    id: 'nakhoda', name: 'Nakhoda', era: 'Traditional', role: 'Support · Healer', icon: '🪔', accent: '#ffd27a',
    blurb: 'A royal barge that mends and shields the fleet — keep your warships afloat and unleash a rallying tide.',
    hp: 660, dmg: 20, rng: 8, atkCd: 1.0, speed: 15,
    build: buildNakhoda, skills: nakhodaSkills,
  },
  {
    id: 'tempest', name: 'Tempest', era: 'Modern', role: 'Mage · Burst', icon: '⚡', accent: '#7fb8ff',
    blurb: 'A storm hydrofoil that chains lightning between foes, conjures whirlpools, and calls down a tempest.',
    hp: 620, dmg: 23, rng: 10, atkCd: 1.05, speed: 15,
    build: buildTempest, skills: tempestSkills,
  },
  {
    id: 'sentinel', name: 'Sentinel', era: 'Modern', role: 'Tank · Guardian', icon: '🛡️', accent: '#9fb4c4',
    blurb: 'An armored ironclad that shields the line, drags enemies onto its guns, and holds a zone no one crosses.',
    hp: 880, dmg: 21, rng: 6.5, atkCd: 0.95, speed: 13,
    build: buildSentinel, skills: sentinelSkills,
  },
];

export const heroById = (id) => ROSTER.find((h) => h.id === id) || ROSTER[0];
