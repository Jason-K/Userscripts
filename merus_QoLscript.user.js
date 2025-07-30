// ==UserScript==
// @name         MerusCase Super Suite
// @namespace    http://tampermonkey.net/
// @author       Jason K
// @version      1.0
// @description  Combines Smart Renamer, Quick PDF Download, Enhanced Boolean Search, Smart Tab-to-Spaces, and Auto-Tagger into one.
// @match        *://meruscase.com/*
// @match        *://*.meruscase.com/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_QoLscript.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_QoLscript.user.js
// ==/UserScript==

(function() {
    'use strict';
    console.log('🚀 MerusCase Super Suite loaded');

    /**
     * True when on a detail page and panel exists.
     */
    function isDetailOpen() {
        const pathMatch = /\/activities\/viewOne\/[0-9]+/.test(window.location.pathname);
        const panelExists = Boolean(document.querySelector('#rightPanelTabs .button-list'));
        console.log('MerusCase: isDetailOpen?', pathMatch, panelExists);
        return pathMatch && panelExists;
    }

    /**
     * Run module initializers if detail open.
     */
    function runModules() {
        if (!isDetailOpen()) return;
        console.log('MerusCase: detail detected, initializing modules');
        initRenamer();
        initQuickDownload();
        initBooleanSearch();
        initTabToSpaces();
        initAutoTagger();
    }

    /**
     * Hook history changes for SPA.
     */
    function hookNavigation(onNav) {
        const origPush = history.pushState;
        history.pushState = function() {
            origPush.apply(this, arguments);
            onNav();
        };
        window.addEventListener('popstate', onNav);
    }

    /**
     * Safe DOMContentLoaded.
     */
    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    /* ---------- MODULE: Renamer ---------- */
    function initRenamer() {
        if (!isDetailOpen()) return;
        console.log('Initializing Renamer');
        (function() {
            'use strict';
        
            const ACRONYMS = new Set(["PT", "MD", "M.D.", "QME", "AME", "UR", "EMG", "NCV", "NCS", "MRI", "PTP", "TTD", "PPD", "PD", "RTW", "MMI", "WCAB", "XR"]);
            const TITLES = new Set(["dr.", "dr", "judge"]);
            const CORRECTIONS = {
                "emgncs": "EMG-NCS",
                "x-ray": "XR",
                " with ": " w. "
            };
            const DOC_TYPE_RULES = [
                [/\bur\b/i, "UR"],
                [/\bletter\b/i, "letter"],
                [/\bappt notice\b/i, "notice"],
                [/\b(?:qme|ame)\b/i, "med-legal"],
                [/\breport\b/i, "medical"]
            ];
            const UR_SUBTYPE_RE = /\b(approval|denial|mod)\b/i;
            const DATE_RE = /(\d{1,2})-(\d{1,2})-(\d{2,4})(?:_\d+)?(?:[^a-zA-Z0-9]|$)/;
            const DR_RE_1 = /\b(?:dr\.?|doctor)\s+([\w\-.', ]+?)([A-Z][a-zA-Z'-]+)\b/i;
            const DR_RE_2 = /([\w\-.', ]+?)\s+([A-Z][a-zA-Z'-]+)\s+(?:m\.?d\.?|md|d\.?o\.?|ph\.?d\.?)(?=\b|[^A-Za-z])/i;
            // Business suffixes to remove and trigger title case (llp, inc, pc, corp, co, ltd, llc, etc.)
            const BUSINESS_SUFFIXES = /,?\s*(llp|inc\.?|pc|corp\.?|co\.?|ltd\.?|llc|pllc|p\.c\.?|l\.l\.p\.?|l\.l\.c\.?|corporation|incorporated|company|limited)$/i;
        
            // Undo functionality
            let undoData = null;
            let undoButton = null;
        
            function normalizeBusiness(text) {
                const match = text.match(BUSINESS_SUFFIXES);
                if (match) {
                    // Remove the business suffix
                    const businessName = text.substring(0, match.index).trim();
                    // Apply title case to business name
                    const titleCased = toTitleCase(businessName);
                    return { text: titleCased, wasBusiness: true };
                }
                return { text: text, wasBusiness: false };
            }
        
            function toTitleCase(str) {
                // Words that should remain lowercase in title case (unless first or last word)
                const lowercaseWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'up', 'yet', 'so', 'nor']);
                
                const words = str.split(' ');
                return words.map(function(word, index) {
                    if (word.length === 0) return word;
                    
                    // Handle words with apostrophes like "O'Brien"
                    if (word.includes("'")) {
                        return word.split("'").map(function(part) {
                            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
                        }).join("'");
                    }
                    
                    const lowerWord = word.toLowerCase();
                    // First and last words are always capitalized, others follow title case rules
                    if (index === 0 || index === words.length - 1 || !lowercaseWords.has(lowerWord)) {
                        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    } else {
                        return lowerWord;
                    }
                }).join(' ');
            }
        
            function extractDate(stem) {
                const m = stem.match(DATE_RE);
                if (!m) {
                    throw new Error("no date found");
                }
                let month = parseInt(m[1]);
                let day = parseInt(m[2]);
                let year = parseInt(m[3]);
                
                if (year < 100) {
                    year += (year < 50) ? 2000 : 1900;
                }
                
                // Validate the date
                if (month < 1 || month > 12 || day < 1 || day > 31) {
                    throw new Error("invalid date values");
                }
                
                const dateObj = new Date(year, month - 1, day);
                const newDate = dateObj.toISOString().slice(0, 10).replace(/-/g, '.');
                
                // Get the text before the date match
                const beforeDate = stem.substring(0, m.index).trim().replace(/[ _-]+$/, '');
                
                return [beforeDate, newDate];
            }
        
            function normalizeDoctor(text) {
                for (const pat of [DR_RE_1, DR_RE_2]) {
                    const m = text.match(pat);
                    if (!m) {
                        continue;
                    }
                    const last = m[2].replace(",", "").trim();
                    const capitalizedLast = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
                    const doctor = "Dr. " + capitalizedLast;
                    const newText = (text.substring(0, m.index) + text.substring(m.index + m[0].length)).replace(/^[-–\s]+/, '').replace(/\s\s+/g, ' ');
                    return [newText, doctor];
                }
                return [text, null];
            }
        
            function pickDocType(txt) {
                // Check for "letter" at the beginning first (higher priority)
                if (/^letter\b/i.test(txt)) {
                    return "letter";
                }
                
                // Then check other document types
                for (const rule of DOC_TYPE_RULES) {
                    const expr = rule[0];
                    const kind = rule[1];
                    if (expr.test(txt)) {
                        return kind;
                    }
                }
                return "document";
            }
        
            function protectCase(token) {
                const up = token.toUpperCase();
                const base = token.toLowerCase();
                if (ACRONYMS.has(up)) {
                    return up;
                }
                if (TITLES.has(base)) {
                    return base.startsWith("dr") ? "Dr." : token.charAt(0).toUpperCase() + token.slice(1);
                }
                return base;
            }
        
            function smartCase(line) {
                return line.split(/(\W+)/).filter(Boolean).map(function(t, i) {
                    return (i % 2 === 0) ? protectCase(t) : t;
                }).join('');
            }
        
            function finalCleanup(name) {
                let txt = name;
                for (const wrong in CORRECTIONS) {
                    const right = CORRECTIONS[wrong];
                    const regex = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    txt = txt.replace(regex, right);
                }
                // Use " - " instead of " – "
                txt = txt.replace(/\s*-\s*/g, ' - ');
                txt = txt.replace(/\s{2,}/g, ' ');
                txt = txt.replace(/\.{2,}/g, '.');
                return txt.trim().replace(/[-_]$/, '');
            }
        
            function transform(stem) {
                const extracted = extractDate(stem);
                let remainder = extracted[0];
                const dateStr = extracted[1];
                
                // Handle "re" replacement - convert to "re." instead of " – "
                remainder = remainder.replace(/\bre\b/gi, 're.');
                
                const doctorResult = normalizeDoctor(remainder);
                remainder = doctorResult[0];
                const doctor = doctorResult[1];
        
                const docType = pickDocType(remainder);
        
                let description = "";
                if (docType === "letter") {
                    // For letters, remove the word "letter" and "from" if present
                    description = remainder
                        .replace(/^letter\s+from\s+/i, '')
                        .replace(/^letter\s+/i, '')
                        .trim();
                } else if (docType === "UR") {
                    const subM = remainder.match(UR_SUBTYPE_RE);
                    let urDesc = remainder;
                    if (subM) {
                        urDesc = subM[1].toLowerCase() + " " + remainder.replace(UR_SUBTYPE_RE, '').trim();
                    }
                    description = urDesc;
                } else if (docType === "notice") {
                    description = "appointment";
                } else {
                    description = remainder;
                }
        
                // Clean up description
                description = description.trim().replace(/^[-\s]+/, '').replace(/[-\s]+$/, '');
                
                // Normalize business names first (before smart case)
                const businessResult = normalizeBusiness(description);
                description = businessResult.text;
                
                // Apply smart case to description only if it wasn't a business name
                if (!businessResult.wasBusiness) {
                    description = smartCase(description);
                }
        
                // Build final parts with " - " separator
                const finalParts = [dateStr, docType];
                if (description) {
                    finalParts.push(description);
                }
        
                if (docType === "notice" && doctor) {
                    finalParts[finalParts.length - 1] += " with " + doctor;
                } else if (docType === "medical" && doctor) {
                    finalParts.push(doctor);
                }
        
                const joined = finalParts.filter(function(p) { return p; }).join(' - ');
                return finalCleanup(joined);
            }
        
            function findAndClickRenameButton() {
                const renameButton = document.querySelector('button.rename-button');
                if (renameButton && !renameButton.classList.contains('hidden')) {
                    renameButton.click();
                    console.log('MerusCase Smart Renamer: Clicked MerusCase Rename button');
                    return true;
                }
                return false;
            }
        
            function findTargetInput() {
                // First try to find the specific MerusCase upload description input
                let input = document.querySelector('input[name="data[Upload][description]"]');
                if (input && input.value) {
                    return input;
                }
                
                // Fallback to any input with data-merus-type="input" that has content
                const merusInputs = document.querySelectorAll('input[data-merus-type="input"]');
                for (let i = 0; i < merusInputs.length; i++) {
                    const inp = merusInputs[i];
                    if (inp.value && inp.value.trim()) {
                        return inp;
                    }
                }
                
                // Final fallback to any visible input with file-like content
                const allInputs = document.querySelectorAll('input[type="text"], input:not([type])');
                for (let i = 0; i < allInputs.length; i++) {
                    const inp = allInputs[i];
                    if (inp.value && (inp.value.includes('.pdf') || inp.value.includes('.doc') || inp.value.match(/\d{1,2}-\d{1,2}-\d{2,4}/))) {
                        return inp;
                    }
                }
                
                return null;
            }
        
            function createUndoButton() {
                if (undoButton) {
                    return; // Already exists
                }
                
                undoButton = document.createElement('button');
                undoButton.textContent = 'Undo Rename';
                undoButton.style.position = 'fixed';
                undoButton.style.bottom = '10px';
                undoButton.style.right = '140px'; // Position to the left of main button
                undoButton.style.zIndex = '9999';
                undoButton.style.backgroundColor = '#ff6b6b';
                undoButton.style.color = 'white';
                undoButton.style.padding = '10px 15px';
                undoButton.style.border = 'none';
                undoButton.style.borderRadius = '5px';
                undoButton.style.cursor = 'pointer';
                undoButton.style.fontSize = '12px';
                
                undoButton.addEventListener('click', function() {
                    if (undoData && undoData.input && undoData.originalValue) {
                        undoData.input.value = undoData.originalValue;
                        
                        // Trigger events
                        const inputEvent = new Event('input', { bubbles: true });
                        undoData.input.dispatchEvent(inputEvent);
                        
                        const changeEvent = new Event('change', { bubbles: true });
                        undoData.input.dispatchEvent(changeEvent);
                        
                        console.log('MerusCase Smart Renamer: Undid rename, restored "' + undoData.originalValue + '"');
                        
                        // Remove undo button and clear undo data
                        removeUndoButton();
                    }
                });
                
                document.body.appendChild(undoButton);
            }
            
            function removeUndoButton() {
                if (undoButton) {
                    undoButton.remove();
                    undoButton = null;
                }
                undoData = null;
            }
        
            function createButton() {
                const button = document.createElement('button');
                button.textContent = 'Smart Rename';
                button.style.position = 'fixed';
                button.style.bottom = '10px';
                button.style.right = '10px';
                button.style.zIndex = '9999';
                button.style.backgroundColor = '#4CAF50';
                button.style.color = 'white';
                button.style.padding = '10px 20px';
                button.style.border = 'none';
                button.style.borderRadius = '5px';
                button.style.cursor = 'pointer';
                button.style.fontSize = '12px';
        
                button.addEventListener('click', function() {
                    // First, try to click the MerusCase rename button if it's visible
                    const renameButtonClicked = findAndClickRenameButton();
                    
                    // If we clicked the rename button, wait a moment for the form to appear
                    const delay = renameButtonClicked ? 200 : 0;
                    
                    setTimeout(function() {
                        const targetInput = findTargetInput();
                        
                        if (!targetInput) {
                            alert('No suitable input field found. Please make sure you have a file description field with content visible on the page.');
                            return;
                        }
                        
                        const originalValue = targetInput.value;
                        if (!originalValue || !originalValue.trim()) {
                            alert('Input field is empty.');
                            return;
                        }
                        
                        const path = originalValue;
                        const stem = path.includes('.') ? path.substring(0, path.lastIndexOf('.')) : path;
                        const ext = path.includes('.') ? path.substring(path.lastIndexOf('.')) : '';
        
                        try {
                            console.log('Starting transformation of: "' + stem + '"');
                            const newStem = transform(stem);
                            const newValue = newStem + ext;
                            targetInput.value = newValue;
                            
                            // Store undo data before triggering events
                            undoData = {
                                input: targetInput,
                                originalValue: originalValue
                            };
                            
                            // Trigger input event to ensure MerusCase recognizes the change
                            const inputEvent = new Event('input', { bubbles: true });
                            targetInput.dispatchEvent(inputEvent);
                            
                            // Trigger change event as well
                            const changeEvent = new Event('change', { bubbles: true });
                            targetInput.dispatchEvent(changeEvent);
                            
                            console.log('MerusCase Smart Renamer: Renamed "' + originalValue + '" to "' + newValue + '"');
                            
                            // Create undo button
                            createUndoButton();
                            
                            // No popup - user can see the result directly in the input field
                        } catch (err) {
                            console.error("SmartRename Error:", err);
                            console.error("Original value:", originalValue);
                            console.error("Stem:", stem);
                            alert('Could not rename: ' + err.message);
                            // Don't create undo button if rename failed
                        }
                    }, delay);
                });
        
                document.body.appendChild(button);
            }
        
            // Wait for page to load before creating button
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', createButton);
            } else {
                createButton();
            }
        })();
    }

    /* ---------- MODULE: QuickDownload ---------- */
    function initQuickDownload() {
        if (!isDetailOpen()) return;
        console.log('Initializing QuickDownload');
        (function () {
          'use strict';
        
          function waitForElement(selector, callback, timeout = 10000) {
            const start = Date.now();
            const interval = setInterval(() => {
              const el = document.querySelector(selector);
              if (el) {
                clearInterval(interval);
                callback(el);
              } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                logDebug(`Timeout waiting for selector: ${selector}`);
              }
            }, 300);
          }
        
          function extractDateFromText(text) {
            const match = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
            return match ? `${match[1]}.${match[2]}.${match[3]}` : 'Undated';
          }
        
          function extractCaseName() {
            const el = document.querySelector('.pretty-name-span');
            if (el && el.textContent.includes(',')) {
              const [last, first] = el.textContent.replace("DECEASED", "").split(',').map(x => x.trim());
              return first && last ? `${first} ${last}` : 'Unknown Case';
            }
        
            const caption = [...document.querySelectorAll("span, h1, h2")].find(e => e.textContent.includes(" v. "));
            if (caption) {
              const [left] = caption.textContent.split(" v.");
              const [last, first] = left.replace("DECEASED", "").split(',').map(s => s.trim());
              return first && last ? `${first} ${last}` : 'Unknown Case';
            }
        
            return 'Unknown Case';
          }
        
          function extractTitle() {
            const spanCandidates = [...document.querySelectorAll('div.box-view h5 span')];
            const titleEl = spanCandidates.find(el => el.textContent.toLowerCase().endsWith('.pdf'));
            return titleEl ? titleEl.textContent.trim() : 'Untitled Document';
          }
        
          function extractDownloadHref() {
            const el = document.querySelector('a[aria-label="Download Document"]');
            return el?.getAttribute('href') || '';
          }
        
          function sanitizeFilename(str) {
            return str.replace(/[\/:*?"<>|]/g, "-");
          }
        
          async function copyToClipboard(text) {
            try {
              await navigator.clipboard.writeText(text);
              showToast("Copied to clipboard");
              logDebug("Clipboard copied: " + text);
            } catch (e) {
              showToast("Clipboard error");
              logDebug("Clipboard error: " + e.message);
            }
          }
        
          function showToast(msg, duration = 3000) {
            const toast = document.createElement("div");
            toast.textContent = msg;
            toast.style.cssText = `
              position: fixed;
              top: 100px;
              right: 20px;
              background: #323232;
              color: #fff;
              padding: 10px 15px;
              border-radius: 5px;
              z-index: 10001;
              font-size: 14px;
              box-shadow: 0 0 10px rgba(0,0,0,0.4);
              opacity: 0;
              transition: opacity 0.4s;
            `;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = 1; }, 100);
            setTimeout(() => {
              toast.style.opacity = 0;
              setTimeout(() => toast.remove(), 400);
            }, duration);
          }
        
          function logDebug(message) {
            const panel = document.getElementById("merus-debug-panel");
            if (panel) {
              const line = document.createElement("div");
              line.textContent = `[${new Date().toISOString()}] ${message}`;
              panel.appendChild(line);
              panel.scrollTop = panel.scrollHeight;
            }
            console.log(message);
          }
        
          function setupDebugPanel() {
            const panel = document.createElement("div");
            panel.id = "merus-debug-panel";
            panel.style.cssText = `
              position: fixed;
              bottom: 0;
              right: 0;
              width: 400px;
              max-height: 300px;
              overflow-y: auto;
              font-size: 12px;
              font-family: monospace;
              background: #111;
              color: #0f0;
              border-top-left-radius: 8px;
              padding: 10px;
              display: none;
              z-index: 99999;
              box-shadow: 0 0 10px #000;
            `;
        
            const toggle = document.createElement("button");
            toggle.textContent = "🐞";
            toggle.style.cssText = `
              position: fixed;
              bottom: 0;
              right: 0;
              margin: 5px;
              z-index: 99999;
              background: #222;
              color: #0f0;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              padding: 4px 8px;
              cursor: pointer;
            `;
            toggle.onclick = () => {
              panel.style.display = panel.style.display === "none" ? "block" : "none";
            };
        
            document.body.appendChild(panel);
            document.body.appendChild(toggle);
          }
        
          function addButtons() {
            if (document.getElementById("quick-download-btn")) return;
        
            const wrapper = document.createElement("div");
            wrapper.style.cssText = `
              position: fixed;
              top: 80px;
              right: 20px;
              z-index: 10000;
              display: flex;
              gap: 8px;
            `;
        
            const createButton = (label, id, color, handler) => {
              const btn = document.createElement("button");
              btn.innerText = label;
              btn.id = id;
              btn.style.cssText = `
                background: ${color};
                color: white;
                border: none;
                padding: 10px 15px;
                font-size: 14px;
                border-radius: 5px;
                cursor: pointer;
                box-shadow: 2px 2px 6px rgba(0,0,0,0.2);
              `;
              btn.onclick = handler;
              return btn;
            };
        
            const runFilenameLogic = () => {
              const title = extractTitle();
              const date = extractDateFromText(title);
              const name = extractCaseName();
              const clean = sanitizeFilename(`${date} - ${name} - ${title}`);
              logDebug(`Computed filename: ${clean}`);
              return clean;
            };
        
            const downloadBtn = createButton("QUICK DOWNLOAD", "quick-download-btn", "#2a7ae2", () => {
              const filename = runFilenameLogic();
              copyToClipboard(filename);
              const href = extractDownloadHref();
              const url = href ? new URL(href, window.location.origin).href : null;
              if (url) {
                window.open(url, "_blank");
                showToast("Download opened in new tab");
                logDebug("Opened: " + url);
              } else {
                showToast("No download URL found");
                logDebug("No href available");
              }
            });
        
            const copyBtn = createButton("COPY FILENAME", "copy-filename-btn", "#1abc9c", () => {
              const filename = runFilenameLogic();
              copyToClipboard(filename);
            });
        
            wrapper.appendChild(downloadBtn);
            wrapper.appendChild(copyBtn);
            document.body.appendChild(wrapper);
          }
        
          function init() {
            setupDebugPanel();
            waitForElement('a[aria-label="Download Document"]', () => {
              addButtons();
            });
          }
        
          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(init, 500);
          } else {
            document.addEventListener('DOMContentLoaded', init);
          }
        })();
    }

    /* ---------- MODULE: BooleanSearch ---------- */
    function initBooleanSearch() {
        if (!isDetailOpen()) return;
        console.log('Initializing BooleanSearch');
        (function() {
            'use strict';
        
            const CONFIG = {
                caseInsensitive: true,
                debounceDelay: 300,
                debug: true,
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
        
                // Restore saved state (enhanced mode only, not search queries)
                const savedEnabled = localStorage.getItem('merus_enhanced_enabled');
                if (savedEnabled !== null) {
                    enhancedEnabled = savedEnabled === 'true';
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
                
                // Debug logging
                console.log('handleSearchInput called with:', query);
        
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    if (enhancedEnabled) {
                        if (query.trim()) {
                            // Check if the query has exclusions that might be limited by native search
                            const { include, exclude, orGroups } = parseQuery(query);
                            if (exclude.length > 0) {
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
        
                // Apply saved query if exists and enhanced mode is enabled (removed - no query persistence)
                if (enhancedEnabled && searchInput.value.trim()) {
                    console.log('Processing existing query in search box:', searchInput.value);
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
    }

    /* ---------- MODULE: TabToSpaces ---------- */
    function initTabToSpaces() {
        if (!isDetailOpen()) return;
        console.log('Initializing TabToSpaces');
        (function () {
          let enabled = true;
          let useNbsp = false;
        
          const logPrefix = "[MerusTab]";
          const SPACES = "    ";
          const NBSP = "\u00A0\u00A0\u00A0\u00A0";
        
          const toastStyle = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            background: #333;
            color: #fff;
            padding: 6px 10px;
            font-size: 12px;
            border-radius: 5px;
            z-index: 9999;
            opacity: 0.9;
          `;
        
          function showToast(text) {
            const toast = document.createElement("div");
            toast.textContent = text;
            toast.setAttribute("style", toastStyle);
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
          }
        
          function isInNoteEditable() {
            const el = document.activeElement;
            return (
              el &&
              el.isContentEditable &&
              el.classList.contains("note-editable")
            );
          }
        
          document.addEventListener("keydown", (e) => {
            if (!isInNoteEditable()) return;
        
            // ---- TOGGLES ----
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "t") {
              enabled = !enabled;
              showToast(`MerusTab ${enabled ? "enabled" : "disabled"}`);
              return;
            }
        
            if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "n") {
              useNbsp = !useNbsp;
              showToast(`MerusTab using ${useNbsp ? "non-breaking spaces" : "regular spaces"}`);
              return;
            }
        
            if (!enabled) return;
        
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
        
            const range = sel.getRangeAt(0);
            const content = useNbsp ? NBSP : SPACES;
        
            // ---- BACKSPACE: delete 4 spaces if behind caret ----
            if (e.key === "Backspace" && sel.isCollapsed) {
              const node = sel.anchorNode;
              const offset = sel.anchorOffset;
        
              if (node && node.nodeType === Node.TEXT_NODE && offset >= 4) {
                const preceding = node.textContent.slice(offset - 4, offset);
                if (preceding === content) {
                  e.preventDefault();
                  node.textContent =
                    node.textContent.slice(0, offset - 4) + node.textContent.slice(offset);
                  const newRange = document.createRange();
                  newRange.setStart(node, offset - 4);
                  newRange.setEnd(node, offset - 4);
                  sel.removeAllRanges();
                  sel.addRange(newRange);
                  return;
                }
              }
            }
        
            // ---- TAB / SHIFT+TAB ----
            if (e.key === "Tab") {
              e.preventDefault();
              const selectedText = sel.toString();
        
              if (selectedText.includes("\n")) {
                if (e.shiftKey) {
                  unindentMultipleLines(sel, content);
                } else {
                  indentMultipleLines(sel, content);
                }
              } else {
                if (e.shiftKey) {
                  tryUnindentInline(range, content);
                } else {
                  insertAtCaret(range, content);
                }
              }
            }
          });
        
          function insertAtCaret(range, content) {
            range.deleteContents();
            const node = document.createTextNode(content);
            range.insertNode(node);
            range.setStartAfter(node);
            range.setEndAfter(node);
        
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        
          function indentMultipleLines(sel, content) {
            const range = sel.getRangeAt(0);
            const fragment = range.cloneContents();
            const temp = document.createElement("div");
            temp.appendChild(fragment);
            const lines = temp.innerText.split("\n");
        
            const indented = lines.map(line => content + line).join("\n");
        
            const newNode = document.createTextNode(indented);
            range.deleteContents();
            range.insertNode(newNode);
        
            const newRange = document.createRange();
            newRange.setStartBefore(newNode);
            newRange.setEndAfter(newNode);
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
        
          function unindentMultipleLines(sel, content) {
            const range = sel.getRangeAt(0);
            const fragment = range.cloneContents();
            const temp = document.createElement("div");
            temp.appendChild(fragment);
            const lines = temp.innerText.split("\n");
        
            const pattern = content.replace(/\u00A0/g, '\u00A0'); // safe for nbsp
            const unindented = lines.map(line =>
              line.startsWith(pattern) ? line.slice(content.length) : line
            ).join("\n");
        
            const newNode = document.createTextNode(unindented);
            range.deleteContents();
            range.insertNode(newNode);
        
            const newRange = document.createRange();
            newRange.setStartBefore(newNode);
            newRange.setEndAfter(newNode);
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
        
          function tryUnindentInline(range, content) {
            const sel = window.getSelection();
            const node = sel.anchorNode;
            const offset = sel.anchorOffset;
        
            if (node && node.nodeType === Node.TEXT_NODE && offset >= content.length) {
              const before = node.textContent.slice(offset - content.length, offset);
              if (before === content) {
                node.textContent =
                  node.textContent.slice(0, offset - content.length) +
                  node.textContent.slice(offset);
                const newRange = document.createRange();
                newRange.setStart(node, offset - content.length);
                newRange.setEnd(node, offset - content.length);
                sel.removeAllRanges();
                sel.addRange(newRange);
              }
            }
          }
        
        })();
    }

    /* ---------- MODULE: AutoTagger ---------- */
    function initAutoTagger() {
        if (!isDetailOpen()) return;
        console.log('Initializing AutoTagger');
        (function() {
            'use strict';
        
            // Configuration object for tag rules based on actual Meruscase options
            const tagRules = {
                // Communication & Correspondence
                'email': '35551', // EMAIL
                'e-mail': '35551', // EMAIL
                'sent email': '104', // Email Sent
                'received email': '107', // Email Received
                'correspondence': '35539', // CORRESPONDENCE
                'letter': '102', // Letter Sent
                'received letter': '105', // Letter Received
                'fax': '103', // Fax Sent
                'received fax': '106', // Fax Received
                'telephone': '111', // Telephone Call
                'phone': '111', // Telephone Call
                'called': '111', // Telephone Call
                'call': '111', // Telephone Call
                
                // Legal Proceedings
                'deposition': '42912', // DEPOSITION NOTICES
                'depo': '42912', // DEPOSITION NOTICES
                'deposition transcript': '42913', // DEPOSITION TRANSCRIPTS
                'discovery': '97855', // DISCOVERY
                'plaintiff discovery': '42915', // DISCOVERY – PLAINTIFF
                'defendant discovery': '42914', // DISCOVERY – DEFENDANT
                'trial': '42921', // TRIAL
                'mediation': '42920', // MEDIATION
                'arbitration': '42908', // ARBITRATION
                'adr': '97854', // ADR
                'msc': '42927', // MSC
                'motion': '42922', // MOTIONS
                'demurrer': '42929', // DEMURRER
                'pleading': '35538', // PLEADING
                
                // Medical & Evaluations
                'qme': '35550', // QME PANEL LIST/PROCESS
                'ame': '35549', // AME/QME
                'medical': '35537', // MEDICAL
                'dme': '42916', // DME
                'expert': '42923', // EXPERTS
                'expert demand': '42924', // EXPERT DEMANDS
                'expert disclosure': '42925', // EXPERT DISCLOSURES
                'imr': '40657', // IMR
                
                // Records & Documentation
                'medical records': '42919', // RECORDS REQUESTING
                'records': '42919', // RECORDS REQUESTING
                'subpoena': '35545', // SUBPOENA RECORDS
                'exhibits': '60105', // EXHIBITS
                'photos': '42928', // PHOTOS & VIDEOS
                'video': '42928', // PHOTOS & VIDEOS
                'memo': '42918', // MEMOS & NOTES
                'note': '101', // Note
                'facts': '42917', // FACTS
                
                // Case Management
                'settlement': '35723', // Settlement
                'lien': '35543', // LIENS
                'benefit': '35541', // BENEFIT TRACKING
                'penalties': '35544', // PENALTIES
                'penalty': '35544', // PENALTIES
                'costs': '42911', // COSTS
                'fee': '109', // Fee
                'fee tracking': '35547', // FEE TRACKING
                'payment': '110', // Payment
                'check': '53629', // Check
                
                // Administrative
                'client info': '35548', // CLIENT INFO
                'client forms': '42907', // CLIENT FORMS & AUTHORIZATIONS
                'authorization': '42907', // CLIENT FORMS & AUTHORIZATIONS
                'case management': '42910', // CASE MANAGEMENT
                'opening documents': '35542', // OPENING DOCUMENTS
                'calendar': '98316', // Calendar Mail
                
                // Insurance & Benefits
                'social security': '35546', // SOCIAL SECURITY
                'rehabilitation': '35535', // REHAB
                'rehab': '35535', // REHAB
                'utilization review': '35540', // UTILIZATION REVIEW
                'longshore': '35536', // LONGSHORE
                'mpn': '35587', // MPN
                'msa': '71813', // MSA/CMS
                'cms': '71813', // MSA/CMS
                'um': '42930', // UM-UIM
                'uim': '42930', // UM-UIM
                'disability retirement': '56718', // Disability Retirement
                
                // Electronic/Technical
                'eams': '82511', // EAMS E-FILED
                'e-filed': '82511', // EAMS E-FILED
                'efax': '57696', // eFax Confirmation
                'electronic signature': '114', // Electronic Signature
                
                // Attorney Work
                'attorney': '35531', // Attorney
                'attorney note': '35640', // Attorney Note
                
                // Miscellaneous
                'library': '40631', // LIBRARY
                'reviewed': '113', // Reviewed
                'proof': '108', // Proof Sent
                'copy service': '112', // Copy Service Request
                'court rules': '115', // Court Rules
                'manual entry': '100', // Manual Entry
                'indexable': '99047', // Indexable
                'mail to bsa': '35629', // Mail to BSA
                'unread mail': '35574', // Unread Mail
                'main case activity': '35534' // MAIN CASE ACTIVITY
            };
        
            // Function to analyze note content and suggest tags
            function analyzeNoteContent(noteContent) {
                const suggestedTags = [];
                const content = noteContent.toLowerCase();
                let extractedContact = null;
        
                // Special handling for telephone call pattern
                const telephonePattern = /telephone call with\s+([^,\n\r.]+)/i;
                const telephoneMatch = noteContent.match(telephonePattern);
                
                if (telephoneMatch) {
                    suggestedTags.push('111'); // Telephone Call tag
                    extractedContact = telephoneMatch[1].trim();
                    console.log('Detected telephone call with contact:', extractedContact);
                }
        
                // Check for other keyword matches (but skip if we already found telephone call)
                if (!telephoneMatch) {
                    for (const [keyword, tagValue] of Object.entries(tagRules)) {
                        if (content.includes(keyword.toLowerCase())) {
                            suggestedTags.push(tagValue);
                        }
                    }
                }
        
                // Remove duplicates
                return {
                    tags: [...new Set(suggestedTags)],
                    contact: extractedContact
                };
            }
        
            // Function to apply tags to the select element and populate contact if provided
            function applyTags(tagValues, contactName = null) {
                const tagSelect = document.querySelector('select[name="data[Activity][activity_type_id][]"]');
                if (!tagSelect) {
                    console.log('Tag select element not found');
                    return;
                }
        
                // Apply the first suggested tag
                if (tagValues.length > 0) {
                    const firstTag = tagValues[0];
                    tagSelect.value = firstTag;
        
                    // Trigger change event to ensure any listeners are notified
                    const changeEvent = new Event('change', { bubbles: true });
                    tagSelect.dispatchEvent(changeEvent);
        
                    // Get the tag name for display
                    const selectedOption = tagSelect.querySelector(`option[value="${firstTag}"]`);
                    const tagName = selectedOption ? selectedOption.textContent : 'Unknown';
        
                    console.log(`Auto-applied tag: ${tagName} (${firstTag})`);
        
                    // If we have a contact name and this is a telephone call, populate the contact field
                    if (contactName && firstTag === '111') {
                        // Wait a bit for the contact field to appear after tag selection
                        setTimeout(() => {
                            populateContactField(contactName);
                        }, 500);
                    }
                    
                    // Show a visual indicator
                    showTagNotification(tagName, tagValues.length > 1 ? tagValues.length - 1 : 0, contactName);
                }
            }
        
            // Function to populate the contact field
            function populateContactField(contactName) {
                // Look for the contact input field
                const contactInput = document.querySelector('input[name="data[Activity][contact_name]"]');
                
                if (contactInput) {
                    contactInput.value = contactName;
                    
                    // Trigger input events to ensure autocomplete and other listeners are notified
                    const inputEvent = new Event('input', { bubbles: true });
                    const changeEvent = new Event('change', { bubbles: true });
                    
                    contactInput.dispatchEvent(inputEvent);
                    contactInput.dispatchEvent(changeEvent);
                    
                    // Also try triggering focus and blur to activate any autocomplete
                    contactInput.focus();
                    setTimeout(() => contactInput.blur(), 100);
                    
                    console.log(`Auto-populated contact field with: ${contactName}`);
                } else {
                    console.log('Contact input field not found - it may not be visible yet');
                    
                    // Try again after a longer delay in case the field takes time to appear
                    setTimeout(() => {
                        const delayedContactInput = document.querySelector('input[name="data[Activity][contact_name]"]');
                        if (delayedContactInput) {
                            delayedContactInput.value = contactName;
                            const inputEvent = new Event('input', { bubbles: true });
                            const changeEvent = new Event('change', { bubbles: true });
                            delayedContactInput.dispatchEvent(inputEvent);
                            delayedContactInput.dispatchEvent(changeEvent);
                            console.log(`Auto-populated contact field (delayed) with: ${contactName}`);
                        }
                    }, 1000);
                }
            }
        
            // Function to show a notification about applied tags
            function showTagNotification(appliedTag, additionalSuggestions, contactName = null) {
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #4CAF50;
                    color: white;
                    padding: 10px 15px;
                    border-radius: 4px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    max-width: 300px;
                `;
                
                let message = `Auto-applied tag: ${appliedTag}`;
                if (contactName) {
                    message += `\nContact: ${contactName}`;
                }
                if (additionalSuggestions > 0) {
                    message += ` (+${additionalSuggestions} more suggestions)`;
                }
                
                notification.textContent = message;
                notification.style.whiteSpace = 'pre-line'; // Allow line breaks
                document.body.appendChild(notification);
        
                // Remove notification after 4 seconds (longer since there's more info)
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 4000);
            }
        
            // Function to get note content from the editor
            function getNoteContent() {
                // Try multiple selectors to find the note content
                const noteEditable = document.querySelector('.note-editable');
                const textarea = document.querySelector('textarea[name="data[Activity][activity]"]');
                
                if (noteEditable) {
                    return noteEditable.textContent || noteEditable.innerText || '';
                } else if (textarea) {
                    return textarea.value || '';
                }
                
                return '';
            }
        
            // Main function to handle save button click
            function handleSaveClick(event) {
                console.log('Save button clicked, analyzing note content...');
                
                const noteContent = getNoteContent();
                console.log('Note content:', noteContent);
                
                if (noteContent.trim()) {
                    const analysis = analyzeNoteContent(noteContent);
                    console.log('Analysis result:', analysis);
                    
                    if (analysis.tags.length > 0) {
                        // Check if a tag is already selected
                        const tagSelect = document.querySelector('select[name="data[Activity][activity_type_id][]"]');
                        if (tagSelect && tagSelect.value === '0') {
                            applyTags(analysis.tags, analysis.contact);
                        } else {
                            console.log('Tag already selected, skipping auto-tagging');
                        }
                    } else {
                        console.log('No matching tags found for the note content');
                    }
                } else {
                    console.log('No note content found');
                }
            }
        
            // Function to add event listeners to save buttons
            function addSaveButtonListeners() {
                // Look for save buttons with various selectors
                const saveButtons = document.querySelectorAll([
                    'button.save-button',
                    'button[data-action="editpersonal"]',
                    '.btn.btn-primary.save-button',
                    '#case-ledger-save-and-close-button'
                ].join(', '));
        
                saveButtons.forEach(button => {
                    if (!button.hasAttribute('data-auto-tagger-attached')) {
                        button.addEventListener('click', handleSaveClick);
                        button.setAttribute('data-auto-tagger-attached', 'true');
                        console.log('Added auto-tagger listener to save button');
                    }
                });
            }
        
            // Function to initialize the script
            function init() {
                console.log('Meruscase Auto-Tagger initialized');
                addSaveButtonListeners();
                
                // Re-run listener attachment when DOM changes (for dynamically loaded content)
                const observer = new MutationObserver(() => {
                    addSaveButtonListeners();
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        
            // Initialize when DOM is ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
        
            // Add some CSS for better visual feedback
            const style = document.createElement('style');
            style.textContent = `
                .auto-tag-suggestion {
                    background-color: #e8f5e8 !important;
                    border: 2px solid #4CAF50 !important;
                }
            `;
            document.head.appendChild(style);
        
            // Expose functions for debugging/manual testing
            window.merusAutoTagger = {
                analyzeContent: analyzeNoteContent,
                applyTags: applyTags,
                getNoteContent: getNoteContent,
                populateContactField: populateContactField,
                tagRules: tagRules,
                // Test function for the telephone pattern
                testTelephonePattern: function(text) {
                    const pattern = /telephone call with\s+([^,\n\r.]+)/i;
                    const match = text.match(pattern);
                    return match ? match[1].trim() : null;
                }
            };
        
        })();
    }

// Bootstrap
    onReady(() => {
        runModules();
        // Observe panel content changes
        const panel = document.getElementById('rightPanelTabs');
        if (panel) {
            new MutationObserver(runModules).observe(panel, { childList: true, subtree: true });
        }
        hookNavigation(runModules);
    });
})();
