// ==UserScript==
// @name         Sullivan PV Calculator Export to CSV
// @namespace    https://github.com/Jason-K
// @version      1.8
// @author       Jason K.
// @description  Adds export and copy helpers for Sullivan PV calculators.
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/sullivan_export-pv-pd-lp-csv.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/sullivan_export-pv-pd-lp-csv.user.js
// @match        https://app.sullivanoncomp.com/calculators/pv-of-pd-and-lp*
// @match        https://app.sullivanoncomp.com/calculators/pv-of-ptd*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_BUTTON_ID = 'sullivan-export-results-csv-btn';
  const SCRIPT_APPEND_BUTTON_ID = 'sullivan-append-results-csv-btn';
  const CALCULATOR_SELECTOR = '#calculator';
  const RESULTS_SELECTOR = "#calculator-results";
  const PATH_PD_LP = "/calculators/pv-of-pd-and-lp";
  const PATH_PTD = "/calculators/pv-of-ptd";

  let lastUrl = location.href;

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

  function getInputValueBySelectors(root, selectors) {
    for (const selector of selectors) {
      const el = root.querySelector(selector);
      if (!el) continue;
      const value = String(el.value ?? "").trim();
      if (value) return value;
    }
    return "";
  }

  function getClientValue(root) {
    const first = getInputValueBySelectors(root, ["#worker-first-name"]);
    const last = getInputValueBySelectors(root, ["#worker-last-name"]);
    const full = [first, last].filter(Boolean).join(" ").trim();
    if (full) return full;

    const claimSelected = root.querySelector(
      ".vs__selected-options .selected-tag",
    );
    if (claimSelected) {
      return claimSelected.textContent.replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function getResultValueByLabel(root, labelText, occurrence = 1) {
    const containers = Array.from(
      root.querySelectorAll(`${RESULTS_SELECTOR} .resultContainer`),
    );
    const matches = containers.filter((container) => {
      const label = container.querySelector(".resultLabel");
      return (
        label && label.textContent.replace(/\s+/g, " ").trim() === labelText
      );
    });

    const container = matches[occurrence - 1];
    if (!container) return "";

    const valueNode = container.querySelector(".resultValue");
    return valueNode ? valueNode.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function getResultValueByLabelIncludes(root, needle, occurrence = 1) {
    const lowerNeedle = String(needle).toLowerCase();
    const containers = Array.from(
      root.querySelectorAll(`${RESULTS_SELECTOR} .resultContainer`),
    );
    const matches = containers.filter((container) => {
      const label = container.querySelector(".resultLabel");
      if (!label) return false;
      return label.textContent
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .includes(lowerNeedle);
    });

    const container = matches[occurrence - 1];
    if (!container) return "";

    const valueNode = container.querySelector(".resultValue");
    return valueNode ? valueNode.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function getCalculatorType() {
    if (location.pathname.startsWith(PATH_PTD)) return "ptd";
    if (location.pathname.startsWith(PATH_PD_LP)) return "pdlp";
    return "unknown";
  }

  function buildTemplateEntriesPdlp(calculatorRoot) {
    const entries = [
      {
        key: "client",
        label: "Client:",
        value: getClientValue(calculatorRoot),
      },
      {
        key: "dateBirth",
        label: "Date, birth:",
        value: getInputValueBySelectors(calculatorRoot, ["#date-of-birth"]),
      },
      {
        key: "dateInjury",
        label: "Date, injury:",
        value: getInputValueBySelectors(calculatorRoot, ["#date-of-injury"]),
      },
      {
        key: "dateMmi",
        label: "Date, MMI:",
        value: getInputValueBySelectors(calculatorRoot, [
          "#pd-commencement-outfielder",
          "#pd-commencement-date",
        ]),
      },
      {
        key: "dateCommutation",
        label: "Date, commutation:",
        value: getInputValueBySelectors(calculatorRoot, [
          "#date-of-calculation",
        ]),
      },
      {
        key: "rateInterest",
        label: "Rate, interest:",
        value: getInputValueBySelectors(calculatorRoot, ["#interest-rate"]),
      },
      {
        key: "rateCola",
        label: "Rate, COLA:",
        value: getInputValueBySelectors(calculatorRoot, [
          "#assumed-annual-increases",
        ]),
      },
      {
        key: "rateAwe",
        label: "Rate, AWE:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Average Weekly Earnings",
          1,
        ),
      },
      {
        key: "calculationMode",
        label: "Calculation Mode:",
        value: getResultValueByLabel(calculatorRoot, "Calculation Mode", 1),
      },
      {
        key: "ageCommutation",
        label: "Age, commutation",
        value: getResultValueByLabel(
          calculatorRoot,
          "Age on date of calculation",
          1,
        ),
      },
      {
        key: "lifeExpectancyCommutation",
        label: "Life expectancy, commutation:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Life Expectancy on date of calculation",
          1,
        ),
      },
      {
        key: "pdPercent",
        label: "PD, percent:",
        value: getInputValueBySelectors(calculatorRoot, ["#pd-rating"]),
      },
      {
        key: "pdRate",
        label: "PD, rate:",
        value: getResultValueByLabel(calculatorRoot, "PD weekly rate", 1),
      },
      {
        key: "pdWeeksTotal",
        label: "PD, weeks total:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Total weeks of Permanent Disability",
          1,
        ),
      },
      {
        key: "pdWeeksAccrued",
        label: "PD, weeks accrued:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Weeks of PD already paid",
          1,
        ),
      },
      {
        key: "pdWeeksRemaining",
        label: "PD, weeks remaining:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Weeks of PD remaining",
          1,
        ),
      },
      {
        key: "pdGrossUnpaid",
        label: "PD, gross value of unpaid balance:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Balance of PD due (without PV discount)",
          1,
        ),
      },
      {
        key: "pdPvUnpaid",
        label: "PD, PV of unpaid balance",
        value: getResultValueByLabel(
          calculatorRoot,
          "Present Value of remaining Permanent Disability",
          1,
        ),
      },
      {
        key: "lpRate",
        label: "LP, rate:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Life Pension weekly rate",
          1,
        ),
      },
      {
        key: "lpStartDate",
        label: "LP, start date:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Date Life Pension benefits start",
          1,
        ),
      },
      {
        key: "lpStartingRate",
        label: "LP, starting rate:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Life Pension weekly rate",
          1,
        ),
      },
      {
        key: "lpGrossUnpaid",
        label: "LP, gross value of unpaid balance:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Gross value of expected Life Pension payments with COLA applied",
          1,
        ),
      },
      {
        key: "lpPvUnpaid",
        label: "LP, PV of unpaid balance:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Present Value of expected Life Pension payments with COLA applied",
          1,
        ),
      },
      {
        key: "overallGrossUnpaid",
        label: "Overall, gross value of unpaid benefits:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Gross value of PD and Life Pension with COLA applied",
          1,
        ),
      },
      {
        key: "overallPvUnpaid",
        label: "Overall, PV of unpaid benefits:",
        value: getResultValueByLabel(
          calculatorRoot,
          "Gross total present value of PD and Life Pension with COLA applied",
          1,
        ),
      },
    ];

    return entries;
  }

  function buildTemplateEntriesPtd(calculatorRoot) {
    const entries = [
      {
        key: "client",
        label: "Client:",
        value: getClientValue(calculatorRoot),
      },
      {
        key: "dateBirth",
        label: "Date, birth:",
        value: getInputValueBySelectors(calculatorRoot, ["#date-of-birth"]),
      },
      {
        key: "dateInjury",
        label: "Date, injury:",
        value: getInputValueBySelectors(calculatorRoot, ["#date-of-injury"]),
      },
      {
        key: "dateMmi",
        label: "Date, MMI:",
        value: getInputValueBySelectors(calculatorRoot, [
          "#pd-commencement-outfielder",
          "#ptd-commencement-date",
          "#pd-commencement-date",
        ]),
      },
      {
        key: "dateCommutation",
        label: "Date, commutation:",
        value: getInputValueBySelectors(calculatorRoot, [
          "#date-of-calculation",
        ]),
      },
      {
        key: "rateInterest",
        label: "Rate, interest:",
        value: getInputValueBySelectors(calculatorRoot, ["#interest-rate"]),
      },
      {
        key: "rateCola",
        label: "Rate, COLA:",
        value: getInputValueBySelectors(calculatorRoot, [
          "#assumed-annual-increases",
        ]),
      },
      {
        key: "rateAwe",
        label: "Rate, AWE:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "Average Weekly Earnings",
          1,
        ),
      },
      {
        key: "rateStartingPtd",
        label: "Rate, starting PTD:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "PTD weekly rate at start date",
          1,
        ),
      },
      {
        key: "rateDocPtd",
        label: "Rate, date of commutation:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "PTD weekly rate on DOC",
          1,
        ),
      },
      {
        key: "calculationMode",
        label: "Calculation Mode:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "Calculation Mode",
          1,
        ),
      },
      {
        key: "ageCommutation",
        label: "Age, commutation",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "Age on date of calculation",
          1,
        ),
      },
      {
        key: "lifeExpectancyCommutation",
        label: "Life expectancy, commutation:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "Life Expectancy on date of calculation",
          1,
        ),
      },
      {
        key: "ptdAccrued",
        label: "PTD, accrued:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "PTD paid prior to DOC",
          1,
        ),
      },
      {
        key: "ptdGrossRemaining",
        label: "PTD, gross remaining:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "Gross Value of Remaining PTD Payments with COLA applied",
          1,
        ),
      },
      {
        key: "ptdPvRemaining",
        label: "PTD, PV remaining:",
        value: getResultValueByLabelIncludes(
          calculatorRoot,
          "Present Value of Remaining PTD Payments with COLA applied",
          1,
        ),
      },
    ];

    return entries;
  }

  function buildTemplateEntries(calculatorRoot) {
    const calculatorType = getCalculatorType();
    if (calculatorType === "ptd")
      return buildTemplateEntriesPtd(calculatorRoot);
    return buildTemplateEntriesPdlp(calculatorRoot);
  }

  function buildCsvTextFromTemplateEntries(entries) {
    return entries
      .map((entry) => `${csvEscape(entry.label)},${csvEscape(entry.value)}`)
      .join("\n");
  }

  function buildClipboardValuesOnly(entries) {
    return entries
      .map((entry) =>
        String(entry.value ?? "")
          .replace(/\r?\n/g, " ")
          .trim(),
      )
      .join("\n");
  }

  function getEntryValue(entries, key) {
    const entry = entries.find((item) => item.key === key);
    return entry ? entry.value : "";
  }

  function buildFilenameFromEntries(entries) {
    const calculatorType = getCalculatorType();
    const clientRaw = getEntryValue(entries, "client");
    const percentPdRaw = getEntryValue(entries, "pdPercent");
    const colaRaw = getEntryValue(entries, "rateCola");
    const interestRaw = getEntryValue(entries, "rateInterest");
    const presentValueRaw =
      calculatorType === "ptd"
        ? getEntryValue(entries, "ptdPvRemaining")
        : getEntryValue(entries, "overallPvUnpaid");
    const calcDateRaw = getEntryValue(entries, "dateCommutation");

    const clientName = sanitizeFilenamePart(
      formatClientName(clientRaw),
      "unnamed applicant",
    );
    const percentPD = sanitizeFilenamePart(
      normalizeNumericText(percentPdRaw),
      calculatorType === "ptd" ? "PTD" : "unknown",
    );
    const colaRate = sanitizeFilenamePart(
      normalizeNumericText(colaRaw),
      "unknown",
    );
    const interestRate = sanitizeFilenamePart(
      normalizeNumericText(interestRaw),
      "unknown",
    );
    const presentValue = sanitizeFilenamePart(presentValueRaw, "unknown");
    const calcDate = sanitizeFilenamePart(
      formatDateDots(calcDateRaw),
      "unknown date",
    );

    const benefitTag = calculatorType === "ptd" ? "PTD" : `${percentPD} PD`;
    return `${clientName} - ${benefitTag} - COLA ${colaRate} IR ${interestRate} - ${presentValue} on ${calcDate}.csv`;
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
    const calculatorRoot = document.querySelector(CALCULATOR_SELECTOR);
    if (!calculatorRoot) {
      window.alert("Calculator container was not found.");
      return;
    }

    const entries = buildTemplateEntries(calculatorRoot);
    const content = buildCsvTextFromTemplateEntries(entries);
    const filename = buildFilenameFromEntries(entries);
    downloadCsv(content, filename);
  }

  async function copyValuesToClipboard() {
    const calculatorRoot = document.querySelector(CALCULATOR_SELECTOR);
    if (!calculatorRoot) {
      window.alert("Calculator container was not found.");
      return;
    }

    try {
      const entries = buildTemplateEntries(calculatorRoot);
      const content = buildClipboardValuesOnly(entries);

      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(content);
      } else {
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = content;
        tempTextArea.style.position = "fixed";
        tempTextArea.style.left = "-9999px";
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand("copy");
        tempTextArea.remove();
      }

      window.alert("Values copied to clipboard.");
    } catch (error) {
      window.alert(`Failed to copy values: ${error.message || error}`);
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
    appendButton.textContent = "Copy Values to Clipboard";
    appendButton.style.marginRight = '8px';
    appendButton.addEventListener('click', () => {
      copyValuesToClipboard();
    });

    buttonContainer.insertBefore(appendButton, buttonContainer.firstChild);
    buttonContainer.insertBefore(button, buttonContainer.firstChild);
  }

  function watchSpaNavigation() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
      }

      if (
        location.pathname.startsWith(PATH_PD_LP) ||
        location.pathname.startsWith(PATH_PTD)
      ) {
        ensureExportButton();
      }
    }, 1200);
  }

  ensureExportButton();
  watchSpaNavigation();
})();
