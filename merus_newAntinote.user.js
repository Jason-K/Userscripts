// ==UserScript==
// @name         MerusCase → Antinote (Client Note Button)
// @namespace    jjk.merus.antinote
// @version      0.1.0
// @description  Adds a floating button on MerusCase pages to create an Antinote using the page’s client name.
// @match        https://meruscase.com/*
// @match        https://*.meruscase.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  // ---------- UX: styles ----------
  GM_addStyle(`
    .jjk-antinote-btn {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 999999;
      padding: 10px 14px;
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(0,0,0,.18);
      background: #1f6feb;
      color: #fff !important;
      font: 600 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      letter-spacing: .2px;
      cursor: pointer;
      border: none;
      opacity: .95;
    }
    .jjk-antinote-btn:hover { opacity: 1; }
    .jjk-antinote-toast {
      position: fixed;
      right: 18px;
      bottom: 70px;
      background: rgba(30,30,30,.95);
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      font: 12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      z-index: 999999;
      box-shadow: 0 6px 20px rgba(0,0,0,.25);
      max-width: 380px;
      word-break: break-word;
    }
  `);

  // ---------- Utilities ----------
  const fmtShortDate = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  };

  // Extract "First Last" from DOM:
  // <h1 id="lpClientName"><span class="pretty-name-span" title="Chavez, Guillermo v. UPS">...</span></h1>
  const getClientFirstLast = () => {
    const el = document.querySelector('#lpClientName span.pretty-name-span');
    if (!el) return '';
    const raw = (el.getAttribute('title') || el.textContent || '').trim();
    if (!raw) return '';
    // Take the part before " v. "
    const namePart = raw.split(' v. ')[0].trim(); // e.g., "Chavez, Guillermo"
    const pieces = namePart.split(',').map(s => s.trim()).filter(Boolean);
    if (pieces.length < 2) {
      return namePart; // fallback: unknown format
    }
    const last = pieces[0];
    const firstAndMiddles = pieces.slice(1).join(' '); // handles "First Middle"
    return `${firstAndMiddles} ${last}`.replace(/\s+/g, ' ').trim();
  };

  const buildContent = (client, issue, dateStr) =>
    `**CLIENT**:\t\t${client}\n` +
    `**DATE**:\t\t${dateStr}\n` +
    `**ISSUE**:\t\t${issue || ''}\n\n` +
    `# `;

  const openAntinoteURL = (url) => {
    // Use an invisible iframe to avoid page navigation
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    // Clean up later
    setTimeout(() => iframe.remove(), 5000);
  };

  const toast = (msg, ms = 2500) => {
    const div = document.createElement('div');
    div.className = 'jjk-antinote-toast';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => { div.remove(); }, ms);
  };

  // ---------- Button & logic ----------
  const ensureButton = () => {
    if (document.querySelector('.jjk-antinote-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'jjk-antinote-btn';
    btn.type = 'button';
    btn.textContent = 'Create Antinote';

    btn.addEventListener('click', async () => {
      const urlOk = location.hostname.includes('meruscase.com');
      if (!urlOk) {
        toast('Not a MerusCase page.');
        return;
      }

      const client = getClientFirstLast();
      if (!client) {
        toast('Could not read client name from page.');
        return;
      }

      // Optional prompts (you can disable these if you prefer zero UI)
      const lastIssue = GM_getValue('lastIssue', '');
      const issue = window.prompt('Issue (optional):', lastIssue) ?? '';
      GM_setValue('lastIssue', issue);

      // Title default: "<Client> – <Issue>" if issue present; else "<Client>"
      const suggestedTitle = issue ? `${client} – ${issue}` : client;
      const lastTitle = GM_getValue('lastTitle', suggestedTitle);
      const title = window.prompt('Title (optional):', lastTitle) ?? '';
      GM_setValue('lastTitle', title);

      const lastTags = GM_getValue('lastTags', '');
      const tags = window.prompt('Tags (comma-separated, optional):', lastTags) ?? '';
      GM_setValue('lastTags', tags);

      const dateStr = fmtShortDate();
      const content = buildContent(client, issue, dateStr);

      let url = `antinote://x-callback-url/createNote?content=${encodeURIComponent(content)}`;
      if (title) url += `&title=${encodeURIComponent(title)}`;
      if (tags) url += `&tags=${encodeURIComponent(tags)}`;

      try {
        openAntinoteURL(url);
        toast(`Antinote requested for: ${client}`);
      } catch (e) {
        toast('Could not open Antinote. URL copied to clipboard.');
        try {
          GM_setClipboard(url, { type: 'text' });
        } catch {}
      }
    });

    document.body.appendChild(btn);
  };

  // Initial and reactive injection (MerusCase uses SPA-like navigation)
  const init = () => {
    ensureButton();
    // Re-inject on DOM changes (debounced)
    let pending = null;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        ensureButton();
      }, 300);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  };

  // Keyboard shortcut: Alt+Shift+A opens the note flow
  const keyHandler = (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyA') {
      const btn = document.querySelector('.jjk-antinote-btn');
      if (btn) btn.click();
    }
  };

  // Menu command to toggle prompts later (placeholder)
  GM_registerMenuCommand('Create Antinote now', () => {
    const btn = document.querySelector('.jjk-antinote-btn');
    if (btn) btn.click();
  });

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
  window.addEventListener('keydown', keyHandler, false);
})();**CLIENT**:		
**DATE**:		September 19, 2025
**ISSUE**:		

# 