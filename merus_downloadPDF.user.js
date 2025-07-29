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

  function extractDateFromTitle(title) {
    const dateMatch = title.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (dateMatch) {
      const [_, year, month, day] = dateMatch;
      return `${year}.${month}.${day}`;
    }
    return "Undated";
  }

  function extractFormattedName(rawTitle) {
    try {
      const match = rawTitle.split(" v.")[0];
      const [last, first] = match.replace("DECEASED", "").split(",").map(s => s.trim()).filter(Boolean);
      return first && last ? `${first} ${last}` : "Unknown Case";
    } catch {
      return "Unknown Case";
    }
  }

  function sanitizeFilename(str) {
    return str.replace(/[\/:*?"<>|]/g, "-");
  }

  function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: #323232;
      color: #fff;
      padding: 10px 15px;
      border-radius: 5px;
      z-index: 10001;
      box-shadow: 2px 2px 10px rgba(0,0,0,0.4);
      font-size: 14px;
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

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "🐞";
    toggleBtn.title = "Toggle Debug Panel";
    toggleBtn.style.cssText = `
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
    toggleBtn.onclick = () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };

    document.body.appendChild(panel);
    document.body.appendChild(toggleBtn);
  }

  function logDebug(message) {
    const panel = document.getElementById("merus-debug-panel");
    if (panel) {
      const p = document.createElement("div");
      p.textContent = `[${new Date().toISOString()}] ${message}`;
      panel.appendChild(p);
      panel.scrollTop = panel.scrollHeight;
    }
    console.log(message);
  }

  function addDownloadButton(downloadLink, docTitleEl, caseNameEl) {
    if (document.getElementById("quick-download-btn")) return;

    const btn = document.createElement("button");
    btn.innerText = "QUICK DOWNLOAD";
    btn.id = "quick-download-btn";
    btn.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10000;
      background: #2a7ae2;
      color: white;
      border: none;
      padding: 10px 15px;
      font-size: 14px;
      border-radius: 5px;
      cursor: pointer;
      box-shadow: 2px 2px 6px rgba(0,0,0,0.2);
    `;

    btn.onclick = async () => {
      const originalTitle = docTitleEl?.innerText?.trim();
      const caseTitle = caseNameEl?.getAttribute("title") || caseNameEl?.innerText;
      const downloadHref = downloadLink?.getAttribute("href");

      logDebug(`Original title: ${originalTitle}`);
      logDebug(`Case title: ${caseTitle}`);
      logDebug(`Download href: ${downloadHref}`);

      if (!originalTitle || !caseTitle || !downloadHref) {
        showToast("Missing elements for download");
        logDebug("Aborted: missing document title or case info");
        return;
      }

      const datePrefix = extractDateFromTitle(originalTitle);
      const formattedName = extractFormattedName(caseTitle);
      const newFilename = sanitizeFilename(`${datePrefix} - ${formattedName} - ${originalTitle}`);

      try {
        await navigator.clipboard.writeText(newFilename);
        showToast("Filename copied to clipboard");
        logDebug("Filename copied: " + newFilename);
      } catch (e) {
        showToast("Clipboard copy failed");
        logDebug("Clipboard copy error: " + e.message);
      }

      const fullUrl = new URL(downloadHref, window.location.origin).href;
      window.open(fullUrl, '_blank');
      showToast("Opened download in new tab");
    };

    document.body.appendChild(btn);
  }

  function init() {
    setupDebugPanel();
    waitForElement('a[aria-label="Download Document"]', (downloadLink) => {
      waitForElement('h5 span', (docTitleEl) => {
        waitForElement('.pretty-name-span', (caseNameEl) => {
          addDownloadButton(downloadLink, docTitleEl, caseNameEl);
        });
      });
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 500);
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();