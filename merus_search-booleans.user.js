// ==UserScript==
// @name         MerusCase Enhanced Boolean Search (Fixed)
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Fixed boolean search for MerusCase Activity View - searches description only
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
        controlsContainer: '.table-controls',
        paginationStats: '.pagination-stats .index-stats'
    };

    let debounceTimer = null;
    let enhancedEnabled = true;
    let originalRowCount = 0;
    let filteredRowCount = 0;
    let toggleButton = null;
    let filterBadge = null;
    
    // CRITICAL: Global initialization state management
    let isInitialized = false;
    let isInitializing = false;
    let initializationObserver = null;

    // Fixed query parsing with proper boolean logic
    function parseQuery(input) {
        if (!input || !input.trim()) {
            return { include: [], exclude: [], orGroups: [], rawQuery: '' };
        }

        const rawQuery = input.trim();
        console.log('Parsing query:', rawQuery);
        
        // Normalize for processing but keep original for display
        let normalized = CONFIG.caseInsensitive ? rawQuery.toLowerCase() : rawQuery;
        
        // Split on spaces but preserve quoted strings
        const tokens = normalized.match(/(?:"[^"]*"|[^\s"]+)/g) || [];
        console.log('Tokens:', tokens);
        
        const include = [];
        const exclude = [];
        const orGroups = [];
        
        let i = 0;
        while (i < tokens.length) {
            let token = tokens[i].replace(/"/g, ''); // Remove quotes
            
            // Handle NOT operator (must be followed by a term)
            if (token.toLowerCase() === 'not' && i + 1 < tokens.length) {
                const nextToken = tokens[i + 1].replace(/"/g, '');
                exclude.push(nextToken);
                console.log('Added to exclude via NOT:', nextToken);
                i += 2;
                continue;
            }
            
            // Handle exclusion with minus prefix
            if (token.startsWith('-') && token.length > 1) {
                const excludeTerm = token.substring(1);
                exclude.push(excludeTerm);
                console.log('Added to exclude via -:', excludeTerm);
                i++;
                continue;
            }
            
            // Handle inclusion with plus prefix (optional, just means include)
            if (token.startsWith('+') && token.length > 1) {
                include.push(token.substring(1));
                i++;
                continue;
            }
            
            // Handle OR groups - look ahead for OR
            if (i + 2 < tokens.length && tokens[i + 1].toLowerCase() === 'or') {
                const orGroup = [token];
                i += 2; // Skip 'or'
                orGroup.push(tokens[i].replace(/"/g, ''));
                
                // Continue collecting OR terms
                while (i + 2 < tokens.length && tokens[i + 1].toLowerCase() === 'or') {
                    i += 2;
                    orGroup.push(tokens[i].replace(/"/g, ''));
                }
                
                orGroups.push(orGroup);
                console.log('Added OR group:', orGroup);
                i++;
                continue;
            }
            
            // Skip standalone 'or' tokens (should be handled above)
            if (token.toLowerCase() === 'or') {
                i++;
                continue;
            }
            
            // Regular include term
            include.push(token);
            console.log('Added to include:', token);
            i++;
        }

        const result = { include, exclude, orGroups, rawQuery };
        console.log('Parsed query result:', result);
        return result;
    }

    // Enhanced text highlighting
    function highlightText(element, terms, className = 'merus-highlight') {
        if (!element || !terms.length) return;
        
        // Store original text content
        const originalText = element.textContent;
        let html = element.innerHTML;
        
        // Remove previous highlights but preserve other HTML
        html = html.replace(/<mark[^>]*class="[^"]*merus-[^"]*"[^>]*>(.*?)<\/mark>/gi, '$1');
        
        // Apply new highlights
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

    // Get searchable text from description cell only
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

    // Fixed filtering function with correct boolean logic
    function applyFilters(query) {
        console.log('Applying filters for query:', query);
        
        const { include, exclude, orGroups } = parseQuery(query);
        const allRows = document.querySelectorAll(SELECTORS.tableRow);
        
        if (allRows.length === 0) {
            console.log('No rows found to filter');
            return;
        }

        originalRowCount = allRows.length;
        filteredRowCount = 0;

        allRows.forEach((row, index) => {
            const { text, originalText, cell } = getDescriptionText(row);
            
            if (!cell) {
                row.style.display = 'none';
                return;
            }
            
            let shouldShow = true;
            
            // Step 1: Check include terms (ALL must match)
            if (include.length > 0) {
                shouldShow = include.every(term => {
                    const matches = text.includes(term);
                    console.log(`Row ${index}: Include check "${term}" in "${text}": ${matches}`);
                    return matches;
                });
                console.log(`Row ${index}: Include result: ${shouldShow}`);
            }

            // Step 2: Check exclude terms (NONE should match) - only if still showing
            if (shouldShow && exclude.length > 0) {
                const hasExcluded = exclude.some(term => {
                    const matches = text.includes(term);
                    console.log(`Row ${index}: Exclude check "${term}" in "${text}": ${matches}`);
                    return matches;
                });
                shouldShow = !hasExcluded; // Show if NO excluded terms are found
                console.log(`Row ${index}: After exclude check: ${shouldShow}`);
            }

            // Step 3: Check OR groups (at least ONE group must have a match) - only if still showing
            if (shouldShow && orGroups.length > 0) {
                shouldShow = orGroups.some(group => {
                    const groupMatch = group.some(term => {
                        const matches = text.includes(term);
                        console.log(`Row ${index}: OR group term "${term}" in "${text}": ${matches}`);
                        return matches;
                    });
                    console.log(`Row ${index}: OR group ${group.join(' OR ')} result: ${groupMatch}`);
                    return groupMatch;
                });
                console.log(`Row ${index}: Final OR result: ${shouldShow}`);
            }

            // Apply visibility and highlighting
            if (shouldShow) {
                row.style.display = '';
                filteredRowCount++;
                
                // Highlight matches in description cell only
                const allTerms = [...include, ...orGroups.flat()].filter(term => term && term.length > 0);
                if (allTerms.length > 0) {
                    highlightText(cell, allTerms);
                }
                
                console.log(`Row ${index}: SHOWN - "${originalText}"`);
            } else {
                row.style.display = 'none';
                
                // Remove highlights from hidden rows
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

    // Update the statistics display
    function updateStats() {
        const statsElement = document.querySelector(SELECTORS.paginationStats);
        if (statsElement && enhancedEnabled) {
            const originalText = statsElement.textContent;
            if (filteredRowCount !== originalRowCount) {
                statsElement.textContent = `${filteredRowCount} of ${originalRowCount} Items (Filtered)`;
                statsElement.style.backgroundColor = '#4caf50';
                statsElement.style.color = 'white';
                statsElement.style.padding = '2px 6px';
                statsElement.style.borderRadius = '3px';
            } else {
                // Reset to original appearance when no filtering
                statsElement.style.backgroundColor = '';
                statsElement.style.color = '';
                statsElement.style.padding = '';
                statsElement.style.borderRadius = '';
            }
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

    // Create or update the filter summary badge with fixed positioning
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

    // Initialize the enhanced search UI with better cleanup and resilience
    function initializeUI() {
        const searchInput = document.querySelector(SELECTORS.searchInput);
        
        if (!searchInput) {
            console.log('Search input not found');
            return false;
        }

        // Clean up any existing elements first
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

        // Create toggle button with better positioning
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

            // Find a stable insertion point
            const inputGroup = searchInput.closest('.input-group');
            const formGroup = searchInput.closest('.form-group');
            
            if (inputGroup && inputGroup.parentNode) {
                inputGroup.parentNode.insertBefore(toggleButton, inputGroup.nextSibling);
            } else if (formGroup && formGroup.parentNode) {
                formGroup.parentNode.insertBefore(toggleButton, formGroup.nextSibling);
            } else {
                // Fallback: append to controls container
                const controlsContainer = document.querySelector(SELECTORS.controlsContainer);
                if (controlsContainer) {
                    controlsContainer.appendChild(toggleButton);
                }
            }
        }

        // Create filter badge with fixed positioning
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
            
            // Insert badge after toggle button for better stability
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

    // Clear all filters and highlights
    function clearFilters() {
        console.log('Clearing all filters');
        const allRows = document.querySelectorAll(SELECTORS.tableRow);
        allRows.forEach(row => {
            row.style.display = '';
            
            // Remove highlights from description cell
            const descCell = row.querySelector(SELECTORS.descriptionCell);
            if (descCell) {
                const originalText = descCell.textContent;
                descCell.innerHTML = originalText;
            }
        });

        // Reset stats
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
            
            /* Ensure filter badge stays visible on resize */
            #chatgpt-boolean-badge {
                box-sizing: border-box;
                min-width: 200px;
            }
        `;
        document.head.appendChild(styles);
    }

    // Main initialization function with proper state management
    function initialize() {
        // CRITICAL: Check initialization state first
        if (isInitialized) {
            console.log('MerusCase Enhanced Boolean Search already initialized, skipping...');
            return true;
        }
        
        if (isInitializing) {
            console.log('MerusCase Enhanced Boolean Search currently initializing, skipping...');
            return false;
        }

        // Check if we're on the right page
        const searchInput = document.querySelector(SELECTORS.searchInput);
        if (!searchInput) {
            console.log('MerusCase search input not found, retrying...');
            return false;
        }

        console.log('Initializing MerusCase Enhanced Boolean Search v2.3...');
        
        isInitializing = true; // Set flag to prevent concurrent initialization
        
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

        isInitialized = true; // Mark as successfully initialized
        isInitializing = false;
        
        // Stop the initialization observer since we're done
        if (initializationObserver) {
            initializationObserver.disconnect();
            initializationObserver = null;
        }

        console.log('MerusCase Enhanced Boolean Search initialized successfully!');
        return true;
    }

    // Simplified initialization setup - only tries until successful
    function setupInitialization() {
        // Try immediate initialization
        if (initialize()) {
            return;
        }
        
        // Set up MutationObserver to watch for the search input to appear
        initializationObserver = new MutationObserver((mutations) => {
            // Only check if we're not already initialized
            if (isInitialized || isInitializing) {
                return;
            }
            
            // Check if search input is now available
            const searchInput = document.querySelector(SELECTORS.searchInput);
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

    // Handle page navigation by resetting state
    let currentUrl = location.href;
    const navigationObserver = new MutationObserver(() => {
        // Only check for URL changes
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            console.log('MerusCase Enhanced Boolean Search: Page navigation detected, resetting...');
            
            // Reset all state
            isInitialized = false;
            isInitializing = false;
            toggleButton = null;
            filterBadge = null;
            
            // Clean up existing elements
            const existingToggle = document.getElementById('chatgpt-boolean-toggle');
            const existingBadge = document.getElementById('chatgpt-boolean-badge');
            if (existingToggle) existingToggle.remove();
            if (existingBadge) existingBadge.remove();
            
            // Try to reinitialize after a delay
            setTimeout(() => {
                setupInitialization();
            }, 1000);
        }
    });

    // Use a much more targeted observer for navigation
    navigationObserver.observe(document.body, { 
        childList: false,  // Don't watch for child additions
        subtree: false,    // Don't watch subtree
        attributes: true,
        attributeFilter: ['data-page', 'data-url'] // Only specific attributes that might indicate navigation
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