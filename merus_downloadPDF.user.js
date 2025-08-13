// ==UserScript==
// @name         MerusCase Quick PDF Download (Enhanced)
// @author       Jason K
// @namespace    Violentmonkey Scripts
// @version      1.1
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
    // Try MM-DD-YYYY first
    let match = text.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
    if (match) {
      return `${match[3]}.${match[1]}.${match[2]}`;
    }
    // Fallback to YYYY-MM-DD
    match = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (match) {
      return `${match[1]}.${match[2]}.${match[3]}`;
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
    const acronyms = ['QME', 'AME', 'PTP', 'MRI', 'XR', 'MMI', 'P&S', 'TTD', 'PPD', 'TD', 'PD', 'WCJ', 'WCAB'];

    // Start with a clean, lowercased version of the title
    let title = text.toLowerCase();

    // --- Perform all replacements on the lowercased string ---

    // 1. Replace the full, specific name first. This is the highest priority.
    title = title.replace(/william r\. campbell, d\.o\., qme/g, 'dr. campbell QME');
    
    // 2. Replace any other known long names or phrases
    // e.g., title = title.replace(/another long name, m\.d\./g, 'dr. othername');

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
    // Capitalize the first letter of the resulting title for consistency.
    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    
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

    // Remove date
    title = title.replace(/\b\d{2}-\d{2}-\d{4}\b/g, '').trim();
    title = title.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').trim();

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
      const clean = sanitizeFilename(`${date} - ${name} - ${processedTitle}`) + '.pdf';
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
