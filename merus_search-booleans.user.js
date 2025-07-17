// ==UserScript==
// @name         MerusCase Enhanced Boolean Search (Robust)
// @namespace    http://tampermonkey.net/
// @version      2.4.3
// @description  Robust boolean search for MerusCase Activity View - handles navigation and persistence
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
        excludeColor: '#f44336',
        checkInterval: 2000, // Check every 2 seconds for missing UI
        reinitDelay: 1000    // Wait 1 second before reinitializing
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
        console.log('Parsing query:', rawQuery);
        
        let normalized = CONFIG.caseInsensitive ? rawQuery.toLowerCase() : rawQuery;
        
        // Split on spaces but preserve quoted strings and handle operators properly
        const tokens = normalized.match(/(?:"[^"]*"|[^\s"]+)/g) || [];
        console.log('Initial tokens:', tokens);
        
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
        console.log('Final parsed query result:', result);
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
        console.log('Applying filters for query:', query);
        
        const { include, exclude, orGroups } = parseQuery(query);
        const allRows = document.querySelectorAll(SELECTORS.tableRow);
        
        if (allRows.length === 0) {
            console.log('No rows found to filter');
            return;
        }

        console.log(`Starting filter with ${allRows.length} rows`);
        console.log('Include terms:', include);
        console.log('Exclude terms:', exclude);
        console.log('OR groups:', orGroups);

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

            // Apply visibility using multiple hiding methods for infinite scroll tables
            if (shouldShow) {
                // Reset all hiding methods
                row.style.visibility = '';
                row.style.height = '';
                row.style.opacity = '';
                row.style.display = '';
                row.style.position = '';
                row.style.top = '';
                row.classList.remove('merus-hidden');
                filteredRowCount++;
                
                const allTerms = [...include, ...orGroups.flat()].filter(term => term && term.length > 0);
                if (allTerms.length > 0) {
                    highlightText(cell, allTerms);
                }
                
                console.log(`Row ${index}: SHOWN - "${originalText}"`);
            } else {
                // Use multiple hiding methods to ensure row is hidden
                row.style.visibility = 'hidden';
                row.style.height = '0px';
                row.style.opacity = '0';
                row.style.display = 'none';
                row.style.position = 'absolute';
                row.style.top = '-9999px';
                row.classList.add('merus-hidden');
                
                if (cell) {
                    cell.innerHTML = originalText;
                }
                
                console.log(`Row ${index}: HIDDEN - "${originalText}"`);
            }
        });

        console.log(`Filter results: ${filteredRowCount} of ${originalRowCount} rows shown`);
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

        const { include, exclude, orGroups } = parsedQuery;
        let summary = '';

        if (include.length > 0) {
            summary += `<span style="color:green"><b>Include:</b> ${include.join(', ')}</span><br>`;
        }
        if (orGroups.length > 0) {
            summary += `<span style="color:blue"><b>OR:</b> ${orGroups.map(g => '(' + g.join(' OR ') + ')').join(' ')}</span><br>`;
        }
        if (exclude.length > 0) {
            summary += `<span style="color:red"><b>Exclude:</b> ${exclude.join(', ')}</span>`;
        }

        if (summary) {
            filterBadge.innerHTML = `<b>Filter Summary:</b><br>${summary}`;
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
            console.log('Search input not found');
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
                console.log('Enhanced mode toggled:', enhancedEnabled);
                
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

        // Restore saved state
        const savedEnabled = localStorage.getItem('merus_enhanced_enabled');
        if (savedEnabled !== null) {
            enhancedEnabled = savedEnabled === 'true';
        }

        const savedQuery = localStorage.getItem(CONFIG.storageKey);
        if (savedQuery && searchInput.value !== savedQuery) {
            searchInput.value = savedQuery;
        }

        console.log('UI initialized successfully');
        return true;
    }

    function clearFilters() {
        console.log('Clearing all filters');
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
            
            /* Force hide filtered rows */
            .merus-hidden {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                height: 0px !important;
                overflow: hidden !important;
                position: absolute !important;
                top: -9999px !important;
                left: -9999px !important;
            }
        `;
        document.head.appendChild(styles);
    }

    function initialize() {
        if (isInitialized) {
            console.log('MerusCase Enhanced Boolean Search already initialized, skipping...');
            return true;
        }
        
        if (isInitializing) {
            console.log('MerusCase Enhanced Boolean Search currently initializing, skipping...');
            return false;
        }

        const searchInput = findSearchInput();
        if (!searchInput) {
            console.log('MerusCase search input not found, retrying...');
            return false;
        }

        console.log('Initializing MerusCase Enhanced Boolean Search v2.4...');
        
        isInitializing = true;
        
        addStyles();
        
        if (!initializeUI()) {
            console.log('Failed to initialize UI');
            isInitializing = false;
            return false;
        }

        if (!setupEventListeners()) {
            console.log('Failed to setup event listeners');
            isInitializing = false;
            return false;
        }

        // Apply saved query if exists and enhanced mode is enabled
        if (enhancedEnabled && searchInput.value.trim()) {
            console.log('Applying saved query:', searchInput.value);
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

        console.log('MerusCase Enhanced Boolean Search initialized successfully!');
        return true;
    }

    // Enhanced persistence checker
    function startPersistenceChecker() {
        if (persistenceChecker) {
            clearInterval(persistenceChecker);
        }

        persistenceChecker = setInterval(() => {
            // Check if our UI elements still exist
            const toggleExists = document.getElementById('chatgpt-boolean-toggle');
            const badgeExists = document.getElementById('chatgpt-boolean-badge');
            const searchInputExists = findSearchInput();
            
            // Check if search input reference is still valid
            const searchInputValid = currentSearchInput && 
                                   document.contains(currentSearchInput) && 
                                   currentSearchInput.offsetParent !== null;

            if (searchInputExists && (!toggleExists || !badgeExists || !searchInputValid)) {
                console.log('MerusCase Enhanced Boolean Search: UI elements missing, reinitializing...');
                
                // Reset state
                isInitialized = false;
                isInitializing = false;
                toggleButton = null;
                filterBadge = null;
                currentSearchInput = null;
                
                // Reinitialize after a short delay
                setTimeout(() => {
                    initialize();
                }, CONFIG.reinitDelay);
            }
        }, CONFIG.checkInterval);
    }

    function setupInitialization() {
        // Try immediate initialization
        if (initialize()) {
            return;
        }
        
        // Set up MutationObserver to watch for the search input to appear
        initializationObserver = new MutationObserver((mutations) => {
            if (isInitialized || isInitializing) {
                return;
            }
            
            const searchInput = findSearchInput();
            if (searchInput) {
                console.log('Search input found, attempting initialization...');
                initialize();
            }
        });

        initializationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log('MerusCase Enhanced Boolean Search: Waiting for search input to appear...');
    }

    // Simplified navigation handling
    function handleNavigation() {
        const newUrl = location.href;
        if (newUrl !== currentUrl) {
            currentUrl = newUrl;
            console.log('MerusCase Enhanced Boolean Search: Navigation detected, resetting...');
            
            // Stop persistence checker
            if (persistenceChecker) {
                clearInterval(persistenceChecker);
                persistenceChecker = null;
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
            setTimeout(() => {
                setupInitialization();
            }, CONFIG.reinitDelay);
        }
    }

    // Use a simple interval-based navigation detector instead of MutationObserver
    setInterval(handleNavigation, 1000);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (persistenceChecker) {
            clearInterval(persistenceChecker);
        }
        if (initializationObserver) {
            initializationObserver.disconnect();
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