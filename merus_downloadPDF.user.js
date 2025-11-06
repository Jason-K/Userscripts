// ==UserScript==
// @name         MerusCase Quick PDF Download (Enhanced)
// @author       Jason K
// @namespace    Violentmonkey Scripts
// @version      1.3
// @description  Adds a QUICK DOWNLOAD button with smart renaming, UI feedback, and debug panel on MerusCase
// @match        https://*.meruscase.com/*
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_downloadPDF.user.js
// @grant        none
// ==/UserScript==

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
    let match;

    // Regex for YYYY-MM-DD, YYYY.MM.DD, etc.
    match = text.match(/\b(\d{4})([\.\-\/\s])(\d{1,2})\2(\d{1,2})\b/);
    if (match) {
        const year = match[1];
        const month = match[3].padStart(2, '0');
        const day = match[4].padStart(2, '0');
        return `${year}.${month}.${day}`;
    }

    // Regex for M/D/YY, M/D/YYYY, etc. with various dividers
    match = text.match(/\b(\d{1,2})([\.\-\/\s])(\d{1,2})\2(\d{2,4})\b/);
    if (match) {
        let year = match[4];
        if (year.length === 2) {
            year = '20' + year;
        }
        const month = match[1].padStart(2, '0');
        const day = match[3].padStart(2, '0');
        return `${year}.${month}.${day}`;
    }

    return 'Undated';
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

  function processTitle(text) {
    const acronyms = ['C&R', 'OACR', 'OAC&R', 'MSA','QME', 'AME', 'PTP', 'MRI', 'XR', 'MMI', 'P&S', 'TTD', 'PPD', 'TD', 'PD', 'WCJ', 'WCAB'];

    // Start with a clean, lowercased version of the title
    let title = text.toLowerCase();

    // --- Perform all replacements on the lowercased string ---

    // 1. Replace the full, specific name first, with correct capitalization.
    title = title.replace(/william r\. campbell, d\.o\., qme/g, 'Dr. Campbell QME');

    // 2. Replace any other known long names or phrases
    // e.g., title = title.replace(/another long name, m\.d\./g, 'Dr. Othername');

    // 3. Replace general terms like "report"
    title = title.replace(/\breport\b/g, 'report');

    // 4. Restore all acronyms to their uppercase form
    for (const acronym of acronyms) {
      const regex = new RegExp(`\\b${acronym.toLowerCase()}\\b`, 'g');
      title = title.replace(regex, acronym);
    }

    // --- Final Cleanup ---
    // Remove any trailing punctuation that might be left over
    title = title.replace(/[.,\s]+$/, '').trim();
    // Remove extra spaces
    title = title.replace(/\s+/g, ' ');

    return title;
  }


  function extractTitle() {
    const spanCandidates = [...document.querySelectorAll('div.box-view h5 span')];
    const titleEl = spanCandidates.find(el => el.textContent.toLowerCase().endsWith('.pdf'));
    if (!titleEl) {
      return 'Untitled Document';
    }

    let title = titleEl.textContent.trim();
    // Remove file extension
    title = title.replace(/\.pdf$/i, '');

    // Remove date patterns
    title = title.replace(/\b\d{4}[\.\-\/\s]\d{1,2}[\.\-\/\s]\d{1,2}\b/g, '').trim(); // YYYY-M-D
    title = title.replace(/\b\d{1,2}[\.\-\/\s]\d{1,2}[\.\-\/\s]\d{2,4}\b/g, '').trim(); // M-D-YY(YY)

    // Process the title using the new unified function
    title = processTitle(title);

    // Clean up extra spaces and punctuation
    title = title.replace(/\s+/g, ' ').trim();

    return title;
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

  function runFilenameLogic() {
    const titleEl = document.querySelector('div.box-view h5 span');
    if (!titleEl) {
      logDebug("Could not find title element for filename logic.");
      return "Untitled Document.pdf";
    }
    const originalTitle = titleEl.textContent;
    const processedTitle = extractTitle();
    const date = extractDateFromText(originalTitle);
    const name = extractCaseName();
    // Ensure the final filename has the .pdf extension added once.
    const clean = sanitizeFilename(`${date} - ${name} - ${processedTitle}`) ;
    logDebug(`Computed filename: ${clean}`);
    return clean;
  }

  function handleDownloadClick(event) {
    event.preventDefault();
    event.stopPropagation(); // Stop the event from bubbling up and triggering other listeners.

    const downloadBtn = event.currentTarget;

    // Find the correct title element relative to the clicked button
    const itemContainer = downloadBtn.closest('.list-group-item');
    const titleEl = itemContainer ? itemContainer.querySelector('h5 span') : document.querySelector('div.box-view h5 span');

    if (!titleEl) {
        logDebug("Could not find title element for this download button.");
        // Fallback to original behavior if title isn't found
        const href = downloadBtn.getAttribute('href');
        if (href) window.open(new URL(href, window.location.origin).href, "_blank");
        return;
    }

    const filename = runFilenameLogic(titleEl);
    copyToClipboard(filename);

    const href = downloadBtn.getAttribute('href');
    const url = href ? new URL(href, window.location.origin).href : null;

    if (url) {
      window.open(url, "_blank");
      showToast("Filename copied & download started");
      logDebug("Opened: " + url);
    } else {
      showToast("No download URL found");
      logDebug("No href available");
    }
  }

  function init() {
    setupDebugPanel();

    // Process existing buttons first
    const existingButtons = document.querySelectorAll('a[aria-label="Download Document"]:not([data-enhanced])');
    existingButtons.forEach(btn => {
        btn.setAttribute('data-enhanced', 'true');
        btn.addEventListener('click', handleDownloadClick);
    });
    logDebug(`Processed ${existingButtons.length} existing download buttons.`);

    // Use throttled MutationObserver for dynamically added buttons
    let observerThrottle = null;
    let observerCheckCount = 0;
    const maxObserverChecks = 10; // Disconnect after 10 checks

    const observer = new MutationObserver((mutationsList, obs) => {
        // Throttle to max once per 3 seconds to prevent rate limiting
        if (observerThrottle) return;
        observerThrottle = setTimeout(() => { observerThrottle = null; }, 3000);

        const downloadButtons = document.querySelectorAll('a[aria-label="Download Document"]:not([data-enhanced])');
        if (downloadButtons.length > 0) {
            logDebug(`Found ${downloadButtons.length} new download buttons.`);
            downloadButtons.forEach(btn => {
                btn.setAttribute('data-enhanced', 'true');
                btn.addEventListener('click', handleDownloadClick);
            });
        }

        observerCheckCount++;
        // Stop observing after establishing initial button handlers
        if (observerCheckCount >= maxObserverChecks) {
            observer.disconnect();
            logDebug('MutationObserver disconnected after reaching max checks.');
        }
    });

    // Only observe childList changes on body, not subtree
    observer.observe(document.body, { childList: true, subtree: false });
    logDebug("Throttled MutationObserver is now watching for download buttons.");
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 500);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
