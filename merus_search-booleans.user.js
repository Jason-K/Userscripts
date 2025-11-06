// ==UserScript==
// @name         MerusCase Enhanced Boolean Search (Robust)
// @version      2.6 - MutationObservers disabled to prevent rate limiting
// @author       Jason K.
// @description  Robust boolean search for MerusCase Activity View - handles navigation and persistence
// @namespace    http://tampermonkey.net/
// @match        https://*.meruscase.com/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_search-booleans.user.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_search-booleans.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        caseInsensitive: true,
        debounceDelay: 300,
        debug: false, // Reduced logging to minimize overhead
        highlightColor: '#ffeb3b',
        excludeColor: '#f44336',
        checkInterval: 30000, // Check every 30 seconds (increased from 10s to prevent 429 errors)
        reinitDelay: 5000     // Wait 5 seconds before reinitializing (increased from 2s)
    };

    const SELECTORS = {
        searchInput: 'input[name="data[Search][q]"]',
        searchInputAlt: 'input[type="text"][placeholder*="earch"], input[type="search"]', // Fallback selector
        tableContainer: '.table-container',
        tableRow: 'tr[data-id]',
        descriptionCell: 'td[data-merus-help-id="activities-description"]',
        controlsContainer: '.table-controls',
        paginationStats: '.pagination-stats .index-stats'
    };

    let debounceTimer = null;
    let enhancedEnabled = true;
    let originalRowCount = 0;
    let filteredRowCount = 0;
    let toggleButton = null;
    let filterBadge = null;

    // Enhanced state management
    let isInitialized = false;
    let isInitializing = false;
    let initializationObserver = null;
    let persistenceChecker = null;
    let currentUrl = location.href;

    // Store reference to current search input for persistence checking
    let currentSearchInput = null;

    // Enhanced query parsing with proper boolean logic
    function parseQuery(input) {
        if (!input || !input.trim()) {
            return { include: [], exclude: [], orGroups: [], rawQuery: '' };
        }

        const rawQuery = input.trim();
        if (CONFIG.debug) console.log('Parsing query:', rawQuery);

        let normalized = CONFIG.caseInsensitive ? rawQuery.toLowerCase() : rawQuery;

        // Split on spaces but preserve quoted strings and handle operators properly
        const tokens = normalized.match(/(?:"[^"]*"|[^\s"]+)/g) || [];
        if (CONFIG.debug) console.log('Initial tokens:', tokens);

        const include = [];
        const exclude = [];
        const orGroups = [];

        let i = 0;
        while (i < tokens.length) {
            let token = tokens[i].replace(/"/g, ''); // Remove quotes

            // Skip empty tokens
            if (!token) {
                i++;
                continue;
            }

            // Handle NOT operator (must be followed by a term)
            if (token.toLowerCase() === 'not' && i + 1 < tokens.length) {
                const nextToken = tokens[i + 1].replace(/"/g, '');
                if (nextToken) {
                    exclude.push(nextToken);
                    console.log('Added to exclude via NOT:', nextToken);
                }
                i += 2;
                continue;
            }

            // Handle exclusion with minus prefix - this is the key fix
            if (token.startsWith('-') && token.length > 1) {
                const excludeTerm = token.substring(1);
                if (excludeTerm) { // Make sure it's not just a dash
                    exclude.push(excludeTerm);
                    console.log('Added to exclude via -:', excludeTerm);
                }
                i++;
                continue;
            }

            // Handle inclusion with plus prefix (optional, just means include)
            if (token.startsWith('+') && token.length > 1) {
                const includeTerm = token.substring(1);
                if (includeTerm) {
                    include.push(includeTerm);
                    console.log('Added to include via +:', includeTerm);
                }
                i++;
                continue;
            }

            // Handle OR groups - look ahead for OR
            if (i + 2 < tokens.length && tokens[i + 1].toLowerCase() === 'or') {
                const orGroup = [token];
                i += 2; // Skip 'or'
                const nextToken = tokens[i].replace(/"/g, '');
                if (nextToken) {
                    orGroup.push(nextToken);
                }

                // Continue collecting OR terms
                while (i + 2 < tokens.length && tokens[i + 1].toLowerCase() === 'or') {
                    i += 2;
                    const orToken = tokens[i].replace(/"/g, '');
                    if (orToken) {
                        orGroup.push(orToken);
                    }
                }

                if (orGroup.length > 1) {
                    orGroups.push(orGroup);
                    console.log('Added OR group:', orGroup);
                }
                i++;
                continue;
            }

            // Skip standalone 'or' tokens (should be handled above)
            if (token.toLowerCase() === 'or') {
                i++;
                continue;
            }

            // Regular include term (default behavior)
            if (token && token !== '-' && token !== '+') {
                include.push(token);
                console.log('Added to include:', token);
            }
            i++;
        }

        const result = { include, exclude, orGroups, rawQuery };
        if (CONFIG.debug) console.log('Final parsed query result:', result);
        return result;
    }

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
            console.log('No description cell found for row');
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

        if (CONFIG.debug) {
            console.log(`Starting filter with ${allRows.length} rows`);
            console.log('Include terms:', include);
            console.log('Exclude terms:', exclude);
            console.log('OR groups:', orGroups);
        }

        originalRowCount = allRows.length;
        filteredRowCount = 0;

        allRows.forEach((row, index) => {
            const { text, originalText, cell } = getDescriptionText(row);

            if (!cell) {
                // Hide rows without description cells
                row.style.visibility = 'hidden';
                row.style.height = '0px';
                row.style.opacity = '0';
                row.style.display = 'none';
                row.style.position = 'absolute';
                row.style.top = '-9999px';
                row.classList.add('merus-hidden');
                console.log(`Row ${index}: NO DESCRIPTION CELL - HIDDEN`);
                return;
            }

            let shouldShow = true;

            // Step 1: Check include terms (ALL must match)
            if (include.length > 0) {
                shouldShow = include.every(term => {
                    const matches = text.includes(term);
                    console.log(`Row ${index}: Include check "${term}" in "${text.substring(0, 50)}...": ${matches}`);
                    return matches;
                });
                console.log(`Row ${index}: Include result: ${shouldShow}`);
            }

            // Step 2: Check exclude terms (NONE should match) - only if still showing
            if (shouldShow && exclude.length > 0) {
                const hasExcluded = exclude.some(term => {
                    const matches = text.includes(term);
                    console.log(`Row ${index}: Exclude check "${term}" in "${text.substring(0, 50)}...": ${matches}`);
                    return matches;
                });
                shouldShow = !hasExcluded; // Show if NO excluded terms are found
                console.log(`Row ${index}: Exclude check result - hasExcluded: ${hasExcluded}, shouldShow: ${shouldShow}`);
            }

            // Step 3: Check OR groups (at least ONE group must have a match) - only if still showing
            if (shouldShow && orGroups.length > 0) {
                shouldShow = orGroups.some(group => {
                    const groupMatch = group.some(term => {
                        const matches = text.includes(term);
                        console.log(`Row ${index}: OR group term "${term}" in "${text.substring(0, 50)}...": ${matches}`);
                        return matches;
                    });
                    console.log(`Row ${index}: OR group ${group.join(' OR ')} result: ${groupMatch}`);
                    return groupMatch;
                });
                console.log(`Row ${index}: Final OR result: ${shouldShow}`);
            }

            // Apply visibility using ultra-aggressive hiding methods
            if (shouldShow) {
                // Reset all hiding methods and classes
                row.style.visibility = '';
                row.style.height = '';
                row.style.opacity = '';
                row.style.display = '';
                row.style.position = '';
                row.style.top = '';
                row.style.left = '';
                row.style.width = '';
                row.style.minHeight = '';
                row.style.maxHeight = '';
                row.style.minWidth = '';
                row.style.maxWidth = '';
                row.style.margin = '';
                row.style.padding = '';
                row.style.border = '';
                row.style.zIndex = '';
                row.style.pointerEvents = '';
                row.classList.remove('merus-hidden', 'merus-filtered-out');
                filteredRowCount++;

                const allTerms = [...include, ...orGroups.flat()].filter(term => term && term.length > 0);
                if (allTerms.length > 0) {
                    highlightText(cell, allTerms);
                }

                console.log(`Row ${index}: SHOWN - "${originalText}"`);
            } else {
                // Use dual approach: aggressive CSS class + inline styles
                row.classList.add('merus-hidden');
                row.classList.add('merus-filtered-out');

                // Also set inline styles as backup
                row.style.visibility = 'hidden';
                row.style.height = '0px';
                row.style.opacity = '0';
                row.style.display = 'none';
                row.style.position = 'absolute';
                row.style.top = '-10000px';
                row.style.left = '-10000px';
                row.style.width = '0px';
                row.style.minHeight = '0px';
                row.style.maxHeight = '0px';
                row.style.overflow = 'hidden';
                row.style.zIndex = '-1000';
                row.style.pointerEvents = 'none';

                if (cell) {
                    cell.innerHTML = originalText;
                }

                console.log(`Row ${index}: HIDDEN with ultra-aggressive styles - "${originalText}"`);
            }
        });

        if (CONFIG.debug) console.log(`Filter results: ${filteredRowCount} of ${originalRowCount} rows shown`);
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

        // Show the original query being processed
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

            // Check if we have very few rows (indicating native search limitation)
            const allRows = document.querySelectorAll(SELECTORS.tableRow);
            if (allRows.length < 10) {
                summary += `<span style="color:red; font-size:0.8em;"><b>⚠️ Warning:</b> Only ${allRows.length} rows available. Native search may have pre-filtered results. Try searching "${include.join(' ')}" first.</span>`;
            }
        }

        if (summary) {
            filterBadge.innerHTML = `<b>Enhanced Boolean Search:</b><br>${summary}`;
            filterBadge.style.display = 'block';
        } else {
            filterBadge.style.display = 'none';
        }
    }

    // Enhanced search input detection
    function findSearchInput() {
        // Try primary selector first
        let searchInput = document.querySelector(SELECTORS.searchInput);

        // If not found, try alternative selector
        if (!searchInput) {
            const candidates = document.querySelectorAll(SELECTORS.searchInputAlt);
            if (candidates.length > 0) {
                // Find the most likely search input
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

        // Store reference for persistence checking
        currentSearchInput = searchInput;

        // Clean up any existing elements
        const existingToggle = document.getElementById('chatgpt-boolean-toggle');
        const existingBadge = document.getElementById('chatgpt-boolean-badge');
        if (existingToggle) {
            existingToggle.remove();
            toggleButton = null;
        }
        if (existingBadge) {
            existingBadge.remove();
            filterBadge = null;
        }

        // Create toggle button
        if (!toggleButton) {
            toggleButton = document.createElement('button');
            toggleButton.id = 'chatgpt-boolean-toggle';
            toggleButton.textContent = '[Toggle Enhanced Search]';
            toggleButton.style.cssText = `
                margin-left: 10px;
                padding: 3px 6px;
                font-size: 0.8em;
                background-color: #4caf50;
                color: white;
                border: 1px solid #388e3c;
                border-radius: 3px;
                cursor: pointer;
                white-space: nowrap;
                display: inline-block;
                position: relative;
                z-index: 1000;
            `;

            toggleButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                enhancedEnabled = !enhancedEnabled;
                localStorage.setItem('merus_enhanced_enabled', enhancedEnabled);
                if (CONFIG.debug) console.log('Enhanced mode toggled:', enhancedEnabled);

                if (enhancedEnabled) {
                    applyFilters(searchInput.value);
                } else {
                    clearFilters();
                }
            });

            // Find stable insertion point
            const inputGroup = searchInput.closest('.input-group');
            const formGroup = searchInput.closest('.form-group');

            if (inputGroup && inputGroup.parentNode) {
                inputGroup.parentNode.insertBefore(toggleButton, inputGroup.nextSibling);
            } else if (formGroup && formGroup.parentNode) {
                formGroup.parentNode.insertBefore(toggleButton, formGroup.nextSibling);
            } else {
                // Fallback: append after search input
                if (searchInput.parentNode) {
                    searchInput.parentNode.insertBefore(toggleButton, searchInput.nextSibling);
                }
            }
        }

        // Create filter badge
        if (!filterBadge) {
            filterBadge = document.createElement('div');
            filterBadge.id = 'chatgpt-boolean-badge';
            filterBadge.style.cssText = `
                margin-top: 5px;
                padding: 6px;
                background: #eeeeee;
                border: 1px solid #aaaaaa;
                border-radius: 4px;
                font-size: 0.9em;
                display: none;
                width: auto;
                max-width: 500px;
                position: relative;
                z-index: 999;
                word-wrap: break-word;
                box-sizing: border-box;
                min-width: 200px;
            `;

            if (toggleButton && toggleButton.parentNode) {
                toggleButton.parentNode.insertBefore(filterBadge, toggleButton.nextSibling);
            }
        }

        // Restore saved state (enhanced mode only, not search queries)
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
            // Reset all hiding methods
            row.style.visibility = '';
            row.style.height = '';
            row.style.opacity = '';
            row.style.display = '';
            row.style.position = '';
            row.style.top = '';
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

    function setupEventListeners() {
        const searchInput = findSearchInput();
        if (!searchInput) return false;

        // Remove any existing listeners to prevent duplicates
        searchInput.removeEventListener('input', handleSearchInput);

        // Add input event listener with debouncing
        searchInput.addEventListener('input', handleSearchInput);

        return true;
    }

    function handleSearchInput(e) {
        const query = e.target.value;

        // Debug logging
        if (CONFIG.debug) console.log('handleSearchInput called with:', query);

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (enhancedEnabled) {
                if (query.trim()) {
                    // Check if the query has exclusions that might be limited by native search
                    const { include, exclude, orGroups } = parseQuery(query);
                    if (CONFIG.debug && exclude.length > 0) {
                        console.warn('Notice: Query contains exclusions. MerusCase native search may limit results.');
                        console.log('Full query being processed:', query);
                        console.log('Include terms:', include);
                        console.log('Exclude terms:', exclude);
                    }

                    applyFilters(query);
                } else {
                    clearFilters();
                }
            }
        }, CONFIG.debounceDelay);
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

            #chatgpt-boolean-badge {
                box-sizing: border-box;
                min-width: 200px;
            }

            /* Ultra-aggressive hiding for filtered rows */
            .merus-hidden {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0px !important;
                min-height: 0px !important;
                max-height: 0px !important;
                overflow: hidden !important;
                position: absolute !important;
                top: -10000px !important;
                left: -10000px !important;
                width: 0px !important;
                min-width: 0px !important;
                max-width: 0px !important;
                margin: 0px !important;
                padding: 0px !important;
                border: none !important;
                z-index: -1000 !important;
                pointer-events: none !important;
            }

            /* Alternative approach - completely remove from layout */
            .merus-filtered-out {
                display: none !important;
            }
        `;
        document.head.appendChild(styles);
    }

    function initialize() {
        if (isInitialized) {
            if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search already initialized, skipping...');
            return true;
        }

        if (isInitializing) {
            if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search currently initializing, skipping...');
            return false;
        }

        const searchInput = findSearchInput();
        if (!searchInput) {
            if (CONFIG.debug) console.log('MerusCase search input not found, retrying...');
            return false;
        }

        if (CONFIG.debug) console.log('Initializing MerusCase Enhanced Boolean Search v2.4...');

        isInitializing = true;

        addStyles();

        if (!initializeUI()) {
            if (CONFIG.debug) console.log('Failed to initialize UI');
            isInitializing = false;
            return false;
        }

        if (!setupEventListeners()) {
            if (CONFIG.debug) console.log('Failed to setup event listeners');
            isInitializing = false;
            return false;
        }

        // Apply saved query if exists and enhanced mode is enabled (removed - no query persistence)
        if (enhancedEnabled && searchInput.value.trim()) {
            if (CONFIG.debug) console.log('Processing existing query in search box:', searchInput.value);
            applyFilters(searchInput.value);
        }

        isInitialized = true;
        isInitializing = false;

        // Stop the initialization observer since we're done
        if (initializationObserver) {
            initializationObserver.disconnect();
            initializationObserver = null;
        }

        // Start persistence checker
        startPersistenceChecker();

        if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search initialized successfully!');
        return true;
    }

    // Enhanced persistence checker - DISABLED to prevent rate limiting
    let reinitDebounce = null;
    function startPersistenceChecker() {
        // PERSISTENCE CHECKING DISABLED - causes rate limiting
        // If UI elements disappear, user can refresh the page
        if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search: Persistence checker DISABLED to prevent rate limiting');
    }

    function setupInitialization() {
        // Try immediate initialization
        if (initialize()) {
            return;
        }

        // NO MutationObserver - causes rate limiting
        // Instead, retry initialization with exponential backoff
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelays = [1000, 2000, 4000, 8000, 16000]; // 1s, 2s, 4s, 8s, 16s

        function retryInit() {
            if (retryCount >= maxRetries) {
                if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search: Max retries reached');
                return;
            }

            setTimeout(() => {
                if (!isInitialized && !isInitializing) {
                    const searchInput = findSearchInput();
                    if (searchInput) {
                        if (CONFIG.debug) console.log('Search input found on retry, attempting initialization...');
                        initialize();
                    } else {
                        retryCount++;
                        retryInit();
                    }
                }
            }, retryDelays[retryCount]);
        }

        retryInit();

        if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search: Will retry initialization with backoff...');
    }

    // Navigation handling using native events instead of polling
    let navigationDebounce = null;
    function handleNavigation() {
        const newUrl = location.href;
        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            if (CONFIG.debug) console.log('MerusCase Enhanced Boolean Search: Navigation detected, resetting...');

            // Debounce navigation handling
            if (navigationDebounce) {
                clearTimeout(navigationDebounce);
            }

            navigationDebounce = setTimeout(() => {
                // Stop persistence checker
                if (persistenceChecker) {
                    clearInterval(persistenceChecker);
                    persistenceChecker = null;
                }

                // Disconnect observers to prevent memory leaks
                if (initializationObserver) {
                    initializationObserver.disconnect();
                    initializationObserver = null;
                }

                // Reset state
                isInitialized = false;
                isInitializing = false;
                toggleButton = null;
                filterBadge = null;
                currentSearchInput = null;

                // Clean up existing elements
                const existingToggle = document.getElementById('chatgpt-boolean-toggle');
                const existingBadge = document.getElementById('chatgpt-boolean-badge');
                if (existingToggle) existingToggle.remove();
                if (existingBadge) existingBadge.remove();

                // Reinitialize after delay
                setupInitialization();
                navigationDebounce = null;
            }, CONFIG.reinitDelay);
        }
    }

    // Use native popstate and hashchange events instead of polling
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);
    // NO interval polling - causes rate limiting

    // Cleanup on page unload and visibility changes
    window.addEventListener('beforeunload', () => {
        if (persistenceChecker) {
            clearInterval(persistenceChecker);
            persistenceChecker = null;
        }
        if (initializationObserver) {
            initializationObserver.disconnect();
            initializationObserver = null;
        }
    });

    // Pause checking when page is hidden to reduce resource usage
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Stop persistence checker when tab is hidden
            if (persistenceChecker) {
                clearInterval(persistenceChecker);
                persistenceChecker = null;
            }
        } else {
            // Resume when tab becomes visible
            if (isInitialized && !persistenceChecker) {
                startPersistenceChecker();
            }
        }
    });

    // Start the initialization process
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(setupInitialization, 500);
        });
    } else {
        setupInitialization();
    }

})();
