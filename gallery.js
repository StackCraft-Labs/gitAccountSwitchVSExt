/**
 * gallery.js
 *
 * Fetches house images from the Pixabay API and renders them
 * into a responsive grid.
 *
 * Setup:
 *   1. Get a FREE API key at https://pixabay.com/api/docs/ (takes ~2 min)
 *   2. Replace the placeholder value in CONFIG.API_KEY below.
 */

'use strict';

/* ─────────────────────────────────────────────
   Configuration — edit only this block
   ───────────────────────────────────────────── */
const CONFIG = Object.freeze({
  /** Get your FREE key at https://pixabay.com/api/docs/ */
  API_KEY: 'YOUR_PIXABAY_API_KEY_HERE',

  API_BASE: 'https://pixabay.com/api/',

  /** Search term sent to Pixabay */
  QUERY: 'house home architecture',

  /** How many images per page (max 200) */
  PER_PAGE: 20,

  /** 'all' | 'photo' | 'illustration' | 'vector' */
  IMAGE_TYPE: 'photo',

  /** 'all' | 'horizontal' | 'vertical' */
  ORIENTATION: 'horizontal',

  /** Block adult content */
  SAFESEARCH: true,
});

/* ─────────────────────────────────────────────
   DOM references
   ───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const dom = {
  gallery:    $('js-gallery'),
  loader:     $('js-loader'),
  error:      $('js-error'),
  errorMsg:   $('js-error-msg'),
  retry:      $('js-retry'),
  loadMore:   $('js-load-more'),
};

/* ─────────────────────────────────────────────
   State
   ───────────────────────────────────────────── */
let currentPage  = 1;
let totalHits    = 0;
let isFetching   = false;

/* ─────────────────────────────────────────────
   API
   ───────────────────────────────────────────── */

/**
 * Builds the Pixabay API URL for a given page.
 *
 * @param {number} page
 * @returns {string}
 */
const buildApiUrl = (page) => {
  const params = new URLSearchParams({
    key:         CONFIG.API_KEY,
    q:           CONFIG.QUERY,
    image_type:  CONFIG.IMAGE_TYPE,
    orientation: CONFIG.ORIENTATION,
    safesearch:  CONFIG.SAFESEARCH,
    per_page:    CONFIG.PER_PAGE,
    page,
  });
  return `${CONFIG.API_BASE}?${params}`;
};

/**
 * Fetches a page of house images from Pixabay.
 *
 * @param {number} page
 * @returns {Promise<{ hits: object[], totalHits: number }>}
 */
const fetchImages = async (page) => {
  if (CONFIG.API_KEY === 'YOUR_PIXABAY_API_KEY_HERE') {
    throw new Error(
      'No API key set. Open gallery.js and replace YOUR_PIXABAY_API_KEY_HERE ' +
      'with your free Pixabay key from https://pixabay.com/api/docs/'
    );
  }

  const res = await fetch(buildApiUrl(page));

  if (!res.ok) {
    throw new Error(`Pixabay API responded with ${res.status} ${res.statusText}`);
  }

  return res.json();
};

/* ─────────────────────────────────────────────
   DOM helpers
   ───────────────────────────────────────────── */

/**
 * Creates a single image card element.
 *
 * @param {object} photo  Pixabay hit object
 * @returns {HTMLElement}
 */
const createCard = (photo) => {
  const article = document.createElement('article');
  article.className = 'card';

  /* Clickable wrapper → opens Pixabay page */
  const anchor = document.createElement('a');
  anchor.href   = photo.pageURL;
  anchor.target = '_blank';
  anchor.rel    = 'noopener noreferrer';
  anchor.className = 'card__link';
  anchor.setAttribute('aria-label', `View house photo by ${photo.user} on Pixabay`);

  /* Image */
  const img = document.createElement('img');
  img.src     = photo.webformatURL;
  img.alt     = photo.tags || 'House photo';
  img.loading = 'lazy';
  img.width   = 640;
  img.height  = 428;
  img.className = 'card__img';
  img.addEventListener('load', () => img.classList.add('loaded'), { once: true });

  /* Caption */
  const caption = document.createElement('div');
  caption.className = 'card__caption';

  const tags = document.createElement('p');
  tags.className   = 'card__tags';
  tags.textContent = photo.tags;

  const meta = document.createElement('p');
  meta.className = 'card__meta';

  const userLink = document.createElement('a');
  userLink.href   = `https://pixabay.com/users/${photo.user}-${photo.user_id}/`;
  userLink.target = '_blank';
  userLink.rel    = 'noopener noreferrer';
  userLink.textContent = photo.user;

  meta.append('by ', userLink);
  caption.append(tags, meta);

  anchor.append(img);
  article.append(anchor, caption);

  return article;
};

/** Shows or hides the spinner. */
const setLoader = (visible) => {
  dom.loader.classList.toggle('hidden', !visible);
};

/** Shows an error banner with a message. */
const showError = (message) => {
  dom.errorMsg.textContent = ` ${message}`;
  dom.error.classList.remove('hidden');
};

/** Hides the error banner. */
const clearError = () => {
  dom.error.classList.add('hidden');
  dom.errorMsg.textContent = '';
};

/** Syncs the "Load More" button visibility. */
const syncLoadMoreButton = () => {
  const loaded = dom.gallery.querySelectorAll('.card').length;
  dom.loadMore.classList.toggle('hidden', loaded >= totalHits);
};

/* ─────────────────────────────────────────────
   Core logic
   ───────────────────────────────────────────── */

/**
 * Loads a page of images, appends them to the gallery.
 *
 * @param {number} page
 */
const loadPage = async (page) => {
  if (isFetching) return;

  isFetching = true;
  clearError();
  setLoader(true);
  dom.loadMore.disabled = true;

  try {
    const data = await fetchImages(page);

    totalHits = data.totalHits;

    const fragment = document.createDocumentFragment();
    data.hits.forEach((photo) => fragment.appendChild(createCard(photo)));
    dom.gallery.appendChild(fragment);

    syncLoadMoreButton();
  } catch (err) {
    showError(err.message);
    console.error('[House Gallery]', err);
  } finally {
    setLoader(false);
    dom.loadMore.disabled = false;
    isFetching = false;
  }
};

/* ─────────────────────────────────────────────
   Event listeners
   ───────────────────────────────────────────── */

dom.loadMore.addEventListener('click', () => {
  currentPage += 1;
  loadPage(currentPage);
});

dom.retry.addEventListener('click', (e) => {
  e.preventDefault();
  loadPage(currentPage);
});

/* ─────────────────────────────────────────────
   Bootstrap
   ───────────────────────────────────────────── */
loadPage(currentPage);
