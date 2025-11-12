// ==UserScript==
// @name         MerusCase Quick PDF Download (Enhanced)
// @author       Jason K
// @namespace    https://github.com/Jason-K
// @version      2.0.0
// @description  Enhanced PDF download with smart renaming using MerusCore for better UI consistency and performance.
// @match        https://*.meruscase.com/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_downloadPDF.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Initialize script using MerusCore
  const script = MerusCore.createScript({
    name: 'PDFDownloader',
    version: '2.0.0'
  });

  script.init(() => {
    if (!MerusCore.utils.isMerusCase()) return;

    console.log('MerusCase PDF Downloader initialized with MerusCore');

    let debugPanel = null;
    let debugToggle = null;

    // Debug panel with MerusCore styling
    function setupDebugPanel() {
      debugPanel = document.createElement("div");
      debugPanel.id = "merus-debug-panel";
      debugPanel.style.cssText = `
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

      debugToggle = document.createElement("button");
      debugToggle.textContent = "🐞";
      debugToggle.style.cssText = `
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
      debugToggle.onclick = () => {
        debugPanel.style.display = debugPanel.style.display === "none" ? "block" : "none";
      };

      document.body.appendChild(debugPanel);
      document.body.appendChild(debugToggle);

      // Add cleanup
      script.addCleanup(() => {
        if (debugPanel) debugPanel.remove();
        if (debugToggle) debugToggle.remove();
      });
    }

    function logDebug(message) {
      if (debugPanel) {
        const line = document.createElement("div");
        line.textContent = `[${new Date().toISOString()}] ${message}`;
        debugPanel.appendChild(line);
        debugPanel.scrollTop = debugPanel.scrollHeight;
      }
      console.log(`PDF Downloader: ${message}`);
    }

    // Use MerusCore date parsing
    function extractDateFromText(text) {
      const parsedDate = MerusCore.date.parse(text);
      if (parsedDate) {
        return MerusCore.date.format(parsedDate, 'YYYY.MM.DD');
      }
      return 'Undated';
    }

    // Use MerusCore DOM utilities for case name extraction
    function extractCaseName() {
      const caseName = MerusCore.dom.extractCaseName();
      if (caseName) {
        // Handle the "Last, First" format
        if (caseName.includes(',')) {
          const [last, first] = caseName.replace("DECEASED", "").split(',').map(x => x.trim());
          return first && last ? `${first} ${last}` : caseName;
        }
        return caseName;
      }

      // Fallback to looking for "v." pattern
      const caption = [...document.querySelectorAll("span, h1, h2")].find(e => e.textContent.includes(" v. "));
      if (caption) {
        const [left] = caption.textContent.split(" v.");
        const [last, first] = left.replace("DECEASED", "").split(',').map(s => s.trim());
        return first && last ? `${first} ${last}` : 'Unknown Case';
      }

      return 'Unknown Case';
    }

    // Enhanced title processing using MerusCore text utilities
    function processTitle(text) {
      const medicalAcronyms = ['C&R', 'OACR', 'OAC&R', 'MSA', 'QME', 'AME', 'PTP', 'MRI', 'XR', 'MMI', 'P&S', 'TTD', 'PPD', 'TD', 'PD', 'WCJ', 'WCAB'];

      // Use MerusCore text title case with medical acronym preservation
      let title = MerusCore.text.titleCase(text, {
        acronyms: medicalAcronyms,
        preserveOriginal: true
      });

      // Specific doctor name replacements
      title = title.replace(/william r\. campbell, d\.o\., qme/gi, 'Dr. Campbell QME');

      // Clean up spacing and punctuation using MerusCore utilities
      title = MerusCore.text.normalizeWhitespace(title);

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

      // Remove date patterns using MerusCore date extraction
      const parsedDate = MerusCore.date.parse(title);
      if (parsedDate) {
        // Remove date patterns that were successfully parsed
        title = title.replace(/\b\d{4}[\.\-\/\s]\d{1,2}[\.\-\/\s]\d{1,2}\b/g, '').trim();
        title = title.replace(/\b\d{1,2}[\.\-\/\s]\d{1,2}[\.\-\/\s]\d{2,4}\b/g, '').trim();
      }

      // Process the title using the enhanced function
      title = processTitle(title);

      return title;
    }

    function extractDownloadHref() {
      const el = document.querySelector('a[aria-label="Download Document"]');
      return el?.getAttribute('href') || '';
    }

    // Use MerusCore text utilities for filename sanitization
    function sanitizeFilename(str) {
      return str.replace(/[\/:*?"<>|]/g, "-");
    }

    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        MerusCore.ui.showToast("Filename copied to clipboard", 'success', 2000);
        logDebug("Clipboard copied: " + text);
      } catch (e) {
        MerusCore.ui.showToast("Clipboard error", 'error', 3000);
        logDebug("Clipboard error: " + e.message);
      }
    }

    function runFilenameLogic(titleEl = null) {
      // Use provided title element or find one
      const element = titleEl || document.querySelector('div.box-view h5 span');
      if (!element) {
        logDebug("Could not find title element for filename logic.");
        return "Untitled Document.pdf";
      }

      const originalTitle = element.textContent;
      const processedTitle = extractTitle();
      const date = extractDateFromText(originalTitle);
      const name = extractCaseName();

      // Generate clean filename
      const clean = sanitizeFilename(`${date} - ${name} - ${processedTitle}`);
      const filename = clean.endsWith('.pdf') ? clean : `${clean}.pdf`;

      logDebug(`Computed filename: ${filename}`);
      return filename;
    }

    function handleDownloadClick(event) {
      event.preventDefault();
      event.stopPropagation();

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
        MerusCore.ui.showToast("Download started", 'info', 2000);
        logDebug("Opened: " + url);

        // Send message to other scripts about the download
        MerusCore.messaging.emit('pdf-download', {
          filename: filename,
          url: url,
          timestamp: Date.now()
        });
      } else {
        MerusCore.ui.showToast("No download URL found", 'error', 3000);
        logDebug("No href available");
      }
    }

    function init() {
      setupDebugPanel();
      logDebug("PDF Downloader initialized");

      // Process existing buttons first
      const existingButtons = document.querySelectorAll('a[aria-label="Download Document"]:not([data-enhanced])');
      existingButtons.forEach(btn => {
        btn.setAttribute('data-enhanced', 'true');
        btn.addEventListener('click', handleDownloadClick);
      });
      logDebug(`Processed ${existingButtons.length} existing download buttons.`);

      // Use event delegation instead of MutationObserver (Cloudflare-safe)
      const clickHandler = function(e) {
        const downloadBtn = e.target.closest('a[aria-label="Download Document"]');
        if (downloadBtn && !downloadBtn.hasAttribute('data-enhanced')) {
          downloadBtn.setAttribute('data-enhanced', 'true');
          downloadBtn.addEventListener('click', handleDownloadClick);
          logDebug('Enhanced download button via event delegation');
        }
      };

      document.body.addEventListener('click', clickHandler, true);
      script.addCleanup(() => {
        document.body.removeEventListener('click', clickHandler, true);
      });

      logDebug("Using event delegation for download buttons (no MutationObserver).");
    }

    // Initialize the script
    init();

    // Expose functions for debugging using MerusCore messaging
    MerusCore.messaging.on('debug-pdf-downloader', (event) => {
      const { action, data } = event.data;
      switch (action) {
        case 'extract-filename':
          const filename = runFilenameLogic();
          console.log('PDF Downloader - Generated filename:', filename);
          break;
        case 'extract-date':
          const date = extractDateFromText(data.text);
          console.log('PDF Downloader - Extracted date:', date);
          break;
        case 'extract-case':
          const caseName = extractCaseName();
          console.log('PDF Downloader - Case name:', caseName);
          break;
        case 'process-title':
          const processedTitle = processTitle(data.text);
          console.log('PDF Downloader - Processed title:', processedTitle);
          break;
      }
    });

    // Expose functions for debugging via global object
    window.merusPDFDownloader = {
      extractDateFromText: extractDateFromText,
      extractCaseName: extractCaseName,
      processTitle: processTitle,
      extractTitle: extractTitle,
      runFilenameLogic: runFilenameLogic
    };
  });

})();
