// episodes.js — VixSrc
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
