// ==UserScript==
// @name         Sullivan PV/PD/LP Export Results to CSV
// @namespace    https://github.com/Jason-K
// @version      1.1
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
  const RESULTS_SELECTOR = '#calculator-results';
  const CSV_HEADER = ['Section', 'Subsection', 'Label', 'Value'];

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

  function buildCsvRowsOnly(rows) {
    const lines = [];

    rows.forEach((row) => {
      lines.push([
        csvEscape(row.section),
        csvEscape(row.subsection),
        csvEscape(row.label),
        csvEscape(row.value),
      ].join(','));
    });

    return lines.join('\n');
  }

  function buildCsvText(rows) {
    return [
      CSV_HEADER.map(csvEscape).join(','),
      buildCsvRowsOnly(rows),
    ].filter(Boolean).join('\n');
  }

  function buildFilename() {
    const date = new Date();
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
      String(date.getHours()).padStart(2, '0'),
      String(date.getMinutes()).padStart(2, '0'),
      String(date.getSeconds()).padStart(2, '0'),
    ].join('');

    return `sullivan_pv_pd_lp_results_${stamp}.csv`;
  }

  function downloadCsv(content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = buildFilename();
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

    downloadCsv(buildCsvText(rows));
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

      const csvChunk = hasExistingData
        ? `\n${buildCsvRowsOnly(rows)}`
        : buildCsvText(rows);

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
