# Vehicle upgrades and naira payouts

Date: 2026-10-04. Part of milestone 5 (garage and upgrades). Independent of the multiplayer build: it works in
single-player first and carries into rooms without extra syncing.

## Goal

Racing earns naira. Players spend naira in the Garage on per-vehicle upgrades that make that vehicle faster,
better handling or tougher. Success looks like:

- finishing 1st, 2nd or 3rd pays out, and 4th to 6th pays nothing;
- a player can feel a purchased upgrade in the next race;
- about 12 first-place finishes fully maxes one vehicle (3 categories × 5 levels).

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Currency | Naira replaces the existing `coins` balance. One currency, same save field (`coins`), shown as ₦. |
| Payout | 1st ₦200,000, 2nd ₦150,000, 3rd ₦100,000, 4th–6th ₦0. Replaces the 150/100/60/30/20 table. |
| Structure | Per vehicle. Three categories (Engine, Tyres, Body), levels 0 to 5. |
| Pacing | About 12 wins to max one vehicle. |
| AI | Unchanged. AI cars always use base stats. |
| Multiplayer | Upgrades count in rooms. Top 3 earn the same payouts. |

## Economy (`src/config/economy.ts`, new)

All numbers live here so they are easy to tune.

- `PAYOUTS = [200_000, 150_000, 100_000]`; `payoutForPlace(place)` returns `PAYOUTS[place] ?? 0` (place is
  0-based in finishing order, counting AI cars).
- `UPGRADE_PRICES = [80_000, 120_000, 160_000, 200_000, 260_000]` (level 1 to 5). The same for every vehicle
  and category. One category costs ₦820,000; a full build costs ₦2,460,000.
- `MAX_UPGRADE_LEVEL = 5`.
- Vehicle unlock prices (`locked.coins` in `vehicles.ts`): Blue BRT ₦2,000,000, Red BRT ₦3,000,000
  (were 500 and 800).
- `formatNaira(n)`: `₦200,000` below one million, `₦1.2M` at or above.

## Upgrade effects

Each level adds a fixed step. All values are in `economy.ts` as per-level steps, applied as multipliers on the
base tuning.

| Category | Per level | At level 5 |
|---|---|---|
| Engine | `topSpeed` +4%, `accel` +6% | +20% top speed, +30% accel |
| Tyres | `grip` +4%, `steerAtSpeed` +3%, `brake` +4% | +20% grip, +15% steer at speed (capped at 1.0), +20% brake |
| Body | impact multiplier −10%, `mass` +3% | impact ×0.5, +15% mass |

**Impact multiplier (new).** Add `tuning.impact` to `VehicleConfig` (base value 1 for every vehicle). It
scales the speed lost to wall and vehicle knocks (`racer.knock` in `Vehicle.tsx`) and the scrape drag while
rubbing a wall. This gives Body a real effect: today the toughness stat is display-only.

**Stat bars.** Each Garage bar shows the base value (out of 10) plus a coloured segment for upgrades, capped at
10: Engine adds to Speed (+0.4 per level), Tyres to Handling (+0.4 per level), Body to Toughness (+0.4 per
level).

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/config/economy.ts` | Payout table, prices, per-level steps, `formatNaira`, `payoutForPlace`, `upgradePrice`. Pure. | nothing |
| `src/game/upgrades.ts` | `UpgradeLevels` type, `applyUpgrades(base, levels): VehicleConfig`, `displayStats(base, levels)`. Pure. | `economy`, `vehicles` |
| `src/game/store.ts` | `upgrades` in the save, `buyUpgrade(vehicle, kind)`, payout wiring, `coins` handling. | `economy`, `upgrades` |
| `src/ui/Garage.tsx` | Three upgrade rows (name, level pips, price button) under the stat bars. | store |
| `src/ui/Results.tsx` | Shows `+ ₦200,000` using `formatNaira`; ₦0 shows "No naira this time". | store |
| `src/scene/RaceLogic.tsx` | Payout uses `payoutForPlace`. Player racer is built from `applyUpgrades`. | `economy`, `upgrades` |
| `src/scene/Vehicle.tsx` | Multiplies knock and scrape drag by `tuning.impact`. | vehicles |

## Data and flow

- Save shape adds `upgrades: Partial<Record<VehicleId, { engine: number; tyres: number; body: number }>>`.
  Missing entries mean level 0, so existing saves load unchanged. Loaded levels are clamped to
  0..`MAX_UPGRADE_LEVEL` and non-integers are discarded, because the save is plain `localStorage` text.
- `buyUpgrade(vehicle, kind)`: no-op if the vehicle is locked, the category is at max level, or `coins` is
  below the next level's price. Otherwise it deducts the price, increments the level and saves.
- The player's racer is created from `applyUpgrades(vehicleById(id), upgrades[id])`. Physics, camera, engine
  sound and HUD already read `racer.vehicle`, so they need no changes.
- AI racers keep `vehicleById(...)` base configs.
- `finishRace` receives `payoutForPlace(place)` as its coins argument.

## Multiplayer interaction

- Each phone simulates its own upgraded car, so no tuning data is synced.
- **Change to the multiplayer spec:** the referee's too-fast-lap check (`track.length / (topSpeed × 1.6)`)
  must use the vehicle's maxed-out top speed (`applyUpgrades` at level 5 Engine), or an upgraded player would
  be flagged as cheating. Update `2026-10-03-multiplayer-design.md` and its plan when that milestone is built.
- Room results use `payoutForPlace` on the server-sent finishing order. The multiplayer spec line "Coins are
  awarded by place, using the same table as single-player" already matches.

## Edge cases

- DNF or still racing when results are produced: place comes from the standings order, so a car ranked 4th or
  lower earns ₦0.
- A player who cannot afford anything sees a disabled price button showing the amount still needed.
- Max level shows "MAX" in place of the button.
- Unlock price changes mean old saves holding small balances (a few hundred) are effectively reset to
  near-zero buying power. Acceptable at this stage; no migration.

## Out of scope

- Server-side validation of naira and upgrades (arrives with accounts; saves are editable in `localStorage`
  until then).
- Cosmetic customisation (paint, stickers, horns), more vehicles, AI difficulty scaling.
- Selling or refunding upgrades.

## Testing

- Unit tests (Vitest, alongside `race.test.ts`):
  - `payoutForPlace` for places 0 to 5 and beyond;
  - `upgradePrice` and the full-build total;
  - `applyUpgrades`: level 0 equals base; level 5 gives the expected multipliers; `steerAtSpeed` is capped at
    1; the base config is not mutated;
  - `buyUpgrade`: rejected when poor, at max level, or locked; success deducts the exact price;
  - save load: out-of-range and non-integer levels are clamped or discarded.
- Manual check at a phone viewport: Garage layout with upgrade rows, buying an upgrade, and feeling the
  difference in the next race (Engine and Tyres at level 5 on the Okada).
