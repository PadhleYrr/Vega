// posts.js — FibWatch
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
  
  if (filterLower.startsWith('tv')) mediaType = 'tv';
  else mediaType = 'movie';
  

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
    
    
    .map(item => tmdbItemToPost(item, item.media_type));
}

module.exports = { getPosts, getSearchPosts };
