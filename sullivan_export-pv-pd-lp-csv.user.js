// ==UserScript==
// @name         Sullivan PV/PD/LP Export Results to CSV
// @namespace    https://github.com/Jason-K
// @version      1.4.1
// @author       Jason K.
// @description  Adds an Export Results to CSV button on the PV of PD and LP calculator page.
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/sullivan_export-pv-pd-lp-csv.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/sullivan_export-pv-pd-lp-csv.user.js
// @match        https://app.sullivanoncomp.com/calculators/pv-of-pd-and-lp*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_BUTTON_ID = 'sullivan-export-results-csv-btn';
  const SCRIPT_APPEND_BUTTON_ID = 'sullivan-append-results-csv-btn';
  const CALCULATOR_SELECTOR = '#calculator';
  const RESULTS_SELECTOR = "#calculator-results";

  let lastUrl = location.href;
  let appendFileHandle = null;

  function csvEscape(value) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function getClosestSectionTitle(node) {
    const section = node.closest('section');
    if (!section) return 'Calculator';
    const heading = section.querySelector('h2');
    return heading ? heading.textContent.trim() : 'Calculator';
  }

  function getCurrentResultSubsection(node) {
    const previousH3 = node.previousElementSibling;
    if (previousH3 && previousH3.tagName === 'H3') {
      return previousH3.textContent.trim();
    }

    let cursor = node.previousElementSibling;
    while (cursor) {
      if (cursor.tagName === 'H3') {
        return cursor.textContent.trim();
      }
      cursor = cursor.previousElementSibling;
    }

    return '';
  }

  function getInputValue(fieldBox) {
    const calcField = fieldBox.querySelector('.calcField');
    if (!calcField) return '';

    const selectedTag = calcField.querySelector('.selected-tag');
    if (selectedTag) {
      return selectedTag.textContent.trim();
    }

    const checkedRadio = calcField.querySelector('input[type="radio"]:checked');
    if (checkedRadio) {
      const checkedLabel = calcField.querySelector(`label[for="${checkedRadio.id}"]`);
      return checkedLabel ? checkedLabel.textContent.trim() : checkedRadio.value.trim();
    }

    const textInputs = Array.from(
      calcField.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]')
    ).map((input) => input.value.trim()).filter(Boolean);

    if (textInputs.length > 0) {
      return textInputs.join(' | ');
    }

    const nonButtonText = calcField.textContent.replace(/\s+/g, ' ').trim();
    return nonButtonText;
  }

  function collectInputRows(calculatorRoot) {
    const rows = [];
    const form = calculatorRoot.querySelector('#calculator-form');
    if (!form) return rows;

    const fieldBoxes = form.querySelectorAll('.calcFieldBox');
    fieldBoxes.forEach((fieldBox) => {
      const labelNode = fieldBox.querySelector('.calcLabel label');
      if (!labelNode) return;

      const labelText = labelNode.textContent.replace(/\s+/g, ' ').trim();
      if (!labelText) return;

      const valueText = getInputValue(fieldBox);
      if (!valueText) return;

      rows.push({
        section: getClosestSectionTitle(fieldBox),
        subsection: '',
        label: labelText,
        value: valueText,
      });
    });

    return rows;
  }

  function collectResultRows(calculatorRoot) {
    const rows = [];
    const results = calculatorRoot.querySelector(RESULTS_SELECTOR);
    if (!results) return rows;

    const containers = results.querySelectorAll('.resultContainer');
    containers.forEach((container) => {
      const labelNode = container.querySelector('.resultLabel');
      const valueNode = container.querySelector('.resultValue');
      if (!labelNode || !valueNode) return;

      const label = labelNode.textContent.replace(/\s+/g, ' ').trim();
      const value = valueNode.textContent.replace(/\s+/g, ' ').trim();
      if (!label || !value) return;

      rows.push({
        section: getClosestSectionTitle(container),
        subsection: getCurrentResultSubsection(container),
        label,
        value,
      });
    });

    return rows;
  }

  function buildCsvTextFromPairs(pairs) {
    return pairs
      .map(([colA, colB]) => `${csvEscape(colA)},${csvEscape(colB)}`)
      .join("\n");
  }

  function getLegacyRowByNumber(rows, oneBasedRowNumber) {
    const idx = oneBasedRowNumber - 1;
    return rows[idx] || null;
  }

  function getLegacyValueByRow(rows, oneBasedRowNumber) {
    const row = getLegacyRowByNumber(rows, oneBasedRowNumber);
    return row ? row.value : "";
  }

  function findValueByLabelIncludes(rows, needle) {
    const lowerNeedle = String(needle).toLowerCase();
    const row = rows.find((item) =>
      item.label.toLowerCase().includes(lowerNeedle),
    );
    return row ? row.value : "";
  }

  function findInputValueByLabelIncludes(rows, needle) {
    const lowerNeedle = String(needle).toLowerCase();
    const row = rows.find(
      (item) =>
        item.section === "Inputs" &&
        item.label.toLowerCase().includes(lowerNeedle),
    );
    return row ? row.value : "";
  }

  function findResultValueByLabelIncludes(rows, needle) {
    const lowerNeedle = String(needle).toLowerCase();
    const row = rows.find(
      (item) =>
        item.section === "Results" &&
        item.label.toLowerCase().includes(lowerNeedle),
    );
    return row ? row.value : "";
  }

  function normalizeNumericText(value) {
    const text = String(value || "").trim();
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? match[0] : text;
  }

  function formatDateDots(value) {
    const text = String(value || "").trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return text;
    const mm = match[1].padStart(2, "0");
    const dd = match[2].padStart(2, "0");
    const yyyy = match[3];
    return `${mm}.${dd}.${yyyy}`;
  }

  function formatClientName(rawName) {
    const text = String(rawName || "").trim();
    if (!text) return "unnamed applicant";

    if (text.includes("|")) {
      const parts = text
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[1]}, ${parts[0]}`;
      }
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const first = words[0];
      const last = words[words.length - 1];
      return `${last}, ${first}`;
    }

    return text;
  }

  function sanitizeFilenamePart(value, fallback) {
    const cleaned = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "");
    return cleaned || fallback;
  }

  function getMappedValues(rows) {
    const rawClientFromD3 =
      findInputValueByLabelIncludes(rows, "Name of Injured Worker") ||
      getLegacyValueByRow(rows, 3) ||
      findValueByLabelIncludes(rows, "Name of Injured Worker");
    const dobFromD5 =
      findInputValueByLabelIncludes(rows, "Date of Birth") ||
      getLegacyValueByRow(rows, 5) ||
      findValueByLabelIncludes(rows, "Date of Birth");
    const mmiFromD9 =
      findInputValueByLabelIncludes(rows, "Date of Calculation") ||
      getLegacyValueByRow(rows, 11) ||
      findValueByLabelIncludes(rows, "Date of Calculation");
    const commutationFromD11 =
      findInputValueByLabelIncludes(rows, "Average Weekly Earnings") ||
      getLegacyValueByRow(rows, 11) ||
      findValueByLabelIncludes(rows, "Average Weekly Earnings");

    const percentPD = normalizeNumericText(
      findInputValueByLabelIncludes(rows, "PD Rating") ||
        getLegacyValueByRow(rows, 10) ||
        findValueByLabelIncludes(rows, "PD Rating"),
    );
    const interestRate = normalizeNumericText(
      findInputValueByLabelIncludes(rows, "Annual Discount Rate") ||
        getLegacyValueByRow(rows, 13) ||
        findValueByLabelIncludes(rows, "Annual Discount Rate"),
    );
    const colaRate = normalizeNumericText(
      findInputValueByLabelIncludes(rows, "Assumed COLA Increases") ||
        getLegacyValueByRow(rows, 14) ||
        findValueByLabelIncludes(rows, "Assumed COLA Increases"),
    );
    const presentValue =
      findResultValueByLabelIncludes(
        rows,
        "Difference between Gross and PV of expected future PD and LP payments",
      ) ||
      getLegacyValueByRow(rows, 36) ||
      findResultValueByLabelIncludes(
        rows,
        "Gross total present value of PD and Life Pension with COLA applied",
      );
    const calcDate = formatDateDots(
      findInputValueByLabelIncludes(rows, "Date of Calculation") ||
        getLegacyValueByRow(rows, 11) ||
        findValueByLabelIncludes(rows, "Date of Calculation"),
    );

    return {
      clientName: formatClientName(rawClientFromD3),
      dob: dobFromD5,
      mmi: mmiFromD9,
      commutation: commutationFromD11,
      percentPD,
      interestRate,
      colaRate,
      presentValue,
      calcDate,
    };
  }

  function buildMasterPairs(rows) {
    const mapped = getMappedValues(rows);

    const pairs = [
      ["Client", mapped.clientName],
      ["DOB:", mapped.dob],
      ["MMI:", mapped.mmi],
      ["Commutation:", mapped.commutation],
    ];

    const variableInputLabels = [
      "Date of Calculation",
      "Annual Discount Rate",
      "Assumed COLA Increases",
      "Calculation Mode",
    ];

    variableInputLabels.forEach((labelNeedle) => {
      const row = rows.find(
        (item) =>
          item.section === "Inputs" &&
          item.label.toLowerCase().includes(labelNeedle.toLowerCase()),
      );
      if (row && row.value) {
        pairs.push([row.label, row.value]);
      }
    });

    const orderedResultRows = rows.filter((item) => item.section === "Results");
    orderedResultRows.forEach((row) => {
      if (row.label && row.value) {
        pairs.push([row.label, row.value]);
      }
    });

    return pairs;
  }

  function buildFilenameFromRows(rows) {
    const mapped = getMappedValues(rows);

    const clientName = sanitizeFilenamePart(
      mapped.clientName,
      "unnamed applicant",
    );
    const percentPD = sanitizeFilenamePart(mapped.percentPD, "unknown");
    const colaRate = sanitizeFilenamePart(mapped.colaRate, "unknown");
    const interestRate = sanitizeFilenamePart(mapped.interestRate, "unknown");
    const presentValue = sanitizeFilenamePart(mapped.presentValue, "unknown");
    const calcDate = sanitizeFilenamePart(mapped.calcDate, "unknown date");

    return `${clientName} - ${percentPD} PD - COLA ${colaRate} IR ${interestRate} - ${presentValue} on ${calcDate}.csv`;
  }

  function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  function collectAllRows() {
    const calculatorRoot = document.querySelector(CALCULATOR_SELECTOR);
    if (!calculatorRoot) {
      window.alert('Calculator container was not found.');
      return null;
    }

    const rows = [
      ...collectInputRows(calculatorRoot),
      ...collectResultRows(calculatorRoot),
    ];

    if (rows.length === 0) {
      window.alert('No calculator data was found to export. Calculate results first.');
      return null;
    }

    return rows;
  }

  function exportCalculatorData() {
    const rows = collectAllRows();
    if (!rows) return;

    const pairs = buildMasterPairs(rows);
    const content = buildCsvTextFromPairs(pairs);
    const filename = buildFilenameFromRows(rows);
    downloadCsv(content, filename);
  }

  async function getAppendFileHandle() {
    if (appendFileHandle) return appendFileHandle;

    if (typeof window.showSaveFilePicker !== 'function') {
      window.alert(
        'Append mode is not supported by this browser/userscript manager. Use Export Results to CSV instead.'
      );
      return null;
    }

    try {
      appendFileHandle = await window.showSaveFilePicker({
        suggestedName: 'sullivan_pv_pd_lp_results.csv',
        types: [
          {
            description: 'CSV file',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      });
      return appendFileHandle;
    } catch (error) {
      if (error && error.name !== 'AbortError') {
        window.alert(`Unable to open CSV file picker: ${error.message || error}`);
      }
      return null;
    }
  }

  async function appendCalculatorData() {
    const rows = collectAllRows();
    if (!rows) return;

    const handle = await getAppendFileHandle();
    if (!handle) return;

    try {
      const existingFile = await handle.getFile();
      const hasExistingData = existingFile.size > 0;

      const writable = await handle.createWritable({ keepExistingData: true });
      await writable.seek(existingFile.size);

      const content = buildCsvTextFromPairs(buildMasterPairs(rows));
      const csvChunk = hasExistingData ? `\n\n${content}` : content;

      await writable.write(csvChunk);
      await writable.close();

      window.alert('Results appended to CSV successfully.');
    } catch (error) {
      window.alert(`Failed to append results: ${error.message || error}`);
    }
  }

  function ensureExportButton() {
    const calculatorRoot = document.querySelector(CALCULATOR_SELECTOR);
    if (!calculatorRoot) return;

    if (document.getElementById(SCRIPT_BUTTON_ID) || document.getElementById(SCRIPT_APPEND_BUTTON_ID)) {
      return;
    }

    const resultsSection = calculatorRoot.querySelector(RESULTS_SELECTOR);
    if (!resultsSection) return;

    let buttonContainer = resultsSection.querySelector('.buttonContainer');
    if (!buttonContainer) {
      buttonContainer = document.createElement('div');
      buttonContainer.className = 'buttonContainer';
      resultsSection.appendChild(buttonContainer);
    }

    const button = document.createElement('button');
    button.id = SCRIPT_BUTTON_ID;
    button.type = 'button';
    button.className = 'button black-button';
    button.textContent = 'Export Results to CSV';
    button.style.marginRight = '8px';
    button.addEventListener('click', exportCalculatorData);

    const appendButton = document.createElement('button');
    appendButton.id = SCRIPT_APPEND_BUTTON_ID;
    appendButton.type = 'button';
    appendButton.className = 'button black-button';
    appendButton.textContent = 'Append to CSV';
    appendButton.style.marginRight = '8px';
    appendButton.addEventListener('click', () => {
      appendCalculatorData();
    });

    buttonContainer.insertBefore(appendButton, buttonContainer.firstChild);
    buttonContainer.insertBefore(button, buttonContainer.firstChild);
  }

  function watchSpaNavigation() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
      }

      if (location.pathname.startsWith('/calculators/pv-of-pd-and-lp')) {
        ensureExportButton();
      }
    }, 1200);
  }

  ensureExportButton();
  watchSpaNavigation();
})();
