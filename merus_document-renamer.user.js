// ==UserScript==
// @name         MerusCase Smart Renamer
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Rename files in MerusCase based on a set of rules and auto-save.
// @author       Jason K.
// @match        *://*.meruscase.com/*
// @downloadURL  https://github.com/Jason-K/Userscripts/raw/refs/heads/main/merus_document-renamer.user.js
// @updateURL    https://github.com/Jason-K/Userscripts/raw/refs/heads/main/merus_document-renamer.user.js
// @supportURL   https://github.com/Jason-K/Userscripts/issues
// @grant        none
// ==/UserScript==

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

    // An array of regular expressions to match different date formats.
    // Each object includes the regex and the positions of year, month, and day in the match.
    const DATE_REGEXES = [
        // Format: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, etc.
        { regex: /\b(?<year>\d{4})([./\s_-])(?<month>\d{1,2})\2(?<day>\d{1,2})\b/, groups: { year: 'year', month: 'month', day: 'day' } },
        // Format: MM-DD-YYYY, M-D-YYYY, etc.
        { regex: /\b(?<month>\d{1,2})([./\s_-])(?<day>\d{1,2})\2(?<year>\d{4})\b/, groups: { year: 'year', month: 'month', day: 'day' } },
        // Format: MM-DD-YY, M-D-YY, etc.
        { regex: /\b(?<month>\d{1,2})([./\s_-])(?<day>\d{1,2})\2(?<year>\d{2})\b/, groups: { year: 'year', month: 'month', day: 'day' } },
        // Format: YYYYMMDD (no separator)
        { regex: /\b(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})\b/, groups: { year: 'year', month: 'month', day: 'day' } },
        // Format: MMDDYYYY (no separator)
        { regex: /\b(?<month>\d{2})(?<day>\d{2})(?<year>\d{4})\b/, groups: { year: 'year', month: 'month', day: 'day' } },
        // Format: MMDDYY (no separator)
        { regex: /\b(?<month>\d{2})(?<day>\d{2})(?<year>\d{2})\b/, groups: { year: 'year', month: 'month', day: 'day' } }
    ];

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
        for (const { regex, groups } of DATE_REGEXES) {
            const m = stem.match(regex);
            if (m && m.groups) {
                let year = parseInt(m.groups[groups.year]);
                let month = parseInt(m.groups[groups.month]);
                let day = parseInt(m.groups[groups.day]);

                if (year < 100) {
                    year += (year < 50) ? 2000 : 1900;
                }

                // Basic date validation
                if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                    const dateObj = new Date(year, month - 1, day);
                    // Check if the date is valid (e.g., not Feb 30)
                    if (dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day) {
                        const newDate = dateObj.toISOString().slice(0, 10).replace(/-/g, '.');
                        const beforeDate = stem.substring(0, m.index).trim().replace(/[ _-]+$/, '');
                        return [beforeDate, newDate];
                    }
                }
            }
        }
        throw new Error("no date found");
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
        button.id = 'smart-rename-button'; // Add an ID for easier selection
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
        button.style.display = 'none'; // Initially hide the button

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
        observeRenameButton(); // Start observing for the rename button
    }

    function observeRenameButton() {
        const smartRenameButton = document.getElementById('smart-rename-button');

        const toggleSmartRenameButton = () => {
            const renameButton = document.querySelector('button.rename-button');
            // Check if the button exists, is not explicitly hidden by a class, and is actually visible on the page.
            const isVisible = renameButton && !renameButton.classList.contains('hidden') && renameButton.offsetParent !== null;
            smartRenameButton.style.display = isVisible ? 'block' : 'none';
        };

        const observer = new MutationObserver(toggleSmartRenameButton);

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        // Perform an initial check in case the button is already on the page
        toggleSmartRenameButton();
    }

    // Wait for page to load before creating button
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createButton);
    } else {
        createButton();
    }
})();