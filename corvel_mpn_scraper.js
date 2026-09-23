// ==UserScript==
// @name         CareMC PPO Provider Directory Scraper
// @namespace    jjk-workers-comp
// @version      3.0.0
// @description  Scrapes all pages of a CareMC provider directory and exports CSV
// @match        https://app.caremc.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  const CARD_SEL    = 'div.providerResultsProvider';
  const STORAGE_KEY = 'jjk_caremc_rows';
  const STATE_KEY   = 'jjk_caremc_state';
  const PAGE_KEY    = 'jjk_caremc_page';
  const FILENAME    = 'caremc_providers.csv';

  // ── Text helpers ──────────────────────────────────────────────────────────

  function clean(el) {
    return el ? el.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
  }

  // ── Field parsers ─────────────────────────────────────────────────────────

  function parseName(card) {
    // <b class="ppoCustom_TextSizeLarge providerName">Calvo, Donald A </b>
    // <b class="ppoCustom_TextSizeLarge"> &nbsp;MD</b>
    const bTags      = card.querySelectorAll('b.ppoCustom_TextSizeLarge');
    const name       = bTags[0] ? clean(bTags[0]) : '';
    const credentials = bTags[1] ? clean(bTags[1]) : '';
    return { name, credentials };
  }

  function parseSpecialtyClinic(card) {
    // col-sm-3 ppoCustom_TextColorBlue > div.ppoCustom_TextSizeMedium
    const medDiv  = card.querySelector('div.ppoCustom_TextSizeMedium');
    if (!medDiv) return { specialty: '', clinic: '' };

    const italDiv = medDiv.querySelector('div[style*="font-style:italic"]');
    const spec    = italDiv ? clean(italDiv) : '';

    // Clinic: text nodes directly in medDiv (after the italic div)
    const clone   = medDiv.cloneNode(true);
    clone.querySelector('div[style*="font-style:italic"]')?.remove();
    // Also remove the mobile-only <br> wrapper divs
    clone.querySelectorAll('div.hidden-sm').forEach(el => el.remove());
    const clinic  = clone.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return { specialty: spec, clinic };
  }

    function parseAddress(card) {
    const addrCol = card.querySelector('div.ppoCustom_TextSizeSmall.ppoCustom_TextColorBlue');
    const bold    = addrCol?.querySelector('b');
    if (!bold) return { address1: '', city: '', state: '', zip: '', distance: '' };

    const lines = [];
    bold.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (t) lines.push(t);
      }
    });

    const address1Raw = lines[0] || '';
    const cityRaw     = lines.slice(1).join(' ').replace(/\s+/g, ' ').trim();
    const m           = cityRaw.match(/^(.+?),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);

    // Distance: text node sibling of <b> inside addrCol, matches "14.9 miles"
    let distance = '';
    addrCol.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        const dm = t.match(/^([\d.]+)\s*miles?$/i);
        if (dm) distance = dm[1];
      }
    });

    const address1 = normalizeAddress(titleCase(address1Raw));
    if (m) {
      return {
        address1,
        city:     titleCase(m[1].replace(/,$/, '').trim()),
        state:    m[2].toUpperCase(),
        zip:      m[3],
        distance,
      };
    }
    return { address1, city: titleCase(cityRaw), state: '', zip: '', distance };
  }

  function parsePhone(card) {
    // col-sm-2 ppoCustom_TextSizeMedium ppoCustom_TextColorBlue > <b>(xxx) xxx-xxxx</b>
    const phoneCol = card.querySelector('div.ppoCustom_TextSizeMedium.ppoCustom_TextColorBlue');
    const bold     = phoneCol?.querySelector('b');
    return bold ? clean(bold) : '';
  }

  function parseAccepting(card) {
    // Optional: "NOT accepting new patients" in italic div inside phone col
    const italics = card.querySelectorAll('div[style*="font-style:italic"]');
    for (const el of italics) {
      const t = clean(el);
      if (/accept/i.test(t)) return t;
    }
    return '';
  }


    // ── Normalization ─────────────────────────────────────────────────────────

  function titleCase(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase())
      // Re-lowercase known lowercase words unless first word
      .replace(/\b(And|Or|Of|The|In|At|To|For|A|An|By|De|La|El)\b/g, w => w.toLowerCase())
      // Fix credential abbreviations back to uppercase: Md, Do, Pa-C etc.
      .replace(/\b(Md|Do|Dc|Dds|Dpm|Np|Pa|Rn|Pt|Ot|Lcsw|Mft|Phd|Psyd)\b/g, w => w.toUpperCase())
      // Uppercase state abbreviation
      .replace(/,\s*([A-Za-z]{2})\s+(\d{5})/, (_, st, zip) => `, ${st.toUpperCase()} ${zip}`);
  }

  function normalizeAddress(str) {
    if (!str) return '';
    // Normalize suite: "Ste 112" or "Suite 112" → ", #112"
    // Handle variants: Ste., Suite., Ste#, Suite#
    return str.replace(/,?\s*\b(?:ste\.?|suite\.?)\s*#?\s*(\w+)/gi, ', #$1');
  }

  // ── Page scrape ───────────────────────────────────────────────────────────

  function scrapeCurrentPage() {
    const cards = document.querySelectorAll(CARD_SEL);
    const rows  = [];
    cards.forEach(card => {
      const { name, credentials }          = parseName(card);
      if (!name) return;
      const { specialty, clinic }          = parseSpecialtyClinic(card);
      const { address1, city, state, zip,
              distance }                   = parseAddress(card);
      const phone                          = parsePhone(card);
      const accepting                      = parseAccepting(card);
      rows.push({
        name:        titleCase(name),
        credentials: credentials.toUpperCase(),
        specialty:   titleCase(specialty),
        clinic:      titleCase(clinic),
        address1,
        city,
        state,
        zip,
        distance,
        phone,
        accepting,
      });
    });
    return rows;
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  function csvEscape(val) {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadCSV(rows) {
    const header = ['Name', 'Credentials', 'Specialty', 'Clinic',
                    'Address', 'City', 'State', 'ZIP', 'Distance (mi)', 'Phone', 'Accepting'];
    const lines  = [
      header.join(','),
      ...rows.map(r =>
        [r.name, r.credentials, r.specialty, r.clinic,
         r.address1, r.city, r.state, r.zip, r.distance, r.phone, r.accepting]
          .map(csvEscape).join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = FILENAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  // CareMC pagination: inspect for the Next button — update selector if needed

  function getNextButton() {
    const btn = document.querySelector('a.providerResultsNext');
    if (!btn)                                         return null;
    if (btn.disabled)                                 return null;
    if (btn.getAttribute('disabled') === 'disabled')  return null;
    if (btn.parentElement?.classList.contains('disabled')) return null;
    return btn;
  }

  // ── Pagination detection ──────────────────────────────────────────────────
  // CareMC may use AJAX (no reload) or postback (full reload).
  // We handle both: after clicking Next, wait up to 6s for card count/content change.
  // If the page reloads, sessionStorage resumes via resumeIfRunning().

  function firstCardText() {
    const first = document.querySelector(CARD_SEL);
    return first ? clean(first) : '';
  }

  function waitForNewContent(snapshot) {
    return new Promise(resolve => {
      const start = Date.now();
      const timer = setInterval(() => {
        const now = firstCardText();
        if (now && now !== snapshot) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start > 6000) { clearInterval(timer); resolve(false); }
      }, 300);
    });
  }

  // ── Session storage ───────────────────────────────────────────────────────

  function loadRows()    { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
  function saveRows(r)   { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(r)); }
  function clearSession(){ [STORAGE_KEY, STATE_KEY, PAGE_KEY].forEach(k => sessionStorage.removeItem(k)); }
  function getState()    { return sessionStorage.getItem(STATE_KEY) || 'idle'; }
  function setState(s)   { sessionStorage.setItem(STATE_KEY, s); }
  function getPageNum()  { return parseInt(sessionStorage.getItem(PAGE_KEY) || '1', 10); }
  function setPageNum(n) { sessionStorage.setItem(PAGE_KEY, String(n)); }

  // ── Core loop ─────────────────────────────────────────────────────────────

  async function scrapeAndAdvance() {
    const pageRows = scrapeCurrentPage();
    const allRows  = loadRows();
    allRows.push(...pageRows);
    saveRows(allRows);

    const pageNum = getPageNum();
    setPageNum(pageNum + 1);
    updateUI('running', pageNum, allRows.length);

    const nextBtn = getNextButton();
    if (!nextBtn) {
      downloadCSV(allRows);
      updateUI('done', pageNum, allRows.length);
      clearSession();
      return;
    }

    const snapshot = firstCardText();
    nextBtn.click();

    // Wait to see if content changes in-place (AJAX) or page reloads (postback)
    const changed = await waitForNewContent(snapshot);
    if (changed) {
      // AJAX pagination — continue without reload
      scrapeAndAdvance();
    }
    // else: page is reloading — resumeIfRunning() will pick up on next document-idle
  }

  function startScrape() {
    clearSession();
    setState('running');
    setPageNum(1);
    scrapeAndAdvance();
  }

  function resumeIfRunning() {
    if (getState() !== 'running') return false;
    updateUI('running', getPageNum(), loadRows().length);
    setTimeout(scrapeAndAdvance, 500);
    return true;
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  function buildUI() {
    const panel = document.createElement('div');
    panel.id    = 'jjk-scraper-panel';
    panel.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:999999',
      'background:#fff', 'border:1px solid #ccc', 'border-radius:6px',
      'padding:10px 14px', 'font:13px/1.5 system-ui,sans-serif',
      'box-shadow:0 2px 8px rgba(0,0,0,.18)', 'min-width:220px',
    ].join(';');

    panel.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;color:#1a56a0">CareMC Scraper</div>
      <div id="jjk-scraper-status" style="color:#555;margin-bottom:8px">Ready</div>
      <button id="jjk-scraper-start"
        style="background:#1a56a0;color:#fff;border:none;border-radius:4px;
               padding:5px 12px;cursor:pointer;font-size:13px">
        Start scrape
      </button>
      <button id="jjk-scraper-abort"
        style="background:none;border:1px solid #c0392b;color:#c0392b;border-radius:4px;
               padding:5px 10px;cursor:pointer;font-size:13px;margin-left:6px;display:none">
        Abort
      </button>
      <button id="jjk-scraper-close"
        style="background:none;border:none;cursor:pointer;color:#999;
               float:right;font-size:16px;line-height:1;padding:2px 4px"
        title="Close">✕</button>
    `;
    document.body.appendChild(panel);

    document.getElementById('jjk-scraper-start').addEventListener('click', startScrape);
    document.getElementById('jjk-scraper-abort').addEventListener('click', () => {
      clearSession();
      updateUI('idle');
    });
    document.getElementById('jjk-scraper-close').addEventListener('click', () => {
      clearSession();
      panel.remove();
    });
  }

  function updateUI(state, pages, total) {
    const status = document.getElementById('jjk-scraper-status');
    const btn    = document.getElementById('jjk-scraper-start');
    const abort  = document.getElementById('jjk-scraper-abort');
    if (!status) return;
    switch (state) {
      case 'running':
        status.style.color = '#1a56a0';
        status.textContent = `Page ${pages} — ${total} providers so far…`;
        if (btn)   btn.disabled = true;
        if (abort) abort.style.display = 'inline-block';
        break;
      case 'done':
        status.style.color = '#1a7a3a';
        status.textContent = `✓ ${total} providers across ${pages} pages. CSV downloading.`;
        if (btn)   { btn.disabled = false; btn.textContent = 'Scrape again'; }
        if (abort) abort.style.display = 'none';
        break;
      case 'idle':
        status.style.color = '#555';
        status.textContent = 'Aborted.';
        if (btn)   btn.disabled = false;
        if (abort) abort.style.display = 'none';
        break;
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  buildUI();
  resumeIfRunning();

})();