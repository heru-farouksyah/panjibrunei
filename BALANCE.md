# PANJI BRUNEI — Balance Report (Phase 11)

Generated with the headless balance harness, `scripts/balance.mjs`. Re-run any
time after a data change to re-measure.

```bash
node scripts/balance.mjs                 # default sweep (REPS=2, 5-min cap)
REPS=6 node scripts/balance.mjs          # more seeds, tighter signal
PAIR=semaun,badar node scripts/balance.mjs   # one matchup (smoke test)
```

## Method

- **AI vs AI, 1v1**, every faction pairing, **both start positions** (to cancel
  positional bias), several seeds each.
- The sim is **fully deterministic** (Phase 11 routed the one stray
  `Math.random()` in the AI through the seeded `sim.rng`), so the harness is
  **reproducible**: same inputs → identical report. This is what makes A/B
  tuning trustworthy, and it also means save/load stays in lock-step even with
  AI active.
- **Outcome = positional dominance.** AI-vs-AI reliably reaches a *defensive
  stalemate* (neither AI razes the other's capital, even given 25 minutes), so
  "who destroyed whom" yields no signal. Instead each match is scored at a
  5-minute horizon by **army + economy value**, weighted by current HP and
  attack so durability/damage buffs get credit (a pure cost snapshot misses
  them). A conquest, if it ever happens, still wins outright.

### What the harness under-measures (read results with this in mind)

Buffs that are **informational or situational** barely move the score because
the AI can't fully exploit them and they don't show up as raw value:
**vision** (`losBonus`), **stealth** (`jungleAmbush`), **defensive auras**
(`auraArmor`), and **market/trade** edges (`tradeMult`) the AI rarely uses.
Factions built on these read lower here than they play versus a human.

## Findings

The factions are **tightly clustered**. The first naive metric (cost-only value)
showed a misleading 35-point spread — almost entirely an artifact of ignoring
HP/durability. With an HP/attack-aware score the spread is ~15 points, and after
one tuning pass it is **~12 points**, with no faction above 50%:

| Faction | Win rate | Kit |
|---|---|---|
| Sakam | ~48% | faster training, +move speed (tempo) |
| Saman | ~48% | strong villager economy/combat |
| Semaun | ~45% | tougher infantry, cheaper builds |
| Hassan | ~45% | walls + defensive armour aura |
| Shahbandar | ~45% | trade economy + vision |
| Badar | ~37% | vision + jungle ambush (under-measured) |

(180-match deterministic sweep, `REPS=6`, normal difficulty.)

## Tuning applied

Only one faction sat clearly low: **Badar**, whose entire identity (extra
vision + treeline ambush) is the kind of kit this harness can't see. Rather
than inflate the things it can't measure, Badar received a small, *measurable*
and thematically-fitting edge — **faster foraging (`gatherMult 1.12`)** and
**ambushers hit harder (`meleeAtk +1`)** — lifting it from ~30% to ~37% without
touching the other five. Every seeded sim test stayed green (verified), so the
change is safe for the `black_magic` enemy theme that borrows Badar's base.

No other faction needed changes: 45–48% across the board is healthy RTS balance.
Match length sits at the intended ~5-minute measurement horizon (longer in real,
decisive play).

## If you tune further

- Re-run `REPS=6 node scripts/balance.mjs` before and after each change; compare
  the trailing `JSON` line.
- Prefer **measurable** levers (economy/training/combat numbers) for harness
  work; validate **informational** kits (vision/stealth/trade) in real games.
- Keep the seeded suite green: `for t in phase2 … fire save; do node
  scripts/test-sim-$t.mjs; done`. Combat-number changes can shift the
  timing-sensitive tests — update expectations deliberately if so.
