# Premium currency, paid skins and the BRT unlock

Date: 2026-10-05. Draft for confirmation; nothing here is built. Comes out of the monetization discussion
(rewarded ads first, real-money purchases later through Paystack once accounts exist).

## Goal

Add a second currency, bought with real money, that pays for two things only: vehicle skins and the BRT.
Naira stays the earned currency and is never sold for real money.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Premium currency | Called **Gems** (display name only; the code field stays `premium`). Bought with real money. |
| What it buys | Vehicle skins (paints) and unlocking the BRT. Nothing else. |
| Default paint | Yellow on Okada, Keke Marwa and Danfo. The BRT keeps its white-and-blue livery. |
| Other paints | Every non-default paint costs premium currency. |
| BRT unlock | Watch rewarded ad(s), or pay premium currency. Replaces the naira price (`locked.coins`). |
| Naira | Unchanged: vehicles, drivers and stat upgrades. Not for sale. |

## Not decided yet

- The currency's symbol or icon (the name is Gems).
- Skin prices, premium-currency bundle sizes and real-naira prices.
- How many ad views unlock the BRT (one, or a short streak over a few days).
- Whether ads can also give a small amount of premium currency.
- Whether skins can be previewed before buying (recommended: yes).
- The Okada's red becomes a premium paint; confirm that is wanted.

## What changes

- `src/config/vehicles.ts`: the first paint of Okada, Keke and Danfo becomes yellow. Okada's current default is
  red; Keke and Danfo already start yellow. The BRT's `locked` field changes from a naira price to the
  ad-or-premium rule. Each paint gets a premium price except the default.
- Garage: paints you have not bought show a price and a preview; the BRT shows "watch ad" and "buy" options.
- Save data: owned paints per vehicle, premium balance, BRT ad-view progress.
- Purchases must be confirmed on the server (webhook), so they wait for accounts. Until then the premium
  balance can only come from test or ad rewards, never from payment.

## Guardrails

- Skins are cosmetic only: same stats in single-player and in rooms.
- No loot boxes or random drops. Every price is shown up front, in ₦.
- Premium currency cannot be traded, gifted or turned back into naira.
- The ad that unlocks the BRT is opt-in and never shown mid-race.
- Multiplayer: the vehicle-upgrades spec lets naira upgrades count in rooms. Premium currency never touches
  stats, but the "no pay-to-win" promise only holds for upgrades if rooms fix or ignore upgrade levels. Decide
  that separately.

## Open risks

- Premium currency as closed-loop in-game credit may touch CBN rules; get a Nigerian lawyer's view before launch.
- Selling to under-18s needs parental-consent handling under the NDPA, and a refund policy for digital goods
  (FCCPC). Check both before real payments go live.
- A Play Store version must use Google Play Billing for the currency and cannot point to Paystack.

## Build order

1. Paint and BRT rules in config and Garage (no payment): skins locked, BRT unlock by ad stub.
2. Rewarded-ad provider (AdSense H5 Games Ads), after approval.
3. Accounts and a server-side wallet.
4. Paystack checkout and webhook, premium bundles, refund policy.
