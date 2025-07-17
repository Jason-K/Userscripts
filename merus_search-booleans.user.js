// ==UserScript==
// @name         MerusCase Boolean Search Enhancer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds AND, OR, NOT, +, and - logic to MerusCase Activity View search
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_search-booleans.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_search-booleans.user.js
// @match        https://*.meruscase.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    caseInsensitive: true,
    debounceDelay: 400,
    debug: true,
  };

  const SELECTORS = {
    searchInput: 'input[name="data[Search][q]"]',
    tableRow: '.tr-container tr.on-screen',
    descriptionCell: 'td[data-merus-help-id="activities-description"]',
    userCell: 'td[data-merus-help-id="activities-user"]',
    tagCell: 'td[data-merus-help-id="activities-type"]',
    dateCell: 'td[data-merus-help-id="activities-date"]',
  };

  let lastQuery = localStorage.getItem('merus_enhanced_query') || '';
  let enhancedEnabled = true;

  function parseQuery(input) {
    const terms = input.match(/(?:\([^\)]+\)|[^\s"]+|"[^"]*")+/g) || [];
    const include = [], exclude = [], orGroups = [];

    for (const term of terms) {
      const normalized = term.trim().toLowerCase();
      if (normalized.startsWith('-')) {
        exclude.push(normalized.slice(1));
      } else if (normalized === 'not') {
        continue; // Ignore lone NOTs
      } else if (normalized.includes('or') || normalized.includes('|')) {
        orGroups.push(normalized.split(/\s+or\s+|\|/).map(x => x.trim()));
      } else {
        include.push(normalized);
      }
    }
    return { include, exclude, orGroups };
  }

  function highlight(text, terms) {
    for (const term of terms) {
      if (term.length > 1) {
        const regex = new RegExp(`(${term})`, CONFIG.caseInsensitive ? 'gi' : 'g');
        text = text.replace(regex, '<mark>$1</mark>');
      }
    }
    return text;
  }

  function applyFilters(query) {
    const { include, exclude, orGroups } = parseQuery(query);

    const rows = Array.from(document.querySelectorAll(SELECTORS.tableRow));
    rows.forEach(row => {
      const descCell = row.querySelector(SELECTORS.descriptionCell);
      const userCell = row.querySelector(SELECTORS.userCell);
      const tagCell = row.querySelector(SELECTORS.tagCell);
      const dateCell = row.querySelector(SELECTORS.dateCell);

      const rawText = (descCell?.textContent || '') + ' ' +
                      (userCell?.textContent || '') + ' ' +
                      (tagCell?.textContent || '') + ' ' +
                      (dateCell?.textContent || '');
      const fullText = CONFIG.caseInsensitive ? rawText.toLowerCase() : rawText;

      let matchesInclude = include.every(term => fullText.includes(term));
      let matchesExclude = exclude.some(term => fullText.includes(term));
      let matchesOR = orGroups.length === 0 || orGroups.some(group => group.some(term => fullText.includes(term)));

      const match = matchesInclude && !matchesExclude && matchesOR;
      row.style.display = match ? '' : 'none';

      // Highlight matches
      if (match && descCell) descCell.innerHTML = highlight(descCell.textContent, include);
      if (match && userCell) userCell.innerHTML = highlight(userCell.textContent, include);
      if (match && tagCell) tagCell.innerHTML = highlight(tagCell.textContent, include);
      if (match && dateCell) dateCell.innerHTML = highlight(dateCell.textContent, include);
    });

    if (CONFIG.debug) updateDebugPanel({ include, exclude, orGroups });
  }

  function updateDebugPanel({ include, exclude, orGroups }) {
    let box = document.getElementById('merus-debug-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'merus-debug-box';
      box.style = 'position:fixed;bottom:0;right:0;background:#fff;border:1px solid #aaa;padding:8px;font-size:12px;z-index:9999;max-width:250px;overflow:auto;box-shadow:0 0 5px rgba(0,0,0,0.3)';
      document.body.appendChild(box);
    }
    box.innerHTML = `<b>Filter Summary:</b><br>
      <b>Include:</b> ${include.join(', ') || '(none)'}<br>
      <b>Exclude:</b> ${exclude.join(', ') || '(none)'}<br>
      <b>OR Groups:</b> ${orGroups.map(g => '(' + g.join(' OR ') + ')').join(' ') || '(none)'}`;
  }

  function initUI() {
    const input = document.querySelector(SELECTORS.searchInput);
    if (!input) return;

    const toggle = document.createElement('button');
    toggle.textContent = '🔘 Enhanced Search';
    toggle.style = 'margin-left:5px; padding:2px 6px; font-size:12px;';
    toggle.onclick = () => {
      enhancedEnabled = !enhancedEnabled;
      toggle.style.background = enhancedEnabled ? '#cfc' : '#fcc';
      applyFilters(enhancedEnabled ? input.value : '');
    };
    input.parentElement.appendChild(toggle);

    input.value = lastQuery;
    input.dispatchEvent(new Event('input'));
  }

  let debounceTimer = null;
  function bindInput() {
    const input = document.querySelector(SELECTORS.searchInput);
    if (!input) return;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (enhancedEnabled) {
          const query = input.value;
          localStorage.setItem('merus_enhanced_query', query);
          applyFilters(query);
        }
      }, CONFIG.debounceDelay);
    });
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(SELECTORS.searchInput)) {
      observer.disconnect();
      initUI();
      bindInput();
      if (lastQuery && enhancedEnabled) applyFilters(lastQuery);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
