// ==UserScript==
// @name         MerusCase Quick PDF Download (Enhanced)
// @namespace    Violentmonkey Scripts
// @version      1.1
// @description  Adds a QUICK DOWNLOAD button with smart renaming, UI feedback, and debug panel on MerusCase
// @match        https://*.meruscase.com/*
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_downloadPDF.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_downloadPDF.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- Utility Functions ---

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
    let candidate = document.querySelector('.pretty-name-span');
    if (candidate && candidate.textContent.includes(',')) {
      const [last, first] = candidate.textContent.replace("DECEASED", "").split(',').map(x => x.trim());
      return first && last ? `${first} ${last}` : 'Unknown Case';
    }

    // Fallback: try case caption header
    const caption = [...document.querySelectorAll("span, h1, h2")].find(e => e.textContent.includes(" v. "));
    if (caption) {
      const [left] = caption.textContent.split(" v.");
      const [last, first] = left.replace("DECEASED", "").split(',').map(s => s.trim());
      return first && last ? `${first} ${last}` : 'Unknown Case';
    }

    return 'Unknown Case';
  }

  function extractTitle() {
    // Primary: title span inside h5
    const el = document.querySelector('h5 span');
    if (el && el.textContent.includes('.pdf')) return el.textContent.trim();

    // Fallbacks:
    const alt = [...document.querySelectorAll('span, h1, h2')]
      .map(e => e.textContent.trim())
      .find(t => t.toLowerCase().includes('.pdf'));
    return alt || 'Untitled Document';
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

  // --- Main UI & Actions ---

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

  // Launch on DOM ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 500);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();