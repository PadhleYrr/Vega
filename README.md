# Nuvio → Vega Providers

Converts [All-in-One-Nuvio](https://github.com/n0thing289/All-in-One-Nuvio) scrapers into Vega-compatible split dist modules, served via GitHub Pages.

## Available Providers

| ID | Name | Type |
|----|------|------|
| `vixsrc` | VixSrc | english |
| `hdhub4u` | HDHub4u | india |
| `netmirror` | NetMirror | english |
| `fibwatch` | FibWatch | english |
| `4khdhub` | 4KHDHub | english |
| `vidrock` | VidRock | english |
| `animezey` | AnimeZeY | anime |
| `vidlink` | VidLink | english |

## Using in Vega

1. Open Vega → **Settings → Extension Sources**
2. Add a new source:
   - **Author:** `NuvioAll`
   - **URL:** `https://PadhleYrr.github.io/nuvio-vega-providers`
3. Browse and install providers from the **Extensions** tab

## Module Structure

Each provider in `dist/{id}/` exports:

| File | Exports | Purpose |
|------|---------|---------|
| `catalog.js` | `{ catalog, genres }` | Home page categories |
| `posts.js` | `{ getPosts, getSearchPosts }` | TMDB-backed listings |
| `meta.js` | `{ getMeta }` | Title metadata + link list |
| `episodes.js` | `{ getEpisodes }` | Season episode list |
| `stream.js` | `{ getStream }` | Embedded Nuvio → stream URLs |
| `settings.js` | `{ getSettingsSchema }` | Provider settings (if any) |

## Link Encoding

```
movie:   TMDB::{tmdbId}::TYPE::movie
episode: TMDB::{tmdbId}::TYPE::tv::SEASON::{s}::EP::{e}
```

## Rebuilding from Source

```bash
node convert.js /path/to/All-in-One-Nuvio ./
```

Output lands in `dist/` + `manifest.json` at repo root.

## CI/CD

Push to `main` → GitHub Actions builds and deploys to Pages automatically.
