// ==UserScript==
// @name         MerusCase Smart Renamer
// @namespace    https://github.com/Jason-K
// @version      1.0.0
// @description  Rename files in MerusCase based on a set of rules and auto-save. Now using MerusCore for better performance and UI consistency.
// @author       Jason K.
// @match        *://*.meruscase.com/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_document-renamer.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_document-renamer.user.js
// @supportURL   https://github.com/Jason-K/Userscripts/issues
// ==/UserScript==

(function() {
    'use strict';

    // Initialize script using MerusCore
    const script = MerusCore.createScript({
        name: 'DocumentRenamer',
        version: '1.0.0'
    });

    // Extended configuration with MerusCore acronyms
    const ACRONYMS = new Set([
        ...["PT", "MD", "M.D.", "QME", "AME", "UR", "EMG", "NCV", "NCS", "MRI", "PTP", "TTD", "PPD", "PD", "RTW", "MMI", "WCAB", "XR", "C&R", "OACR", "OAC&R", "MSA", "IMR", "DME", "TD", "P&S", "F&A", "W/C", "ME", "SBR", "RTW", "MOH", "AWW", "ADL", "FCE", "VR", "VRE", "CMS", "SSA", "DOB", "AKA", "EOB", "EDD", "PR4", "PR2"],
    ]);
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

    // Undo functionality using MerusCore
    let undoData = null;
    let undoButton = null;
    let smartRenameButton = null;

    // Initialize script with MerusCore
    script.init(() => {
        if (!MerusCore.utils.isMerusCase()) return;

        console.log('MerusCase Smart Renamer initialized with MerusCore');

        // Business suffixes to remove and trigger title case (llp, inc, pc, corp, co, ltd, llc, etc.)
        const BUSINESS_SUFFIXES = /,?\s*(llp|inc\.?|pc|corp\.?|co\.?|ltd\.?|llc|pllc|p\.c\.?|l\.l\.p\.?|l\.l\.c\.?|corporation|incorporated|company|limited)$/i;

        // Doctor name patterns
        const DR_RE_1 = /\b(?:dr\.?|doctor)\s+([\w\-.', ]+?)([A-Z][a-zA-Z'-]+)\b/i;
        const DR_RE_2 = /([\w\-.', ]+?)\s+([A-Z][a-zA-Z'-]+)\s+(?:m\.?d\.?|md|d\.?o\.?|ph\.?d\.?)(?=\b|[^A-Za-z])/i;

        function normalizeBusiness(text) {
            const match = text.match(BUSINESS_SUFFIXES);
            if (match) {
                // Remove the business suffix
                const businessName = text.substring(0, match.index).trim();
                // Apply title case to business name using MerusCore
                const titleCased = MerusCore.text.titleCase(businessName, {
                    acronyms: Array.from(ACRONYMS),
                    preserveOriginal: true
                });
                return { text: titleCased, wasBusiness: true };
            }
            return { text: text, wasBusiness: false };
        }

        function extractDate(stem) {
            // Use MerusCore date parsing first
            const parsedDate = MerusCore.date.parse(stem);
            if (parsedDate) {
                const dateStr = MerusCore.date.format(parsedDate, 'YYYY.MM.DD');
                // Remove the date from the original string
                const dateRegex = /\b\d{4}[./\s_-]\d{1,2}[./\s_-]\d{1,2}\b|\b\d{1,2}[./\s_-]\d{1,2}[./\s_-]\d{4}\b|\b\d{6,8}\b/g;
                const beforeDate = stem.replace(dateRegex, '').trim().replace(/[ _-]+$/, '');
                return [beforeDate, dateStr];
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
            // First try to find the specific MerusCase upload description input using MerusCore
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

            // Use MerusCore UI system for undo button
            undoButton = MerusCore.ui.createButton({
                text: '↶ Undo',
                position: 'top-right',
                style: 'danger',
                className: 'merus-undo-pos'
            });

            // Position to the left of main button with custom CSS
            undoButton.element.style.right = '140px';

            undoButton.element.addEventListener('click', function() {
                if (undoData && undoData.input && undoData.originalValue) {
                    undoData.input.value = undoData.originalValue;

                    // Trigger events using MerusCore utilities
                    MerusCore.dom.triggerEvents(undoData.input, ['input', 'change']);

                    console.log('MerusCase Smart Renamer: Undid rename, restored "' + undoData.originalValue + '"');

                    // Show feedback using MerusCore toast
                    MerusCore.ui.showToast('Reverted to original filename', 'info', 2000);

                    // Remove undo button and clear undo data
                    removeUndoButton();
                }
            });

            document.body.appendChild(undoButton.element);
        }

        function removeUndoButton() {
            if (undoButton) {
                undoButton.remove();
                undoButton = null;
            }
            undoData = null;
        }

        function handleSmartRename() {
            // First, try to click the MerusCase rename button if it's visible
            const renameButtonClicked = findAndClickRenameButton();

            // If we clicked the rename button, wait a moment for the form to appear
            const delay = renameButtonClicked ? 200 : 0;

            setTimeout(function() {
                const targetInput = findTargetInput();

                if (!targetInput) {
                    MerusCore.ui.showToast(
                        'No suitable input field found. Please make sure you have a file description field with content.',
                        'error',
                        5000
                    );
                    return;
                }

                const originalValue = targetInput.value;
                if (!originalValue || !originalValue.trim()) {
                    MerusCore.ui.showToast('Input field is empty.', 'warning', 3000);
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

                    // Trigger events using MerusCore utilities
                    MerusCore.dom.triggerEvents(targetInput, ['input', 'change']);

                    console.log('MerusCase Smart Renamer: Renamed "' + originalValue + '" to "' + newValue + '"');

                    // Show success feedback
                    MerusCore.ui.showToast('File renamed successfully', 'success', 2000);

                    // Create undo button
                    createUndoButton();

                    // Send message to other scripts about the rename
                    MerusCore.messaging.emit('document-renamed', {
                        original: originalValue,
                        newName: newValue,
                        stem: newStem
                    });

                } catch (err) {
                    console.error("SmartRename Error:", err);
                    console.error("Original value:", originalValue);
                    console.error("Stem:", stem);
                    MerusCore.ui.showToast('Could not rename: ' + err.message, 'error', 5000);
                }
            }, delay);
        }

        // Create smart rename button using MerusCore
        smartRenameButton = MerusCore.ui.createButton({
            text: '🔧 Smart Rename',
            position: 'top-right',
            style: 'primary',
            onClick: handleSmartRename
        });

        // Initially hide the button
        smartRenameButton.element.style.display = 'none';

        document.body.appendChild(smartRenameButton.element);

        // Add cleanup for button
        script.addCleanup(() => {
            if (smartRenameButton) smartRenameButton.remove();
            if (undoButton) undoButton.remove();
        });

        // Use MerusCore Cloudflare-safe observer for rename button visibility
        const observer = MerusCore.observer.createSafeObserver(() => {
            const renameButton = document.querySelector('button.rename-button');
            const isVisible = renameButton &&
                             !renameButton.classList.contains('hidden') &&
                             renameButton.offsetParent !== null;

            if (smartRenameButton) {
                smartRenameButton.element.style.display = isVisible ? 'block' : 'none';
            }
        }, {
            delay: 3000,
            maxRetries: 5,
            autoDisconnect: 45000,
            target: document.querySelector('main') || document.body,
            observeOptions: { childList: true, subtree: false }
        });

        // Expose functions for debugging using MerusCore messaging
        MerusCore.messaging.on('debug-document-renamer', (event) => {
            const { action, data } = event.data;
            switch (action) {
                case 'transform':
                    try {
                        const result = transform(data.text);
                        console.log('Document renamer transform result:', result);
                    } catch (error) {
                        console.error('Transform error:', error.message);
                    }
                    break;
                case 'extract-date':
                    try {
                        const result = extractDate(data.text);
                        console.log('Date extraction result:', result);
                    } catch (error) {
                        console.error('Date extraction error:', error.message);
                    }
                    break;
                case 'normalize-doctor':
                    const result = normalizeDoctor(data.text);
                    console.log('Doctor normalization result:', result);
                    break;
            }
        });

        // Expose functions for debugging via global object
        window.merusDocumentRenamer = {
            transform: transform,
            extractDate: extractDate,
            normalizeDoctor: normalizeDoctor,
            pickDocType: pickDocType,
            normalizeBusiness: normalizeBusiness
        };
    });

})();
