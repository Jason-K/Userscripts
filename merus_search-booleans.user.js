// ==UserScript==
// @name         MerusCase Enhanced Boolean Search
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds AND, OR, NOT, +, and - logic to MerusCase Activity View search with enhanced filtering
// @author       You
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
        debug: true,
        storageKey: 'merus_enhanced_query',
        highlightColor: '#ffeb3b',
        excludeColor: '#f44336'
    };

    const SELECTORS = {
        searchInput: 'input[name="data[Search][q]"]',
        tableContainer: '.table-container',
        tableRow: 'tr[data-id]',
        descriptionCell: 'td[data-merus-help-id="activities-description"]',
        userCell: 'td[data-merus-help-id="activities-user"]',
        tagCell: 'td[data-merus-help-id="activities-type"]',
        dateCell: 'td[data-merus-help-id="activities-date"]',
        controlsContainer: '.table-controls',
        paginationStats: '.pagination-stats .index-stats'
    };

    let debounceTimer = null;
    let enhancedEnabled = true;
    let originalRowCount = 0;
    let filteredRowCount = 0;
    let toggleButton = null;
    let filterBadge = null;

    // Enhanced query parsing with better boolean logic
    function parseQuery(input) {
        if (!input || !input.trim()) {
            return { include: [], exclude: [], orGroups: [], notTerms: [] };
        }

        // Normalize the input
        const normalized = input.toLowerCase().trim();
        
        // Split on major operators while preserving quotes
        const tokens = normalized.match(/(?:"[^"]*"|[^\s"]+)/g) || [];
        
        const include = [];
        const exclude = [];
        const orGroups = [];
        const notTerms = [];
        
        let i = 0;
        while (i < tokens.length) {
            let token = tokens[i].replace(/"/g, ''); // Remove quotes
            
            // Handle NOT operator
            if (token === 'not' && i + 1 < tokens.length) {
                notTerms.push(tokens[i + 1].replace(/"/g, ''));
                i += 2;
                continue;
            }
            
            // Handle exclusion with minus
            if (token.startsWith('-')) {
                exclude.push(token.substring(1));
                i++;
                continue;
            }
            
            // Handle inclusion with plus (optional, plus just means include)
            if (token.startsWith('+')) {
                include.push(token.substring(1));
                i++;
                continue;
            }
            
            // Handle OR groups
            if (i + 2 < tokens.length && tokens[i + 1] === 'or') {
                const orGroup = [token];
                i += 2; // Skip 'or'
                orGroup.push(tokens[i].replace(/"/g, ''));
                
                // Continue collecting OR terms
                while (i + 2 < tokens.length && tokens[i + 1] === 'or') {
                    i += 2;
                    orGroup.push(tokens[i].replace(/"/g, ''));
                }
                
                orGroups.push(orGroup);
                i++;
                continue;
            }
            
            // Regular include term
            include.push(token);
            i++;
        }

        return { include, exclude, orGroups, notTerms };
    }

    // Enhanced text highlighting
    function highlightText(element, terms, className = 'merus-highlight') {
        if (!element || !terms.length) return;
        
        let html = element.innerHTML;
        
        // Remove previous highlights
        html = html.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '$1');
        
        // Apply new highlights
        terms.forEach(term => {
            if (term.length > 1) {
                const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
                html = html.replace(regex, `<mark class="${className}">$1</mark>`);
            }
        });
        
        element.innerHTML = html;
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Get searchable text from a row
    function getRowText(row) {
        const cells = {
            description: row.querySelector(SELECTORS.descriptionCell),
            user: row.querySelector(SELECTORS.userCell),
            tag: row.querySelector(SELECTORS.tagCell),
            date: row.querySelector(SELECTORS.dateCell)
        };

        const texts = [];
        Object.values(cells).forEach(cell => {
            if (cell && cell.textContent) {
                texts.push(cell.textContent.trim());
            }
        });

        return {
            fullText: texts.join(' ').toLowerCase(),
            cells: cells
        };
    }

    // Main filtering function
    function applyFilters(query) {
        const { include, exclude, orGroups, notTerms } = parseQuery(query);
        const allRows = document.querySelectorAll(SELECTORS.tableRow);
        
        if (allRows.length === 0) {
            console.log('No rows found to filter');
            return;
        }

        originalRowCount = allRows.length;
        filteredRowCount = 0;

        allRows.forEach(row => {
            const { fullText, cells } = getRowText(row);
            let shouldShow = true;

            // Check include terms (ALL must match)
            if (include.length > 0) {
                shouldShow = include.every(term => fullText.includes(term));
            }

            // Check exclude terms (NONE should match)
            if (shouldShow && exclude.length > 0) {
                shouldShow = !exclude.some(term => fullText.includes(term));
            }

            // Check NOT terms (NONE should match)
            if (shouldShow && notTerms.length > 0) {
                shouldShow = !notTerms.some(term => fullText.includes(term));
            }

            // Check OR groups (at least ONE group must have a match)
            if (shouldShow && orGroups.length > 0) {
                shouldShow = orGroups.some(group => 
                    group.some(term => fullText.includes(term))
                );
            }

            // Show/hide row
            if (shouldShow) {
                row.style.display = '';
                filteredRowCount++;
                
                // Highlight matches
                const allTerms = [...include, ...notTerms, ...orGroups.flat()];
                Object.values(cells).forEach(cell => {
                    if (cell) {
                        highlightText(cell, allTerms);
                    }
                });
            } else {
                row.style.display = 'none';
                
                // Remove highlights from hidden rows
                Object.values(cells).forEach(cell => {
                    if (cell) {
                        cell.innerHTML = cell.textContent;
                    }
                });
            }
        });

        updateUI(query, { include, exclude, orGroups, notTerms });
        updateStats();
    }

    // Update the statistics display
    function updateStats() {
        const statsElement = document.querySelector(SELECTORS.paginationStats);
        if (statsElement && enhancedEnabled) {
            statsElement.textContent = `${filteredRowCount} of ${originalRowCount} Items (Filtered)`;
            statsElement.style.backgroundColor = filteredRowCount < originalRowCount ? '#4caf50' : '';
        }
    }

    // Update UI elements
    function updateUI(query, parsedQuery) {
        if (toggleButton) {
            toggleButton.style.backgroundColor = enhancedEnabled ? '#4caf50' : '#f44336';
            toggleButton.style.color = 'white';
        }

        updateFilterBadge(parsedQuery);
    }

    // Create or update the filter summary badge
    function updateFilterBadge(parsedQuery) {
        if (!filterBadge) return;

        const { include, exclude, orGroups, notTerms } = parsedQuery;
        let summary = '';

        if (include.length > 0) {
            summary += `<span style="color:green"><b>Include:</b> ${include.join(', ')}</span><br>`;
        }
        if (exclude.length > 0) {
            summary += `<span style="color:red"><b>Exclude:</b> ${exclude.join(', ')}</span><br>`;
        }
        if (notTerms.length > 0) {
            summary += `<span style="color:red"><b>NOT:</b> ${notTerms.join(', ')}</span><br>`;
        }
        if (orGroups.length > 0) {
            summary += `<span style="color:blue"><b>OR:</b> ${orGroups.map(g => '(' + g.join(' OR ') + ')').join(' ')}</span>`;
        }

        if (summary) {
            filterBadge.innerHTML = `<b>Filter Summary:</b><br>${summary}`;
            filterBadge.style.display = 'block';
        } else {
            filterBadge.style.display = 'none';
        }
    }

    // Initialize the enhanced search UI
    function initializeUI() {
        const searchInput = document.querySelector(SELECTORS.searchInput);
        const controlsContainer = document.querySelector(SELECTORS.controlsContainer);
        
        if (!searchInput || !controlsContainer) {
            console.log('Search input or controls container not found');
            return false;
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
            `;
            
            toggleButton.addEventListener('click', () => {
                enhancedEnabled = !enhancedEnabled;
                localStorage.setItem('merus_enhanced_enabled', enhancedEnabled);
                
                if (enhancedEnabled) {
                    applyFilters(searchInput.value);
                } else {
                    clearFilters();
                }
            });

            // Insert after the search input group
            const inputGroup = searchInput.closest('.input-group');
            if (inputGroup) {
                inputGroup.parentNode.insertBefore(toggleButton, inputGroup.nextSibling);
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
            `;
            
            toggleButton.parentNode.insertBefore(filterBadge, toggleButton.nextSibling);
        }

        // Restore saved state
        const savedEnabled = localStorage.getItem('merus_enhanced_enabled');
        if (savedEnabled !== null) {
            enhancedEnabled = savedEnabled === 'true';
        }

        const savedQuery = localStorage.getItem(CONFIG.storageKey);
        if (savedQuery) {
            searchInput.value = savedQuery;
        }

        return true;
    }

    // Clear all filters and highlights
    function clearFilters() {
        const allRows = document.querySelectorAll(SELECTORS.tableRow);
        allRows.forEach(row => {
            row.style.display = '';
            
            // Remove highlights
            [SELECTORS.descriptionCell, SELECTORS.userCell, SELECTORS.tagCell, SELECTORS.dateCell]
                .forEach(selector => {
                    const cell = row.querySelector(selector);
                    if (cell) {
                        cell.innerHTML = cell.textContent;
                    }
                });
        });

        // Reset stats
        const statsElement = document.querySelector(SELECTORS.paginationStats);
        if (statsElement) {
            statsElement.textContent = `${allRows.length} Items`;
            statsElement.style.backgroundColor = '';
        }

        if (filterBadge) {
            filterBadge.style.display = 'none';
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        const searchInput = document.querySelector(SELECTORS.searchInput);
        if (!searchInput) return false;

        // Add input event listener with debouncing
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            localStorage.setItem(CONFIG.storageKey, query);

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (enhancedEnabled) {
                    if (query.trim()) {
                        applyFilters(query);
                    } else {
                        clearFilters();
                    }
                }
            }, CONFIG.debounceDelay);
        });

        return true;
    }

    // Add CSS for highlighting
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
        `;
        document.head.appendChild(styles);
    }

    // Main initialization function
    function initialize() {
        // Check if we're on the right page
        const searchInput = document.querySelector(SELECTORS.searchInput);
        if (!searchInput) {
            console.log('MerusCase search input not found, retrying...');
            return false;
        }

        console.log('Initializing MerusCase Enhanced Boolean Search...');
        
        addStyles();
        
        if (!initializeUI()) {
            console.log('Failed to initialize UI');
            return false;
        }

        if (!setupEventListeners()) {
            console.log('Failed to setup event listeners');
            return false;
        }

        // Apply saved query if exists and enhanced mode is enabled
        if (enhancedEnabled && searchInput.value.trim()) {
            applyFilters(searchInput.value);
        }

        console.log('MerusCase Enhanced Boolean Search initialized successfully!');
        return true;
    }

    // Wait for the page to load and initialize
    function waitForPageLoad() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(initialize, 500);
            });
        } else {
            // Try to initialize immediately
            if (!initialize()) {
                // If failed, use MutationObserver to wait for elements
                const observer = new MutationObserver((mutations, obs) => {
                    if (initialize()) {
                        obs.disconnect();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                // Stop trying after 10 seconds
                setTimeout(() => {
                    observer.disconnect();
                    console.log('MerusCase Enhanced Boolean Search: Timeout waiting for page elements');
                }, 10000);
            }
        }
    }

    // Handle page navigation in SPAs
    let currentUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            console.log('Page navigation detected, reinitializing...');
            setTimeout(() => {
                if (!initialize()) {
                    console.log('Failed to reinitialize after navigation');
                }
            }, 1000);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Start the initialization process
    waitForPageLoad();

})();