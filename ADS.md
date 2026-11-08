# Ads on StreamZone

Three ad types, all Adsterra. Ads never run on localhost — append `?ads=1` to
test them locally.

## 1. Banners — `src/components/AdBanner.tsx`

| Size | Slot | Where |
|---|---|---|
| Leaderboard 728×90 | `a13d8637793eb5e5aa36538259c6cf41` | Top of every page |
| Rectangle 300×250 | `8195f9139671b98d2c53ffa6266ee6fc` | Bottom of every page |

Below 730px wide the leaderboard swaps to the rectangle automatically.

Each banner renders inside its own `srcdoc` iframe. Adsterra's script uses a
single global `atOptions`, so two banners on one page would otherwise
overwrite each other and both show the same size. If a banner fails to load
(ad blocker, blocked host) it posts back to the page and a native banner takes
its place.

Live on: Home, Movies, Watch, Movie Watch — 2 per page.

## 2. Site popunder — `src/components/AdPopup.tsx`

Fires once per visitor per **20 minutes**, on Home and Movies only. Last-shown
time is kept in `localStorage` under `sz_popup_last`. Entirely separate from
the player ads below.

## 3. Player click ads — `src/components/PlayerAdGate.tsx`

The main earner. A viewer must click the player **2 times** before video
starts; each click opens an ad in a new tab. That stream then unlocks for
**30 minutes**.

The cooldown is **per stream link**, not per match or per visitor. Switching
from Server 1 to Server 2 is a fresh 2 clicks, so a viewer hopping between
servers generates several impressions. Unlocks are stored in `localStorage`
under `sz_player_ads`, keyed by host + path — the API refreshes the tokens in
stream URLs constantly, so the query string is ignored.

Returning to a stream inside its 30 minutes shows no ads. A stream already
playing never gets interrupted.

Set the destination URLs via env var — one Direct Link / Smartlink, or two
comma-separated (click 1 opens the first, click 2 the second):

```
VITE_PLAYER_AD_URLS=https://link-one.example,https://link-two.example
```

Leave it empty and the gate disables itself — video plays immediately, no ads.

> Vercel warns that `VITE_` variables are exposed to the browser. That's
> expected here: the URLs have to reach the browser to be opened, and they are
> public ad links, not secrets.

## Rough earnings shape

Player clicks pay far more than banners, so revenue tracks **streams opened**,
not pageviews. The multi-server list on paid sports matches helps — more
servers per match means more separate 2-click gates.

## Known issues

- Some networks block `www.highperformanceformat.com` (the banner host), so
  banners silently vanish for those visitors. The native-banner fallback covers
  part of this.
- Movie embed providers inject their own popups inside the iframe, which
  compete with your gate for the viewer's clicks. Nothing to do about it from
  outside the iframe.
