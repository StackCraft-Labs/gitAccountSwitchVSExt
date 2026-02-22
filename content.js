/**
 * content.js
 *
 * Runs on supported search engine result pages.
 * Detects the trigger phrase in the search query and redirects
 * to the house gallery page.
 */

(() => {
  'use strict';

  const TRIGGER_PHRASE = 'hello world';

  /**
   * Extracts the search query from the current URL.
   * Handles Google, Bing, Yahoo (`p` param), and DuckDuckGo (`q` param).
   *
   * @returns {string} Lowercased, trimmed search query.
   */
  const getSearchQuery = () => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('q') ?? params.get('p') ?? params.get('query') ?? '';
    return raw.trim().toLowerCase();
  };

  const query = getSearchQuery();

  if (query === TRIGGER_PHRASE) {
    const galleryUrl = chrome.runtime.getURL('gallery.html');
    window.location.replace(galleryUrl);
  }
})();
