// ==UserScript==
// @name         MerusCase Smart Renamer
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Rename files in MerusCase based on a set of rules.
// @author       GitHub Copilot
// @match        *://*.meruscase.com/*
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
        [/\breport\b/i, "medical"],
    ];
    const UR_SUBTYPE_RE = /\b(approval|denial|mod)\b/i;
    const DATE_RE = /(\d{1,2})-(\d{1,2})-(\d{2,4})(?:_\d+)?$/;
    const DR_RE_1 = /\b(?:dr\.?|doctor)\s+([\w\-.', ]+?)([A-Z][a-zA-Z'-]+)\b/i;
    const DR_RE_2 = /([\w\-.', ]+?)\s+([A-Z][a-zA-Z'-]+)\s+(?:m\.?d\.?|md|d\.?o\.?|ph\.?d\.?)(?=\b|[^A-Za-z])/i;

    function extractDate(stem) {
        const m = stem.match(DATE_RE);
        if (!m) {
            throw new Error("no date found");
        }
        let [_, month, day, year] = m.slice(1).map(Number);
        if (year < 100) {
            year += (year < 50) ? 2000 : 1900;
        }
        const dateObj = new Date(year, month - 1, day);
        const newDate = dateObj.toISOString().slice(0, 10).replace(/-/g, '.');
        return [stem.substring(0, m.index).trim().replace(/[ _-]+$/, ''), newDate];
    }

    function normalizeDoctor(text) {
        for (const pat of [DR_RE_1, DR_RE_2]) {
            const m = text.match(pat);
            if (!m) {
                continue;
            }
            const last = m[2].replace(",", "").trim();
            const capitalizedLast = last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
            const doctor = `Dr. ${capitalizedLast}`;
            const newText = (text.substring(0, m.index) + text.substring(m.index + m[0].length)).replace(/^[-–\s]+/, '').replace(/\s\s+/g, ' ');
            return [newText, doctor];
        }
        return [text, null];
    }

    function pickDocType(txt) {
        for (const [expr, kind] of DOC_TYPE_RULES) {
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
        return line.split(/(\W+)/).filter(Boolean).map((t, i) => (i % 2 === 0) ? protectCase(t) : t).join('');
    }

    function finalCleanup(name) {
        let txt = name;
        for (const [wrong, right] of Object.entries(CORRECTIONS)) {
            txt = txt.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), right);
        }
        txt = txt.replace(/\s*–\s*/g, ' – ');
        txt = txt.replace(/\s{2,}/g, ' ');
        txt = txt.replace(/\.{2,}/g, '.');
        return txt.trim().replace(/[-_]$/, '');
    }

    function transform(stem) {
        let [remainder, dateStr] = extractDate(stem);
        remainder = remainder.replace(/\bRe\b/gi, ' – ');
        let [newRemainder, doctor] = normalizeDoctor(remainder);
        remainder = newRemainder;

        const docType = pickDocType(remainder);

        const descriptionParts = [];
        if (docType === "UR") {
            const subM = remainder.match(UR_SUBTYPE_RE);
            if (subM) {
                descriptionParts.push(subM[1].toLowerCase());
            }
            const afterDash = remainder.includes(' – ') ? remainder.split(' – ')[1] : remainder;
            if (afterDash) {
                descriptionParts.push(afterDash.trim().replace(/[-]$/, ''));
            }
        } else if (docType === "notice") {
            descriptionParts.push("appointment");
        } else {
            descriptionParts.push(remainder);
        }

        const finalParts = [dateStr, docType];
        const processedDescription = smartCase(descriptionParts.join(' – '));
        finalParts.push(processedDescription);

        if (docType === "notice" && doctor) {
            finalParts[finalParts.length - 1] += ` with ${doctor}`;
        } else if (docType === "medical" && doctor) {
            finalParts.push(doctor);
        }

        const joined = finalParts.filter(p => p).join(' – ');
        return finalCleanup(joined);
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

        button.addEventListener('click', () => {
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                const originalValue = activeElement.value;
                if (!originalValue) {
                    alert('Input field is empty.');
                    return;
                }
                const path = originalValue;
                const stem = path.includes('.') ? path.substring(0, path.lastIndexOf('.')) : path;
                const ext = path.includes('.') ? path.substring(path.lastIndexOf('.')) : '';

                try {
                    const newStem = transform(stem);
                    activeElement.value = `${newStem}${ext}`;
                } catch (err) {
                    console.error("SmartRename Error:", err);
                    alert(`Could not rename: ${err.message}`);
                }
            } else {
                alert('Please select an input field first.');
            }
        });

        document.body.appendChild(button);
    }

    createButton();
})();
