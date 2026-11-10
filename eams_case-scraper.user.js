// ==UserScript==
// @name         EAMS Case Scraper
// @namespace    https://github.com/Jason-K
// @version      1.2
// @author       Jason K.
// @description  Autofills requester gate and scrapes case details, parties, body parts, events, and status from EAMS General Case Information searches with rich text, markdown, and CSV exports.
// @match        https://eams.dwc.ca.gov/WebEnhancement/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/eams_case-scraper.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/eams_case-scraper.user.js
// ==/UserScript==

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const TOOLBAR_ID = 'eams-scraper-toolbar';
  const TOAST_ID = 'eams-scraper-toast';

  const REQUESTER_CONFIG = {
    firstName: 'Jason',
    lastName: 'Knox',
    email: 'jknox@boxerlaw.com',
    reasonCode: 'CASESEARCH' // CASE INFORMATION SEARCH
  };

  const PRESERVED_ACRONYMS = new Set([
    'CA', 'NY', 'TX', 'FL', 'NV', 'AZ', 'WA', 'OR', 'IL', 'OH', 'PA',
    'ADJ', 'CT', 'DEU', 'DOR', 'TPA', 'PO', 'USA', 'LLC', 'INC', 'CORP',
    'CO', 'LP', 'LLP', 'PC', 'AC'
  ]);

  const LOWER_WORDS = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with'
  ]);

  // --- Automatic Requester Gate Autofill & Submit ---

  function handleRequesterGate() {
    const form = document.getElementById('requestor');
    if (!form) return false;

    const fnamInput = document.getElementById('fnam');
    const lnameInput = document.getElementById('lname');
    const emInput = document.getElementById('em');
    const reasonSelect = document.getElementById('reasonForReq');
    const submitBtn = document.getElementById('submitForm');

    if (fnamInput && lnameInput && emInput && reasonSelect && submitBtn) {
      // Avoid re-submitting if form already has matching values
      if (
        fnamInput.value === REQUESTER_CONFIG.firstName &&
        lnameInput.value === REQUESTER_CONFIG.lastName &&
        emInput.value === REQUESTER_CONFIG.email &&
        reasonSelect.value === REQUESTER_CONFIG.reasonCode
      ) {
        return false;
      }

      fnamInput.value = REQUESTER_CONFIG.firstName;
      fnamInput.dispatchEvent(new Event('input', { bubbles: true }));
      fnamInput.dispatchEvent(new Event('change', { bubbles: true }));

      lnameInput.value = REQUESTER_CONFIG.lastName;
      lnameInput.dispatchEvent(new Event('input', { bubbles: true }));
      lnameInput.dispatchEvent(new Event('change', { bubbles: true }));

      emInput.value = REQUESTER_CONFIG.email;
      emInput.dispatchEvent(new Event('input', { bubbles: true }));
      emInput.dispatchEvent(new Event('change', { bubbles: true }));

      reasonSelect.value = REQUESTER_CONFIG.reasonCode;
      reasonSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // Give enterprise reCAPTCHA 400ms to ready before dispatching submit
      setTimeout(() => {
        submitBtn.click();
      }, 400);
      return true;
    }
    return false;
  }

  // --- String & Data Normalization Helpers ---

  /**
   * Converts UPPERCASE text into Title Case while preserving acronyms, ADJ numbers,
   * state abbreviations, and minor words.
   */
  function toTitleCase(str) {
    if (!str) return '';
    str = String(str).replace(/\s+/g, ' ').trim();

    const tokens = str.split(/(\s+|[-/&#,.:()])/);
    let result = '';
    let wordIdx = 0;

    for (const token of tokens) {
      if (!token) continue;
      if (/^\s+|[-/&#,.:()]$/.test(token)) {
        result += token;
        continue;
      }
      const upper = token.toUpperCase();
      if (/^ADJ\d+$/i.test(upper)) {
        result += upper;
        wordIdx++;
        continue;
      }
      if (PRESERVED_ACRONYMS.has(upper)) {
        result += upper;
        wordIdx++;
        continue;
      }
      const lower = token.toLowerCase();
      if (wordIdx > 0 && LOWER_WORDS.has(lower)) {
        result += lower;
      } else {
        result += token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      }
      wordIdx++;
    }
    return result;
  }

  /**
   * Converts MM/DD/YYYY to YYYY-MM-DD format.
   */
  function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const match = String(dateStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return dateStr.trim();
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  /**
   * Parses Injury Date and determines injury_type ("specific" or "CT").
   * Computes CT date_diff and notes when CT != 1 year.
   */
  function parseInjuryDate(rawDate) {
    rawDate = String(rawDate || '').trim();
    let injuryType = 'specific';
    let injuryDate = '';
    const notes = [];

    if (rawDate.includes(' - ')) {
      injuryType = 'CT';
      const [startStr, endStr] = rawDate.split(' - ').map((s) => s.trim());
      injuryDate = normalizeDate(endStr);

      const matchStart = startStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const matchEnd = endStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

      if (matchStart && matchEnd) {
        const d1 = new Date(parseInt(matchStart[3], 10), parseInt(matchStart[1], 10) - 1, parseInt(matchStart[2], 10));
        const d2 = new Date(parseInt(matchEnd[3], 10), parseInt(matchEnd[1], 10) - 1, parseInt(matchEnd[2], 10));

        const isExact1Year = (
          d2.getFullYear() === d1.getFullYear() + 1 &&
          d2.getMonth() === d1.getMonth() &&
          d2.getDate() === d1.getDate()
        );
        const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

        if (!isExact1Year && Math.abs(diffDays - 365) > 1) {
          if (diffDays > 365) {
            const years = (diffDays / 365.25).toFixed(2);
            notes.push(`- CT length: ${years} years, based on CT from ${startStr} to ${endStr}`);
          } else {
            const weeks = Math.floor(diffDays / 7);
            const days = diffDays % 7;
            notes.push(`- CT length: ${weeks} weeks and ${days} days, based on CT from ${startStr} to ${endStr}`);
          }
        }
      }
    } else {
      injuryType = 'specific';
      injuryDate = normalizeDate(rawDate);
    }

    return { injuryType, injuryDate, notes };
  }

  /**
   * Combines all non-lien claimant parties into a formatted multiline string
   * with uppercase category headers and bulleted party names.
   */
  function buildPartiesText(partiesObj) {
    const sections = [
      { title: 'EMPLOYERS', list: partiesObj.employers },
      { title: 'INSURERS', list: partiesObj.insurers },
      { title: 'CLAIMS ADMINISTRATORS', list: partiesObj.tpas },
      { title: 'ATTORNEYS', list: partiesObj.attorneys }
    ];

    const blocks = [];
    for (const s of sections) {
      if (s.list && s.list.length > 0) {
        const items = s.list.map((name) => `- ${name}`).join('\n');
        blocks.push(`${s.title}\n${items}`);
      }
    }
    return blocks.length > 0 ? blocks.join('\n\n') : 'n/a';
  }

  /**
   * Determines case status from chronological events.
   * Priority:
   * - "reopened" if reopen event filed after award/C&R
   * - "closed by award"
   * - "closed by C&R"
   * - "pending"
   */
  function determineStatus(events) {
    let status = 'pending';
    for (const ev of events) {
      const gen = (ev.raw_general || '').toUpperCase();
      const type = (ev.raw_type || '').toUpperCase();
      const spec = (ev.raw_specific || '').toUpperCase();

      const isAwardStips = gen.includes('AWARD - STIPULATIONS');
      const isAwardTrial = (gen.includes('FINDING') && gen.includes('AWARD')) &&
                           (type.includes('CLOSING ORDER') || spec.includes('FINDING') || spec.includes('AWARD'));
      const isOtherAward = gen.includes('AWARD') && type.includes('CLOSING ORDER');

      const isCR = gen.includes('ORDER APPROVING C & R') ||
                   gen.includes('ORDER APPROVING C&R') ||
                   gen.includes('COMPROMISE AND RELEASE') ||
                   (type.includes('CLOSING ORDER') && (spec.includes('C & R') || spec.includes('C&R') || spec.includes('COMPROMISE')));

      const isReopen = gen.includes('REOPEN') || spec.includes('REOPEN') || type.includes('REOPEN');

      if (isAwardStips || isAwardTrial || isOtherAward) {
        status = 'closed by award';
      } else if (isCR) {
        status = 'closed by C&R';
      } else if (isReopen && (status === 'closed by award' || status === 'closed by C&R')) {
        status = 'reopened';
      }
    }
    return status;
  }

  /**
   * Returns current timestamp formatted as "YYYY.MM.DD at HH.MM.SS".
   */
  function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} at ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  }

  /**
   * Builds default export filename:
   * "YYYY.MM.DD at HH.MM.SS - EAMS cases for LASTNAME FIRSTNAME.EXTENSION"
   */
  function getExportFilename(workerLastName, workerFirstName, ext) {
    const ts = getTimestamp();
    const last = (workerLastName || 'UNKNOWN').trim().toUpperCase();
    const first = (workerFirstName || '').trim().toUpperCase();
    const namePart = first ? `${last} ${first}` : last;
    return `${ts} - EAMS cases for ${namePart}.${ext}`;
  }

  // --- Scraping Engine ---

  async function scrapeCaseData(progressCb) {
    // 1. Worker Name from Subpage 1
    const workerTable = document.querySelectorAll('table.resultTable')[0];
    let workerFirstName = '';
    let workerLastName = '';
    if (workerTable) {
      const rows = workerTable.querySelectorAll('tr');
      if (rows.length >= 2) {
        const cells = rows[1].querySelectorAll('td');
        if (cells.length >= 2) {
          workerFirstName = cells[0].innerText.trim();
          workerLastName = cells[1].innerText.trim();
        }
      }
    }

    // 2. Case List from Subpage 1
    const caseTable = document.querySelectorAll('table.resultTable')[1];
    if (!caseTable) {
      throw new Error('No case table found on this screen. Make sure you are on General Case Information.');
    }

    const caseRows = Array.from(caseTable.querySelectorAll('tr')).slice(1);
    const parsedCases = [];
    let currentCase = null;

    for (const tr of caseRows) {
      const tds = Array.from(tr.querySelectorAll('td'));
      if (tds.length === 0) continue;

      const caseNumText = tds[0] ? tds[0].innerText.trim() : '';
      const matchCase = caseNumText.match(/ADJ\d+/);

      if (matchCase) {
        const caseNum = matchCase[0];
        const rawLoc = tds[1] ? tds[1].innerText.trim() : '';
        const boardLocation = toTitleCase(rawLoc.replace(/-ADJ$/i, '').trim());
        const employerSub1 = tds[2] ? tds[2].innerText.trim() : '';
        const rawInjuryDate = tds[3] ? tds[3].innerText.trim() : '';
        const linkA = tr.querySelector('a');
        const detailUrl = linkA ? linkA.href : '';

        currentCase = {
          eams_case_number: caseNum,
          board_location: boardLocation,
          subpage1_employers: employerSub1 ? [toTitleCase(employerSub1)] : [],
          raw_injury_date: rawInjuryDate,
          detail_url: detailUrl
        };
        parsedCases.push(currentCase);
      } else if (currentCase && tds.length >= 3) {
        // Subsequent employer row belonging to previous case
        const extraEmp = tds[2].innerText.trim();
        if (extraEmp) {
          currentCase.subpage1_employers.push(toTitleCase(extraEmp));
        }
      }
    }

    if (parsedCases.length === 0) {
      throw new Error('No cases found in the General Case Information table.');
    }

    // 3. Fetch Subpage 2 (Case Detail) and Subpage 3 (Events) for each case
    const results = [];
    for (let i = 0; i < parsedCases.length; i++) {
      const c = parsedCases[i];
      if (progressCb) {
        progressCb(`Scraping case ${i + 1} of ${parsedCases.length} (${c.eams_case_number})...`);
      }

      const { injuryType, injuryDate, notes: dateNotes } = parseInjuryDate(c.raw_injury_date);
      const caseNotes = [...dateNotes];

      const bodyParts = [];
      const employerNames = new Set(c.subpage1_employers);
      const insurerNames = new Set();
      const tpaNames = new Set();
      const attorneyNames = new Set();
      const lienClaimantNames = new Set();
      let eventsUrl = '';

      if (c.detail_url) {
        const detailResp = await fetch(c.detail_url);
        const detailHtml = await detailResp.text();
        const detailDoc = new DOMParser().parseFromString(detailHtml, 'text/html');

        const allRows = Array.from(detailDoc.querySelectorAll('tr'));

        // Parse Body Parts (rows where cell 0 contains "Body Part")
        for (const r of allRows) {
          const cells = Array.from(r.querySelectorAll('td'));
          if (cells.length >= 2 && /body\s*part/i.test(cells[0].innerText)) {
            const rawVal = cells[1].innerText.trim();
            const matchBp = rawVal.match(/^(\d{3})\s*[-]?\s*(.*)$/);
            if (matchBp) {
              const code = matchBp[1];
              let desc = matchBp[2].replace(/^[-–—]\s*/, '').trim();
              const formattedBp = `${code} - ${toTitleCase(desc)}`;
              if (!bodyParts.includes(formattedBp)) {
                bodyParts.push(formattedBp);
              }
            }
          }
        }

        // Parse Participants (names only, no addresses)
        const tables = Array.from(detailDoc.querySelectorAll('table.resultTable'));
        for (const tbl of tables) {
          const headers = Array.from(tbl.querySelectorAll('th')).map((th) => th.innerText.trim().toUpperCase());
          if (headers.includes('PARTICIPANT NAME') && headers.includes('ROLE')) {
            const rows = Array.from(tbl.querySelectorAll('tr')).slice(1);
            for (const r of rows) {
              const cells = Array.from(r.querySelectorAll('td'));
              if (cells.length < 2) continue;
              const rawName = cells[0].innerText.trim();
              const pRole = cells[1].innerText.trim().toUpperCase();
              if (!rawName) continue;

              const titleName = toTitleCase(rawName);

              if (pRole.includes('EMPLOYER')) {
                employerNames.add(titleName);
              } else if (pRole.includes('CLAIMS ADMINISTRATOR') || pRole.includes('TPA')) {
                tpaNames.add(titleName);
              } else if (pRole.includes('LAW FIRM') || pRole.includes('ATTORNEY')) {
                attorneyNames.add(titleName);
              } else if (pRole.includes('INSUR')) {
                insurerNames.add(titleName);
              } else if (pRole.includes('LIEN CLAIMANT')) {
                lienClaimantNames.add(titleName);
              }
            }
          }
        }

        // Events Link
        const eventLink = detailDoc.querySelector('a[href*="CaseEventFinder"]');
        if (eventLink) {
          eventsUrl = eventLink.href;
        }
      }

      const partiesObj = {
        employers: Array.from(employerNames),
        insurers: Array.from(insurerNames),
        tpas: Array.from(tpaNames),
        attorneys: Array.from(attorneyNames)
      };

      const partiesFormatted = buildPartiesText(partiesObj);

      if (lienClaimantNames.size > 0) {
        caseNotes.push(`- Lien Claimants: ${Array.from(lienClaimantNames).join(', ')}`);
      }

      // Fetch Subpage 3 (Events)
      const parsedEvents = [];
      if (eventsUrl) {
        const eventResp = await fetch(eventsUrl);
        const eventHtml = await eventResp.text();
        const eventDoc = new DOMParser().parseFromString(eventHtml, 'text/html');
        const eventTable = eventDoc.querySelectorAll('table.resultTable')[1];
        if (eventTable) {
          const rows = Array.from(eventTable.querySelectorAll('tr')).slice(1);
          for (const r of rows) {
            const tds = Array.from(r.querySelectorAll('td'));
            if (tds.length < 3) continue;
            const rawGen = tds[0].innerText.trim();
            const rawDetail = tds[1].innerText.trim();
            const rawDate = tds[2].innerText.trim();

            let rawType = '';
            let rawSpec = rawDetail;
            if (rawDetail.includes(':')) {
              const colonIdx = rawDetail.indexOf(':');
              rawType = rawDetail.substring(0, colonIdx).trim();
              rawSpec = rawDetail.substring(colonIdx + 1).trim();
            }

            const isoDate = normalizeDate(rawDate);
            const titleType = toTitleCase(rawType);
            const titleGen = toTitleCase(rawGen);
            const titleSpec = toTitleCase(rawSpec);

            let entry = `${isoDate} - ${titleGen}`;
            if (titleType && titleSpec) {
              entry = `${isoDate} - ${titleType} - ${titleGen} - ${titleSpec}`;
            } else if (titleSpec) {
              entry = `${isoDate} - ${titleGen} - ${titleSpec}`;
            }

            parsedEvents.push({
              entry,
              isoDate,
              raw_general: rawGen,
              raw_type: rawType,
              raw_specific: rawSpec
            });
          }
        }
      }

      parsedEvents.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

      const status = determineStatus(parsedEvents);
      bodyParts.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Add "Location: LOCATION" at the top of the Notes column entry
      const notesList = [];
      if (c.board_location) {
        notesList.push(`Location: ${c.board_location}`);
      }
      if (caseNotes.length > 0) {
        notesList.push(...caseNotes);
      }
      const finalNotes = notesList.length > 0 ? notesList.join('\n') : '(none)';

      results.push({
        eams_case_number: c.eams_case_number,
        board_location: c.board_location,
        employers: partiesObj.employers,
        injury_type: injuryType,
        injury_date: injuryDate,
        body_parts: bodyParts,
        parties_data: partiesObj,
        parties: partiesFormatted,
        notes: finalNotes,
        status: status,
        events: parsedEvents.map((e) => e.entry)
      });
    }

    return {
      workerFirstName,
      workerLastName,
      cases: results
    };
  }

  // --- Formatters & Export Generators ---

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatArrayForCell(arr) {
    if (!arr || arr.length === 0) return 'n/a';
    return Array.isArray(arr) ? arr.join('\n') : String(arr);
  }

  /**
   * Generates TSV (Tab-Separated Values) plain text for clipboard fallback.
   */
  function buildTsvTable(cases) {
    const headers = [
      'DOI', 'TYPE', 'BODY PARTS', 'STATUS', 'EAMS #', 'EVENTS', 'PARTIES', 'NOTES'
    ];

    const escapeTsvCell = (val) => {
      const text = formatArrayForCell(val);
      return text.replace(/\t/g, ' ').replace(/\r?\n/g, ' | ');
    };

    const headerLine = headers.join('\t');
    const rows = cases.map((c) => {
      return [
        escapeTsvCell(c.injury_date),
        escapeTsvCell(c.injury_type),
        escapeTsvCell(c.body_parts),
        escapeTsvCell(c.status),
        escapeTsvCell(c.eams_case_number),
        escapeTsvCell(c.events),
        escapeTsvCell(c.parties),
        escapeTsvCell(c.notes)
      ].join('\t');
    });

    return [headerLine, ...rows].join('\n');
  }

  /**
   * Generates Rich Text HTML table with Parties column.
   * Uses standard Office/Word CF_HTML fragments (<!--StartFragment--> and <!--EndFragment-->)
   * and comprehensive inline styles to prevent being embedded as an Edge/OLE object.
   */
  function buildRichHtmlTable(cases, workerLastName, workerFirstName) {
    const title = `EAMS Cases: ${workerLastName ? workerLastName + ', ' : ''}${workerFirstName || ''}`.trim();

    function formatRichParties(c) {
      const p = c.parties_data;
      if (!p) return escapeHtml(c.parties).replace(/\n/g, '<br>');

      const sections = [
        { title: 'EMPLOYERS', list: p.employers },
        { title: 'INSURERS', list: p.insurers },
        { title: 'CLAIMS ADMINISTRATORS', list: p.tpas },
        { title: 'ATTORNEYS', list: p.attorneys }
      ];

      const blocks = [];
      for (const s of sections) {
        if (s.list && s.list.length > 0) {
          const items = s.list.map((n) => `&bull; ${escapeHtml(n)}`).join('<br>');
          blocks.push(`<strong>${escapeHtml(s.title)}</strong><br>${items}`);
        }
      }
      return blocks.length > 0 ? blocks.join('<br><br>') : 'n/a';
    }

    const cellStyle = 'border: 1px solid #bfbfbf; padding: 6px 8px; vertical-align: top; text-align: left;';
    const thStyle = 'border: 1px solid #bfbfbf; padding: 6px 8px; vertical-align: top; text-align: left; background-color: #f2f4f7; font-weight: bold;';

    const rowsHtml = cases.map((c) => {
      return `
        <tr>
          <td style="${cellStyle}">${escapeHtml(c.injury_date)}</td>
          <td style="${cellStyle}">${escapeHtml(c.injury_type)}</td>
          <td style="${cellStyle}">${escapeHtml(formatArrayForCell(c.body_parts)).replace(/\n/g, '<br>')}</td>
          <td style="${cellStyle}">${escapeHtml(c.status)}</td>
          <td style="${cellStyle} font-weight: bold;">${escapeHtml(c.eams_case_number)}</td>
          <td style="${cellStyle}">${escapeHtml(formatArrayForCell(c.events)).replace(/\n/g, '<br>')}</td>
          <td style="${cellStyle}">${formatRichParties(c)}</td>
          <td style="${cellStyle}">${escapeHtml(c.notes).replace(/\n/g, '<br>')}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
table { border-collapse: collapse; width: 100%; font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.35; }
th, td { border: 1px solid #bfbfbf; padding: 6px 8px; vertical-align: top; text-align: left; }
th { background-color: #f2f4f7; font-weight: bold; }
</style>
</head>
<body>
<!--StartFragment-->
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #bfbfbf; width: 100%; font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.35;">
  <thead>
    <tr style="background-color: #f2f4f7; font-weight: bold;">
      <th style="${thStyle}">DOI</th>
      <th style="${thStyle}">TYPE</th>
      <th style="${thStyle}">BODY PARTS</th>
      <th style="${thStyle}">STATUS</th>
      <th style="${thStyle}">EAMS #</th>
      <th style="${thStyle}">EVENTS</th>
      <th style="${thStyle}">PARTIES</th>
      <th style="${thStyle}">NOTES</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
  </tbody>
</table>
<!--EndFragment-->
</body>
</html>`;
  }

  /**
   * Generates Markdown Table with updated column order.
   */
  function buildMarkdownTable(cases) {
    const headers = [
      'DOI', 'TYPE', 'BODY PARTS', 'STATUS', 'EAMS #', 'EVENTS', 'PARTIES', 'NOTES'
    ];

    const escapeMdCell = (val) => {
      const text = formatArrayForCell(val);
      return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    };

    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;

    const dataRows = cases.map((c) => {
      const row = [
        escapeMdCell(c.injury_date),
        escapeMdCell(c.injury_type),
        escapeMdCell(c.body_parts),
        escapeMdCell(c.status),
        escapeMdCell(c.eams_case_number),
        escapeMdCell(c.events),
        escapeMdCell(c.parties),
        escapeMdCell(c.notes)
      ];
      return `| ${row.join(' | ')} |`;
    });

    return [headerRow, separatorRow, ...dataRows].join('\n');
  }

  /**
   * Generates Markdown Report.
   */
  function buildMarkdownReport(cases, workerLastName, workerFirstName) {
    const ts = getTimestamp();
    const lines = [];

    lines.push(`# EAMS Case Search Summary: ${workerLastName ? workerLastName + ', ' : ''}${workerFirstName || ''}`);
    lines.push(`*Generated on ${ts}*\n`);
    lines.push(`Total cases found: ${cases.length}\n`);
    lines.push('---\n');

    cases.forEach((c, idx) => {
      lines.push(`## Case ${idx + 1}: ${c.eams_case_number}`);
      lines.push(`- **DOI:** ${c.injury_date}`);
      lines.push(`- **TYPE:** ${c.injury_type}`);

      lines.push('- **BODY PARTS:**');
      if (c.body_parts.length > 0) {
        c.body_parts.forEach((bp) => lines.push(`  - ${bp}`));
      } else {
        lines.push('  - n/a');
      }

      lines.push(`- **STATUS:** ${c.status}`);
      lines.push(`- **EAMS #:** ${c.eams_case_number}`);

      lines.push('- **EVENTS:**');
      if (c.events.length > 0) {
        c.events.forEach((ev) => lines.push(`  - ${ev}`));
      } else {
        lines.push('  - (no events listed)');
      }

      lines.push('- **PARTIES:**');
      if (c.parties && c.parties !== 'n/a') {
        c.parties.split('\n').forEach((pLine) => {
          if (pLine.trim()) {
            lines.push(`  ${pLine}`);
          }
        });
      } else {
        lines.push('  - n/a');
      }

      lines.push('- **NOTES:**');
      if (c.notes && c.notes !== '(none)') {
        c.notes.split('\n').forEach((noteLine) => {
          lines.push(`  ${noteLine}`);
        });
      } else {
        lines.push('  - (none)');
      }

      lines.push('\n---\n');
    });

    return lines.join('\n');
  }

  /**
   * Generates CSV string.
   */
  function buildCsv(cases) {
    const headers = [
      'DOI', 'TYPE', 'BODY PARTS', 'STATUS', 'EAMS #', 'EVENTS', 'PARTIES', 'NOTES'
    ];

    const escapeCsv = (val) => {
      const text = formatArrayForCell(val);
      if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const headerLine = headers.join(',');
    const rows = cases.map((c) => {
      return [
        escapeCsv(c.injury_date),
        escapeCsv(c.injury_type),
        escapeCsv(c.body_parts),
        escapeCsv(c.status),
        escapeCsv(c.eams_case_number),
        escapeCsv(c.events),
        escapeCsv(c.parties),
        escapeCsv(c.notes)
      ].join(',');
    });

    return [headerLine, ...rows].join('\r\n');
  }

  // --- Clipboard & Download Triggers ---

  /**
   * Writes native dual-flavor HTML + Plain Text directly to clipboard.
   * Uses standard ClipboardItem to avoid Violentmonkey/Tampermonkey wrapping the payload
   * as an embedded Microsoft Edge / OLE object.
   */
  async function copyToClipboard(richHtml, plainText) {
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([richHtml], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
        return true;
      } catch (err) {
        console.warn('ClipboardItem write failed, trying fallback copy listener', err);
      }
    }

    // Fallback: synchronous copy event listener
    const listener = (e) => {
      e.clipboardData.setData('text/plain', plainText);
      e.clipboardData.setData('text/html', richHtml);
      e.preventDefault();
    };
    document.addEventListener('copy', listener, { once: true });
    return document.execCommand('copy');
  }

  async function copyPlainText(plainText) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(plainText);
        return true;
      } catch (e) {
        console.warn('clipboard.writeText failed, using fallback copy listener', e);
      }
    }

    const listener = (e) => {
      e.clipboardData.setData('text/plain', plainText);
      e.preventDefault();
    };
    document.addEventListener('copy', listener, { once: true });
    return document.execCommand('copy');
  }

  function downloadFile(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      Object.assign(toast.style, {
        position: 'fixed',
        bottom: '80px',
        right: '24px',
        backgroundColor: isError ? '#d32f2f' : '#2e7d32',
        color: '#ffffff',
        padding: '12px 18px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '500',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        zIndex: '10000',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        opacity: '0',
        transform: 'translateY(10px)'
      });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#d32f2f' : '#2e7d32';
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 3500);
  }

  // --- UI Toolbar Component ---

  let cachedScrapeResult = null;
  let isScraping = false;

  async function ensureScraped(statusEl) {
    if (cachedScrapeResult) return cachedScrapeResult;
    if (isScraping) {
      throw new Error('Scrape already in progress. Please wait.');
    }
    try {
      isScraping = true;
      if (statusEl) statusEl.textContent = 'Scraping cases...';
      const res = await scrapeCaseData((msg) => {
        if (statusEl) statusEl.textContent = msg;
      });
      cachedScrapeResult = res;
      if (statusEl) {
        statusEl.textContent = `✅ Ready (${res.cases.length} cases scraped)`;
      }
      return res;
    } finally {
      isScraping = false;
    }
  }

  function createToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;

    // Verify we are on General Case Information screen
    const pageTitle = document.querySelector('p.pageTitleLayout');
    const isGeneralInfo = pageTitle && /general case information/i.test(pageTitle.innerText);
    const hasResultTable = !!document.querySelector('table.resultTable');

    if (!isGeneralInfo && !hasResultTable) return;

    const toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    Object.assign(toolbar.style, {
      position: 'fixed',
      bottom: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#ffffff',
      border: '1px solid #d0d7de',
      borderRadius: '10px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      zIndex: '9999',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '12px'
    });

    const titleEl = document.createElement('span');
    titleEl.textContent = '⚖️ EAMS Scraper:';
    titleEl.style.fontWeight = '700';
    titleEl.style.color = '#333333';
    titleEl.style.marginRight = '4px';

    const statusEl = document.createElement('span');
    statusEl.id = 'eams-scraper-status';
    statusEl.textContent = 'Ready to scrape';
    statusEl.style.color = '#666666';
    statusEl.style.fontSize = '11px';
    statusEl.style.marginRight = '8px';

    function makeButton(text, bg, fg, clickHandler) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = text;
      Object.assign(btn.style, {
        padding: '6px 10px',
        backgroundColor: bg,
        color: fg,
        border: '1px solid rgba(0,0,0,0.12)',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '500',
        transition: 'background-color 0.2s ease, transform 0.1s ease',
        whiteSpace: 'nowrap'
      });
      btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(0.95)'; });
      btn.addEventListener('mouseleave', () => { btn.style.filter = 'none'; });
      btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.98)'; });
      btn.addEventListener('mouseup', () => { btn.style.transform = 'scale(1)'; });
      btn.addEventListener('click', async () => {
        try {
          btn.disabled = true;
          await clickHandler();
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Operation failed', true);
        } finally {
          btn.disabled = false;
        }
      });
      return btn;
    }

    // 1. Export to Clipboard (Rich Text)
    const btnClipRich = makeButton('📋 Clipboard (Rich)', '#2563eb', '#ffffff', async () => {
      const data = await ensureScraped(statusEl);
      const richHtml = buildRichHtmlTable(data.cases, data.workerLastName, data.workerFirstName);
      const plainText = buildTsvTable(data.cases);
      await copyToClipboard(richHtml, plainText);
      showToast('✅ Copied Rich Table to clipboard!');
    });

    // 2. Export to Clipboard (Markdown Table)
    const btnClipMdTable = makeButton('📋 Clipboard (MD Table)', '#0284c7', '#ffffff', async () => {
      const data = await ensureScraped(statusEl);
      const mdTable = buildMarkdownTable(data.cases);
      await copyPlainText(mdTable);
      showToast('✅ Copied Markdown Table to clipboard!');
    });

    // 3. Export to Clipboard (Markdown Report)
    const btnClipMdReport = makeButton('📋 Clipboard (MD Report)', '#0d9488', '#ffffff', async () => {
      const data = await ensureScraped(statusEl);
      const mdReport = buildMarkdownReport(data.cases, data.workerLastName, data.workerFirstName);
      await copyPlainText(mdReport);
      showToast('✅ Copied Markdown Report to clipboard!');
    });

    // 4. Export to File (CSV)
    const btnFileCsv = makeButton('💾 File (CSV)', '#16a34a', '#ffffff', async () => {
      const data = await ensureScraped(statusEl);
      const csv = buildCsv(data.cases);
      const filename = getExportFilename(data.workerLastName, data.workerFirstName, 'csv');
      downloadFile(csv, 'text/csv;charset=utf-8;', filename);
      showToast(`💾 Saved ${filename}`);
    });

    // 5. Export to File (MD Table)
    const btnFileMdTable = makeButton('💾 File (MD Table)', '#475569', '#ffffff', async () => {
      const data = await ensureScraped(statusEl);
      const mdTable = buildMarkdownTable(data.cases);
      const filename = getExportFilename(data.workerLastName, data.workerFirstName, 'table.md');
      downloadFile(mdTable, 'text/markdown;charset=utf-8;', filename);
      showToast(`💾 Saved ${filename}`);
    });

    // 6. Export to File (MD Report)
    const btnFileMdReport = makeButton('💾 File (MD Report)', '#334155', '#ffffff', async () => {
      const data = await ensureScraped(statusEl);
      const mdReport = buildMarkdownReport(data.cases, data.workerLastName, data.workerFirstName);
      const filename = getExportFilename(data.workerLastName, data.workerFirstName, 'report.md');
      downloadFile(mdReport, 'text/markdown;charset=utf-8;', filename);
      showToast(`💾 Saved ${filename}`);
    });

    // Refresh / Rescrape button
    const btnRescrape = makeButton('🔄 Rescrape', '#f3f4f6', '#374151', async () => {
      cachedScrapeResult = null;
      await ensureScraped(statusEl);
      showToast('✅ Rescraped case data!');
    });

    toolbar.appendChild(titleEl);
    toolbar.appendChild(statusEl);
    toolbar.appendChild(btnClipRich);
    toolbar.appendChild(btnClipMdTable);
    toolbar.appendChild(btnClipMdReport);
    toolbar.appendChild(btnFileCsv);
    toolbar.appendChild(btnFileMdTable);
    toolbar.appendChild(btnFileMdReport);
    toolbar.appendChild(btnRescrape);

    document.body.appendChild(toolbar);
  }

  // --- Lifecycle Initialization ---

  function init() {
    // 1. Try gate autofill if on RequesterInformationCaptureScreen
    handleRequesterGate();

    // 2. Initialize toolbar if on General Case Information
    createToolbar();
  }

  const checkInterval = setInterval(() => {
    handleRequesterGate();
    const pageTitle = document.querySelector('p.pageTitleLayout');
    if (pageTitle && /general case information/i.test(pageTitle.innerText)) {
      clearInterval(checkInterval);
      createToolbar();
    }
  }, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
