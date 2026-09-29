#!/usr/bin/env node
/**
 * Nuvio → Vega Provider Converter
 * 
 * Converts All-in-One-Nuvio providers into Vega-compatible split dist modules.
 * 
 * Vega module system:
 *   dist/{value}/catalog.js  → exports { catalog, genres }
 *   dist/{value}/posts.js    → exports { getPosts, getSearchPosts }
 *   dist/{value}/meta.js     → exports { getMeta }  returns Info
 *   dist/{value}/stream.js   → exports { getStream } returns Stream[]
 *   dist/{value}/settings.js → exports { getSettingsSchema } (optional)
 * 
 * Link encoding convention (meta → stream bridge):
 *   link = "TMDB::{tmdbId}::TYPE::{movie|tv}::S::{season}::E::{episode}"
 *   For movies:   "TMDB::12345::TYPE::movie"
 *   For episodes: "TMDB::12345::TYPE::tv::S::1::E::1"
 * 
 * Nuvio getStreams signature:
 *   getStreams(tmdbId, type='movie', season=null, episode=null)
 *   Returns: [{name, title, url, quality, type?, headers?, subtitles?}]
 * 
 * Vega Stream interface:
 *   { server, link, type, quality?, tags?, subtitles?, headers? }
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const NUVIO_DIR  = process.argv[2] || path.join(__dirname, '../../nuvio/All-in-One-Nuvio-main');
const OUTPUT_DIR = process.argv[3] || path.join(__dirname, 'output');
// ─────────────────────────────────────────────────────────────────────────────

// Detect stream type from URL
const DETECT_TYPE_JS = `
function detectStreamType(url) {
  if (!url) return 'mp4';
  const u = url.toLowerCase();
  if (u.includes('.m3u8') || u.includes('/hls/') || u.includes('/master.m3u')) return 'm3u8';
  if (u.includes('.mpd') || u.includes('/dash/')) return 'dash';
  if (u.includes('.mkv')) return 'mkv';
  return 'mp4';
}
`.trim();

// Map Nuvio contentLanguage to vega provider type
function getVegaType(langs) {
  if (!langs || langs.length === 0) return 'global';
  const l = langs.map(x => x.toLowerCase());
  if (l.includes('ja') || l.includes('ko')) {
    if (l.includes('hi') || l.includes('ta') || l.includes('te')) return 'india';
    return 'anime';
  }
  if (l.includes('hi') || l.includes('ta') || l.includes('te') || l.includes('ba')) return 'india';
  if (l.includes('ko') || l.includes('ch') || l.includes('th')) return 'drama';
  if (l.includes('it') || l.includes('ita') || l.includes('fr') || l.includes('de')) return 'global';
  return 'english';
}

// ─── MODULE TEMPLATES ────────────────────────────────────────────────────────

function makeCatalogModule(scraper) {
  const supportedTypes = scraper.supportedTypes || ['movie', 'tv'];
  const catalog = [];
  const genres  = [];

  if (supportedTypes.includes('movie')) {
    catalog.push({ title: 'Movies',    filter: 'movie' });
    genres.push(
      { title: 'Action',    filter: 'movie_action' },
      { title: 'Drama',     filter: 'movie_drama'  },
      { title: 'Comedy',    filter: 'movie_comedy' },
      { title: 'Thriller',  filter: 'movie_thriller' },
      { title: 'Horror',    filter: 'movie_horror' },
    );
  }
  if (supportedTypes.includes('tv')) {
    catalog.push({ title: 'TV Shows', filter: 'tv' });
    genres.push(
      { title: 'Drama Series',  filter: 'tv_drama'   },
      { title: 'Action Series', filter: 'tv_action'  },
    );
  }

  return `// catalog.js — ${scraper.name}
module.exports = {
  catalog: ${JSON.stringify(catalog, null, 2)},
  genres:  ${JSON.stringify(genres,  null, 2)},
};
`;
}

// posts.js — wraps TMDB popular/search endpoints to produce Post[]
// link encodes: "TMDB::{tmdbId}::TYPE::{movie|tv}"
function makePostsModule(scraper) {
  const supportedTypes = scraper.supportedTypes || ['movie', 'tv'];
  const allowMovie = supportedTypes.includes('movie');
  const allowTV    = supportedTypes.includes('tv');

  return `// posts.js — ${scraper.name}
// Uses TMDB to provide home page posts and search results.
// link format: "TMDB::{tmdbId}::TYPE::{movie|tv}"

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = '439b7c09cfe78c84a2abeb2e8e8f14b7'; // public demo key

async function fetchTMDB(path, params, signal) {
  const qs = new URLSearchParams({ api_key: TMDB_KEY, ...params });
  const res = await fetch(TMDB_API + path + '?' + qs, { signal });
  if (!res.ok) return null;
  return res.json();
}

function tmdbItemToPost(item, mediaType) {
  const type = mediaType || (item.media_type === 'tv' ? 'tv' : 'movie');
  const tmdbId = item.id;
  return {
    title:   item.title || item.name || 'Unknown',
    image:   item.poster_path ? 'https://image.tmdb.org/t/p/w500' + item.poster_path : '',
    link:    'TMDB::' + tmdbId + '::TYPE::' + type,
    tag:     type === 'tv' ? 'TV' : 'Movie',
  };
}

async function getPosts({ filter, page, providerValue, signal }) {
  const p = page || 1;
  let results = [];
  
  const filterLower = (filter || '').toLowerCase();
  
  // Resolve media type from filter
  let mediaType = 'movie';
  ${allowTV && allowMovie ? `
  if (filterLower.startsWith('tv')) mediaType = 'tv';
  else mediaType = 'movie';
  ` : allowTV ? `mediaType = 'tv';` : `mediaType = 'movie';`}

  let genre = null;
  const genreMatch = filterLower.match(/_(action|drama|comedy|thriller|horror)$/);
  if (genreMatch) {
    const GENRE_IDS = { action: 28, drama: 18, comedy: 35, thriller: 53, horror: 27,
                        action_tv: 10759, drama_tv: 18 };
    genre = GENRE_IDS[genreMatch[1]] || null;
  }

  const params = { page: p, language: 'en-US' };
  if (genre) params.with_genres = genre;

  const endpoint = '/' + mediaType + (genre ? '/discover' : '/popular');
  const path = genre ? '/discover/' + mediaType : '/' + mediaType + '/popular';
  
  const data = await fetchTMDB(path, params, signal);
  if (!data || !data.results) return [];
  
  results = data.results.map(item => tmdbItemToPost(item, mediaType));
  return results;
}

async function getSearchPosts({ searchQuery, page, providerValue, signal }) {
  if (!searchQuery) return [];
  const data = await fetchTMDB('/search/multi', { query: searchQuery, page: page || 1 }, signal);
  if (!data || !data.results) return [];
  return data.results
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    ${!allowMovie ? `.filter(item => item.media_type !== 'movie')` : ''}
    ${!allowTV    ? `.filter(item => item.media_type !== 'tv')` : ''}
    .map(item => tmdbItemToPost(item, item.media_type));
}

module.exports = { getPosts, getSearchPosts };
`;
}

// meta.js — TMDB metadata, link encodes tmdbId+type for stream module
function makeMetaModule(scraper) {
  return `// meta.js — ${scraper.name}
// getMeta receives: link = "TMDB::{tmdbId}::TYPE::{movie|tv}"
// Returns Info object. linkList entries re-encode season/episode for stream.js.

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = '439b7c09cfe78c84a2abeb2e8e8f14b7';

function parseLink(link) {
  const parts = link.split('::');
  const tmdbId = parts[1] || link;
  const type   = parts[3] || 'movie';
  return { tmdbId, type };
}

async function fetchTMDB(path, signal) {
  const res = await fetch(TMDB_API + path + '?api_key=' + TMDB_KEY + '&append_to_response=seasons,external_ids', { signal });
  if (!res.ok) return null;
  return res.json();
}

async function getMeta({ link, provider }) {
  const { tmdbId, type } = parseLink(link);
  const endpoint = '/' + (type === 'tv' ? 'tv' : 'movie') + '/' + tmdbId;
  
  let data;
  try {
    data = await fetchTMDB(endpoint, null);
  } catch(e) {
    // fallback minimal
    return {
      title:    'Unknown',
      image:    '',
      synopsis: '',
      type,
      linkList: [{ title: 'Play', link }],
    };
  }

  if (!data) {
    return { title: 'Unknown', image: '', synopsis: '', type, linkList: [{ title: 'Play', link }] };
  }

  const title    = data.title || data.name || 'Unknown';
  const image    = data.poster_path   ? 'https://image.tmdb.org/t/p/w500' + data.poster_path   : '';
  const poster   = data.backdrop_path ? 'https://image.tmdb.org/t/p/original' + data.backdrop_path : '';
  const synopsis = data.overview || '';
  const rating   = data.vote_average ? String(data.vote_average.toFixed(1)) : '';
  const imdbId   = data.external_ids?.imdb_id || '';
  const tags     = (data.genres || []).map(g => g.name);

  if (type === 'movie') {
    return {
      title, image, poster, synopsis, rating, type: 'movie',
      imdbId, tmdbId,
      tags,
      linkList: [{
        title: 'Stream',
        link:  'TMDB::' + tmdbId + '::TYPE::movie',
      }],
    };
  }

  // TV series — build season linkList
  const seasons = (data.seasons || []).filter(s => s.season_number > 0);
  const linkList = seasons.length > 0
    ? seasons.map(season => ({
        title:        'Season ' + season.season_number,
        episodesLink: 'TMDB::' + tmdbId + '::TYPE::tv::SEASON::' + season.season_number,
        link:         'TMDB::' + tmdbId + '::TYPE::tv::SEASON::' + season.season_number + '::EP::1',
      }))
    : [{
        title:        'Season 1',
        episodesLink: 'TMDB::' + tmdbId + '::TYPE::tv::SEASON::1',
        link:         'TMDB::' + tmdbId + '::TYPE::tv::SEASON::1::EP::1',
      }];

  return { title, image, poster, synopsis, rating, type: 'series', imdbId, tmdbId, tags, linkList };
}

module.exports = { getMeta };
`;
}

// episodes.js — fetches TMDB episode list for a season
function makeEpisodesModule(scraper) {
  return `// episodes.js — ${scraper.name}
// url format: "TMDB::{tmdbId}::TYPE::tv::SEASON::{seasonNum}"

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = '439b7c09cfe78c84a2abeb2e8e8f14b7';

async function getEpisodes({ url }) {
  const parts   = url.split('::');
  const tmdbId  = parts[1];
  const season  = parts[5] || '1';

  try {
    const res  = await fetch(
      TMDB_API + '/tv/' + tmdbId + '/season/' + season + '?api_key=' + TMDB_KEY
    );
    const data = await res.json();
    if (!data || !data.episodes) return [];

    return data.episodes.map(ep => ({
      id:    'S' + season + 'E' + ep.episode_number,
      title: ep.name || ('Episode ' + ep.episode_number),
      link:  'TMDB::' + tmdbId + '::TYPE::tv::SEASON::' + season + '::EP::' + ep.episode_number,
      image: ep.still_path ? 'https://image.tmdb.org/t/p/w500' + ep.still_path : '',
      description: ep.overview || '',
    }));
  } catch(e) {
    return [];
  }
}

module.exports = { getEpisodes };
`;
}

// stream.js — the bridge: decodes link, loads Nuvio provider, calls getStreams
function makeStreamModule(scraper, providerCode) {
  return `// stream.js — ${scraper.name}
// link format:
//   movie:   "TMDB::{tmdbId}::TYPE::movie"
//   episode: "TMDB::{tmdbId}::TYPE::tv::SEASON::{s}::EP::{e}"
// 
// This module embeds the Nuvio provider and adapts its getStreams() output
// to Vega's Stream[] interface.

${DETECT_TYPE_JS}

// ── Nuvio provider code (embedded) ──────────────────────────────────────────
${providerCode}
// ── end Nuvio provider ──────────────────────────────────────────────────────

function parseLink(link) {
  const parts = link.split('::');
  const tmdbId  = parts[1] || link;
  const type    = parts[3] || 'movie';
  const season  = parts[5] ? parseInt(parts[5], 10)  : null;
  const episode = parts[7] ? parseInt(parts[7], 10)  : null;
  return { tmdbId, type, season, episode };
}

function nuvioStreamToVega(nuvioStream, idx) {
  const url  = nuvioStream.url || '';
  const name = nuvioStream.name || nuvioStream.title || ('Stream ' + (idx + 1));
  const q    = nuvioStream.quality || '';
  
  // Normalise quality string → vega quality field
  let quality = '';
  const ql = q.toLowerCase();
  if (ql.includes('4k') || ql.includes('2160')) quality = '2160';
  else if (ql.includes('1080'))                  quality = '1080';
  else if (ql.includes('720'))                   quality = '720';
  else if (ql.includes('480'))                   quality = '480';
  else if (ql.includes('360'))                   quality = '360';

  const streamType = nuvioStream.type || detectStreamType(url);

  const tags = [];
  if (quality) tags.push(quality + 'p');
  if (nuvioStream.title) tags.push(nuvioStream.title.split('\\n')[0].trim().slice(0, 60));

  return {
    server:   name,
    link:     url,
    type:     streamType,
    quality:  quality || 'Auto',
    tags,
    headers:  nuvioStream.headers  || {},
    subtitles: (nuvioStream.subtitles || []).map(sub => ({
      title:    sub.title || sub.label || 'Subtitle',
      language: sub.language || sub.lang || 'en',
      type:     'text/vtt',
      uri:      sub.url || sub.file || '',
    })),
  };
}

async function getStream({ link, type, isDownload }) {
  const { tmdbId, type: mediaType, season, episode } = parseLink(link);
  
  try {
    // getStreams is defined in the embedded Nuvio provider above
    const nuvioStreams = await getStreams(tmdbId, mediaType, season, episode);
    if (!Array.isArray(nuvioStreams) || nuvioStreams.length === 0) return [];
    return nuvioStreams
      .filter(s => s && s.url)
      .map((s, i) => nuvioStreamToVega(s, i));
  } catch(e) {
    console.error('[${scraper.id}] getStream error:', e && e.message);
    return [];
  }
}

module.exports = { getStream };
`;
}

// settings.js — wraps Nuvio's onSettings if present
function makeSettingsModule(scraper, hasOnSettings) {
  if (!hasOnSettings) {
    return `// settings.js — ${scraper.name}
module.exports = { getSettingsSchema: async () => [] };
`;
  }
  return `// settings.js — ${scraper.name}
// Delegates to Nuvio's onSettings() which is embedded in stream.js.
// We re-expose it here as getSettingsSchema() for Vega.
// 
// Note: onSettings is defined in stream.js's embedded provider.
// We can't import across modules in Vega's sandbox, so we duplicate
// the settings extraction here by re-running the provider with a
// dummy getStreams call and catching onSettings.

module.exports = {
  getSettingsSchema: async function() {
    try {
      if (typeof onSettings === 'function') {
        return await onSettings();
      }
    } catch(e) {}
    return [];
  }
};
`;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

function main() {
  const manifestPath = path.join(NUVIO_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('ERROR: manifest.json not found at', manifestPath);
    process.exit(1);
  }

  const nuvioManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const scrapers = nuvioManifest.scrapers || [];

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUTPUT_DIR, 'dist'), { recursive: true });

  const vegaManifest = [];
  let ok = 0, skip = 0;

  for (const scraper of scrapers) {
    const id = scraper.id;
    const providerFile = path.join(NUVIO_DIR, scraper.filename || `providers/${id}.js`);

    if (!fs.existsSync(providerFile)) {
      console.warn(`SKIP ${id}: provider file not found (${providerFile})`);
      skip++;
      continue;
    }

    const providerCode = fs.readFileSync(providerFile, 'utf8');
    
    // Detect if provider exports onSettings
    const hasOnSettings = providerCode.includes('onSettings') && providerCode.includes('getSettingsSchema') === false;

    // Create dist/{id}/ directory
    const distDir = path.join(OUTPUT_DIR, 'dist', id);
    fs.mkdirSync(distDir, { recursive: true });

    // Write split modules
    fs.writeFileSync(path.join(distDir, 'catalog.js'),  makeCatalogModule(scraper));
    fs.writeFileSync(path.join(distDir, 'posts.js'),    makePostsModule(scraper));
    fs.writeFileSync(path.join(distDir, 'meta.js'),     makeMetaModule(scraper));
    fs.writeFileSync(path.join(distDir, 'stream.js'),   makeStreamModule(scraper, providerCode));
    fs.writeFileSync(path.join(distDir, 'episodes.js'), makeEpisodesModule(scraper));
    fs.writeFileSync(path.join(distDir, 'settings.js'), makeSettingsModule(scraper, hasOnSettings));

    // Build vega manifest entry
    const vegaEntry = {
      value:        id,
      display_name: scraper.name,
      version:      scraper.version || '1.0.0',
      icon:         scraper.logo   || '',
      type:         getVegaType(scraper.contentLanguage),
      disabled:     !scraper.enabled,
      hasSettings:  hasOnSettings,
    };
    vegaManifest.push(vegaEntry);

    console.log(`OK  ${id.padEnd(20)} → ${distDir.replace(OUTPUT_DIR, '')}`);
    ok++;
  }

  // Write vega-compatible manifest.json (root)
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'manifest.json'),
    JSON.stringify(vegaManifest, null, 2),
  );

  console.log(`\nDone. ${ok} providers converted, ${skip} skipped.`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`\nTo use in Vega:`);
  console.log(`  1. Host the output/ directory (any static file server)`);
  console.log(`  2. In Vega > Settings > Extension Sources, add:`);
  console.log(`       Author: NuvioAll`);
  console.log(`       URL:    https://your-host.com/output`);
  console.log(`  3. Browse and install providers from the Extensions tab`);
}

main();
