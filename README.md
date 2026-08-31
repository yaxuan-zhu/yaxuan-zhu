# Amy Zhu — Portfolio

Static site, no build step. `index.html` + `assets/`. Everything is vanilla
HTML/CSS/JS, so the folder can be served as-is by GitHub Pages.

Built from the Claude Design prototype `Amy Zhu Site.dc.html`. The prototype
needed the design tool's React runtime (`support.js`); that has been removed and
its component logic ported to `assets/js/site.js`. **This folder is now the
source of truth** — don't regenerate it from the prototype, edit it directly.

## Files

```
index.html            single page; all views live in it and swap via #hash
404.html              redirects stray URLs back to /
assets/css/site.css   design base styles + responsive/production layer
assets/js/site.js     view routing, 3D tile wall, filters, marquee, SFX
assets/img/           web-optimised photography (640px tiles, 1200px hero)
.nojekyll             stops Pages running the files through Jekyll
.github/workflows/    Pages deployment via GitHub Actions
```

Views are addressable: `#work`, `#list`, `#about`, `#contact`, and the four case
studies `#ball`, `#fire`, `#altay`, `#dr`.

## Deploying to GitHub Pages

The repo is already initialised, committed under **Julia Zhu
<yaxuan.zhu507@gmail.com>** (set locally on this repo only), and pointed at
`https://github.com/yaxuan-zhu/yaxuan-zhu.git`. To publish:

```bash
git push -u origin main
```

Then in the repo: **Settings → Pages → Source → GitHub Actions**. The included
workflow republishes on every push to `main`.

(If you'd rather not use Actions, **Source → Deploy from a branch → `main` / `root`**
works too — `.nojekyll` is already in place for it.)

Live URL: **https://yaxuan-zhu.github.io/yaxuan-zhu/** — that's the address the
`canonical` and `og:` tags in `index.html` point at.

> Renaming the repo to **`yaxuan-zhu.github.io`** would serve the site from the
> shorter `https://yaxuan-zhu.github.io/` instead. If you do that, update the
> three URLs in the `<head>` of `index.html` to match.

## Photography

14 photos are in place across the work wall, the About filmstrip and the Ball
Collector case hero. Sources came from `../Images/`; each was resized to 640px
(tiles) or 1200px (hero) and re-encoded, and renamed by subject so slots are easy
to re-point. Originals are untouched.

Photos are matched to slots by subject, but the productions were not named in the
source files — **worth a quick check with Amy that the theatre photos sit under
the right show** (Peter Pan vs. The Little Prince, in the work wall). Swapping is
a one-line `src` change.

### Slots still waiting on media

The remaining striped slots are the prototype's own "media goes here" markers.
Nothing in the current photo set fits them, so they were left visible rather than
filled with something misleading:

| View | Slot | Wants |
| --- | --- | --- |
| Work wall | Crew / rowing | dawn rowing photo or clip |
| Work wall | Rhythmic gymnastics | floor routine clip |
| Work wall | Fire safety patrol bot | patrol run clip |
| Work wall | Craft workshops | 艾草锤 workshop photo |
| Work wall | Guqin practice | practice clip |
| Contact | WeChat QR | QR code image |
| Ball Collector | 2 gallery slots | field test photo, vision debug UI |
| Patrol Bot | hero + 2 gallery | night patrol clip, chassis v1→v2, sensor array |
| Burqin River | hero + 2 gallery | river footage, sampling sites, convergence model |
| DR · 90D | hero + 2 gallery | fundus capture rig, capture rig, triage UI |

To fill one: drop the file in `assets/img/`, then replace that slot's inner
`<span>` with `<img class="slot-img" src="assets/img/NAME.jpg" alt="…" loading="lazy" decoding="async">`
and delete the `background-image:repeating-linear-gradient(...)` from the slot's
inline style. The design spec (M3) intends most tiles to become muted looping
video — a `<video class="slot-img" muted loop playsinline autoplay poster="…">`
drops into the same place when clips exist.

## Notes

- The header's live Beijing / Boston clocks tick from the visitor's browser.
- The wall scales down on narrow screens and can be dragged with a finger; list,
  about and case views scroll natively on touch.
- `prefers-reduced-motion` disables the parallax, colour wipes and marquee.
- Sound is off by default and synthesised in the browser — no audio assets.
