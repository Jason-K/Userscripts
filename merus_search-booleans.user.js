// ==UserScript==
// @name         MerusCase Enhanced Boolean Search (Refactored)
// @version      3.0.0
// @author       Jason K.
// @description  Enhanced boolean search for MerusCase using MerusCore for better performance and UI consistency
// @namespace    https://github.com/Jason-K
// @match        https://*.meruscase.com/*
// @grant        none
// @run-at       document-idle
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_search-booleans.user.js
// @downloadURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_search-booleans.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Initialize script using MerusCore
    const script = MerusCore.createScript({
        name: 'EnhancedSearch',
        version: '3.0.0'
    });

    script.init(() => {
        if (!MerusCore.utils.isMerusCase()) return;

        console.log('MerusCase Enhanced Boolean Search initialized with MerusCore');

        const CONFIG = {
            caseInsensitive: true,
            debounceDelay: 500, // Increased for MerusCore coordination
            debug: false,
            highlightColor: '#ffeb3b',
            excludeColor: '#f44336'
        };

        // Use MerusCore DOM selectors
        const SELECTORS = {
            searchInput: 'input[name="data[Search][q]"]',
            searchInputAlt: 'input[type="text"][placeholder*="earch"], input[type="search"]',
            tableRow: 'tr[data-id]',
            descriptionCell: 'td[data-merus-help-id="activities-description"]',
            paginationStats: '.pagination-stats .index-stats'
        };

        // State management
        let enhancedEnabled = true;
        let originalRowCount = 0;
        let filteredRowCount = 0;
        let toggleButton = null;
        let filterBadge = null;
        let isInitialized = false;
        let currentSearchInput = null;

        // Enhanced query parsing using MerusCore text utilities
        function parseQuery(input) {
            if (!input || !input.trim()) {
                return { include: [], exclude: [], orGroups: [], rawQuery: '' };
            }

            const rawQuery = input.trim();
            if (CONFIG.debug) console.log('Parsing query:', rawQuery);

            const normalized = CONFIG.caseInsensitive ? rawQuery.toLowerCase() : rawQuery;
            const tokens = normalized.match(/(?:"[^"]*"|[^\s"]+)/g) || [];

            const include = [];
            const exclude = [];
            const orGroups = [];

            let i = 0;
            while (i < tokens.length) {
                let token = tokens[i].replace(/"/g, '');

                if (!token) {
                    i++;
                    continue;
                }

                // Handle NOT operator
                if (token.toLowerCase() === 'not' && i + 1 < tokens.length) {
                    exclude.push(tokens[i + 1].replace(/"/g, ''));
                    i += 2;
                    continue;
                }

                // Handle exclusion with minus prefix
                if (token.startsWith('-') && token.length > 1) {
                    exclude.push(token.substring(1));
                    i++;
                    continue;
                }

                // Handle inclusion with plus prefix
                if (token.startsWith('+') && token.length > 1) {
                    include.push(token.substring(1));
                    i++;
                    continue;
                }

                // Handle OR groups
                if (i + 2 < tokens.length && tokens[i + 1].toLowerCase() === 'or') {
                    const orGroup = [token];
                    i += 2;
                    orGroup.push(tokens[i].replace(/"/g, ''));

                    while (i + 2 < tokens.length && tokens[i + 1].toLowerCase() === 'or') {
                        i += 2;
                        orGroup.push(tokens[i].replace(/"/g, ''));
                    }

                    if (orGroup.length > 1) {
                        orGroups.push(orGroup);
                    }
                    i++;
                    continue;
                }

                if (token.toLowerCase() === 'or') {
                    i++;
                    continue;
                }

                // Regular include term
                if (token && token !== '-' && token !== '+') {
                    include.push(token);
                }
                i++;
            }

            return { include, exclude, orGroups, rawQuery };
        }

        // Highlight text using MerusCore text utilities
        function highlightText(element, terms, className = 'merus-highlight') {
            if (!element || !terms.length) return;

            const originalText = element.textContent;
            let html = element.innerHTML;

            html = html.replace(/<mark[^>]*class="[^"]*merus-[^"]*"[^>]*>(.*?)<\/mark>/gi, '$1');

            terms.forEach(term => {
                if (term && term.length > 0) {
                    const regex = new RegExp(`(${escapeRegExp(term)})`, CONFIG.caseInsensitive ? 'gi' : 'g');
                    html = html.replace(regex, `<mark class="${className}">$1</mark>`);
                }
            });

            element.innerHTML = html;
        }

        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function getDescriptionText(row) {
            const descCell = row.querySelector(SELECTORS.descriptionCell);
            if (!descCell) {
                return { text: '', cell: null };
            }

            const text = descCell.textContent.trim();
            const normalizedText = CONFIG.caseInsensitive ? text.toLowerCase() : text;

            return {
                text: normalizedText,
                originalText: text,
                cell: descCell
            };
        }

        function applyFilters(query) {
            if (CONFIG.debug) console.log('Applying filters for query:', query);

            const { include, exclude, orGroups } = parseQuery(query);
            const allRows = document.querySelectorAll(SELECTORS.tableRow);

            if (allRows.length === 0) {
                if (CONFIG.debug) console.log('No rows found to filter');
                return;
            }

            originalRowCount = allRows.length;
            filteredRowCount = 0;

            allRows.forEach((row, index) => {
                const { text, originalText, cell } = getDescriptionText(row);

                if (!cell) {
                    row.style.display = 'none';
                    row.classList.add('merus-hidden');
                    return;
                }

                let shouldShow = true;

                // Check include terms
                if (include.length > 0) {
                    shouldShow = include.every(term => text.includes(term));
                }

                // Check exclude terms
                if (shouldShow && exclude.length > 0) {
                    shouldShow = !exclude.some(term => text.includes(term));
                }

                // Check OR groups
                if (shouldShow && orGroups.length > 0) {
                    shouldShow = orGroups.some(group =>
                        group.some(term => text.includes(term))
                    );
                }

                // Apply visibility using MerusCore text utilities
                if (shouldShow) {
                    row.style.display = '';
                    row.classList.remove('merus-hidden');
                    filteredRowCount++;

                    const allTerms = [...include, ...orGroups.flat()].filter(term => term && term.length > 0);
                    if (allTerms.length > 0) {
                        highlightText(cell, allTerms);
                    }
                } else {
                    row.style.display = 'none';
                    row.classList.add('merus-hidden');
                    if (cell) {
                        cell.innerHTML = originalText;
                    }
                }
            });

            updateUI(query, { include, exclude, orGroups });
            updateStats();
        }

        function updateStats() {
            const statsElement = document.querySelector(SELECTORS.paginationStats);
            if (statsElement && enhancedEnabled) {
                if (filteredRowCount !== originalRowCount) {
                    statsElement.textContent = `${filteredRowCount} of ${originalRowCount} Items (Filtered)`;
                    statsElement.style.backgroundColor = '#4caf50';
                    statsElement.style.color = 'white';
                    statsElement.style.padding = '2px 6px';
                    statsElement.style.borderRadius = '3px';
                } else {
                    statsElement.style.backgroundColor = '';
                    statsElement.style.color = '';
                    statsElement.style.padding = '';
                    statsElement.style.borderRadius = '';
                }
            }
        }

        function updateUI(query, parsedQuery) {
            if (toggleButton) {
                toggleButton.style.backgroundColor = enhancedEnabled ? '#4caf50' : '#f44336';
                toggleButton.style.color = 'white';
            }

            updateFilterBadge(parsedQuery);
        }

        function updateFilterBadge(parsedQuery) {
            if (!filterBadge) return;

            const { include, exclude, orGroups, rawQuery } = parsedQuery;
            let summary = '';

            if (rawQuery) {
                summary += `<span style="color:black"><b>Processing:</b> "${rawQuery}"</span><br>`;
            }

            if (include.length > 0) {
                summary += `<span style="color:green"><b>Include:</b> ${include.join(', ')}</span><br>`;
            }
            if (orGroups.length > 0) {
                summary += `<span style="color:blue"><b>OR:</b> ${orGroups.map(g => '(' + g.join(' OR ') + ')').join(' ')}</span><br>`;
            }
            if (exclude.length > 0) {
                summary += `<span style="color:red"><b>Exclude:</b> ${exclude.join(', ')}</span><br>`;
            }

            if (summary) {
                filterBadge.innerHTML = `<b>Enhanced Boolean Search:</b><br>${summary}`;
                filterBadge.style.display = 'block';
            } else {
                filterBadge.style.display = 'none';
            }
        }

        // Enhanced search input detection using MerusCore utilities
        function findSearchInput() {
            let searchInput = document.querySelector(SELECTORS.searchInput);

            if (!searchInput) {
                const candidates = document.querySelectorAll(SELECTORS.searchInputAlt);
                if (candidates.length > 0) {
                    searchInput = Array.from(candidates).find(input =>
                        input.placeholder?.toLowerCase().includes('search') ||
                        input.name?.toLowerCase().includes('search') ||
                        input.closest('.search, .filter, .table-controls')
                    ) || candidates[0];
                }
            }

            return searchInput;
        }

        function initializeUI() {
            const searchInput = findSearchInput();

            if (!searchInput) {
                if (CONFIG.debug) console.log('Search input not found');
                return false;
            }

            currentSearchInput = searchInput;

            // Clean up existing elements
            const existingToggle = document.getElementById('merus-boolean-toggle');
            const existingBadge = document.getElementById('merus-boolean-badge');
            if (existingToggle) {
                existingToggle.remove();
                toggleButton = null;
            }
            if (existingBadge) {
                existingBadge.remove();
                filterBadge = null;
            }

            // Create toggle button using MerusCore UI system
            if (!toggleButton) {
                toggleButton = MerusCore.ui.createButton({
                    text: '🔍 Enhanced',
                    position: 'top-right',
                    style: 'info',
                    className: 'merus-boolean-toggle'
                });

                toggleButton.element.id = 'merus-boolean-toggle';
                toggleButton.element.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    enhancedEnabled = !enhancedEnabled;
                    localStorage.setItem('merus_enhanced_enabled', enhancedEnabled);

                    if (CONFIG.debug) console.log('Enhanced mode toggled:', enhancedEnabled);

                    if (enhancedEnabled) {
                        MerusCore.ui.showToast('Enhanced search enabled', 'success', 2000);
                        applyFilters(searchInput.value);
                    } else {
                        MerusCore.ui.showToast('Enhanced search disabled', 'info', 2000);
                        clearFilters();
                    }
                });

                // Position near search input
                const searchParent = searchInput.closest('.input-group, .form-group');
                if (searchParent && searchParent.parentNode) {
                    searchParent.parentNode.insertBefore(toggleButton.element, searchParent.nextSibling);
                } else if (searchInput.parentNode) {
                    searchInput.parentNode.insertBefore(toggleButton.element, searchInput.nextSibling);
                }
            }

            // Create filter badge using MerusCore UI system
            if (!filterBadge) {
                filterBadge = document.createElement('div');
                filterBadge.id = 'merus-boolean-badge';
                filterBadge.style.cssText = `
                    margin-top: 5px;
                    padding: 6px;
                    background: #eeeeee;
                    border: 1px solid #aaaaaa;
                    border-radius: 4px;
                    font-size: 0.9em;
                    display: none;
                    max-width: 500px;
                    word-wrap: break-word;
                    min-width: 200px;
                `;

                if (toggleButton && toggleButton.element.parentNode) {
                    toggleButton.element.parentNode.insertBefore(filterBadge, toggleButton.element.nextSibling);
                }
            }

            // Restore saved state
            const savedEnabled = localStorage.getItem('merus_enhanced_enabled');
            if (savedEnabled !== null) {
                enhancedEnabled = savedEnabled === 'true';
            }

            if (CONFIG.debug) console.log('UI initialized successfully');
            return true;
        }

        function clearFilters() {
            if (CONFIG.debug) console.log('Clearing all filters');
            const allRows = document.querySelectorAll(SELECTORS.tableRow);
            allRows.forEach(row => {
                row.style.display = '';
                row.classList.remove('merus-hidden');

                const descCell = row.querySelector(SELECTORS.descriptionCell);
                if (descCell) {
                    const originalText = descCell.textContent;
                    descCell.innerHTML = originalText;
                }
            });

            const statsElement = document.querySelector(SELECTORS.paginationStats);
            if (statsElement) {
                statsElement.style.backgroundColor = '';
                statsElement.style.color = '';
                statsElement.style.padding = '';
                statsElement.style.borderRadius = '';
            }

            if (filterBadge) {
                filterBadge.style.display = 'none';
            }

            filteredRowCount = allRows.length;
        }

        // Setup event listeners with MerusCore coordination
        function setupEventListeners() {
            const searchInput = findSearchInput();
            if (!searchInput) return false;

            // Use MerusCore debouncing for better coordination
            const debouncedHandler = MerusCore.observer.debounce((e) => {
                const query = e.target.value;

                if (CONFIG.debug) console.log('handleSearchInput called with:', query);

                if (enhancedEnabled) {
                    if (query.trim()) {
                        const { include, exclude, orGroups } = parseQuery(query);
                        if (CONFIG.debug && exclude.length > 0) {
                            console.warn('Notice: Query contains exclusions. MerusCase native search may limit results.');
                        }
                        applyFilters(query);
                    } else {
                        clearFilters();
                    }
                }
            }, CONFIG.debounceDelay);

            searchInput.addEventListener('input', debouncedHandler);

            // Add cleanup
            script.addCleanup(() => {
                searchInput.removeEventListener('input', debouncedHandler);
            });

            return true;
        }

        function addStyles() {
            if (document.getElementById('merus-enhanced-styles')) return;

            const styles = document.createElement('style');
            styles.id = 'merus-enhanced-styles';
            styles.textContent = `
                .merus-highlight {
                    background-color: ${CONFIG.highlightColor} !important;
                    font-weight: bold;
                    padding: 1px 2px;
                    border-radius: 2px;
                }

                .merus-exclude-highlight {
                    background-color: ${CONFIG.excludeColor} !important;
                    color: white;
                    font-weight: bold;
                    padding: 1px 2px;
                    border-radius: 2px;
                }

                #merus-boolean-badge {
                    box-sizing: border-box;
                    min-width: 200px;
                }

                .merus-hidden {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                }
            `;
            document.head.appendChild(styles);
        }

        // Initialize the enhanced search functionality
        function initialize() {
            if (isInitialized) {
                if (CONFIG.debug) console.log('Already initialized, skipping...');
                return true;
            }

            const searchInput = findSearchInput();
            if (!searchInput) {
                if (CONFIG.debug) console.log('Search input not found, will retry...');
                return false;
            }

            if (CONFIG.debug) console.log('Initializing Enhanced Boolean Search...');

            addStyles();

            if (!initializeUI()) {
                if (CONFIG.debug) console.log('Failed to initialize UI');
                return false;
            }

            if (!setupEventListeners()) {
                if (CONFIG.debug) console.log('Failed to setup event listeners');
                return false;
            }

            // Apply filters to existing search if enabled
            if (enhancedEnabled && searchInput.value.trim()) {
                if (CONFIG.debug) console.log('Processing existing query:', searchInput.value);
                applyFilters(searchInput.value);
            }

            isInitialized = true;

            if (CONFIG.debug) console.log('Enhanced Boolean Search initialized successfully!');

            // Send message to other scripts about initialization
            MerusCore.messaging.emit('enhanced-search-initialized', {
                version: '3.0.0',
                timestamp: Date.now()
            });

            return true;
        }

        // Use MerusCore Cloudflare-safe observer for search input detection
        const observer = MerusCore.observer.createSafeObserver(() => {
            if (!isInitialized) {
                const searchInput = findSearchInput();
                if (searchInput) {
                    if (CONFIG.debug) console.log('Search input detected via observer, attempting initialization...');
                    initialize();
                }
            }
        }, {
            delay: 5000,
            maxRetries: 5,
            autoDisconnect: 30000
        });

        // Immediate initialization attempt
        initialize();

        // Add cleanup
        script.addCleanup(() => {
            if (toggleButton) toggleButton.remove();
            if (filterBadge) filterBadge.remove();
            observer.disconnect();
        });

        // Expose functions for debugging using MerusCore messaging
        MerusCore.messaging.on('debug-enhanced-search', (event) => {
            const { action, data } = event.data;
            switch (action) {
                case 'parse-query':
                    const result = parseQuery(data.query);
                    console.log('Enhanced Search - Parsed query:', result);
                    break;
                case 'apply-filters':
                    applyFilters(data.query);
                    break;
                case 'clear-filters':
                    clearFilters();
                    break;
                case 'toggle-enhanced':
                    enhancedEnabled = !enhancedEnabled;
                    console.log('Enhanced Search - Toggled:', enhancedEnabled);
                    break;
            }
        });

        // Expose functions for debugging via global object
        window.merusEnhancedSearch = {
            parseQuery: parseQuery,
            applyFilters: applyFilters,
            clearFilters: clearFilters,
            toggleEnhanced: () => {
                enhancedEnabled = !enhancedEnabled;
                return enhancedEnabled;
            }
        };
    });

})();