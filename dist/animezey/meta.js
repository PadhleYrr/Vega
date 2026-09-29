// meta.js — AnimeZeY
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
