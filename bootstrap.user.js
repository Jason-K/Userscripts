// ==UserScript==
// @name         Userscript Bootstrap Loader
// @namespace    https://github.com/Jason-K
// @version      1.0
// @description  Dynamically loads and opens all user scripts listed in scripts-index.js
// @match        *://*/*
// @grant        none
// ==/UserScript==

(async function () {
  const repo = "Jason-K/Userscripts";
  const branch = "main";
  const base = `https://github.com/Jason-K/Userscripts/raw/refs/heads/main/`;
  const indexURL = `https://github.com/Jason-K/Userscripts/raw/refs/heads/main/scripts-index.js`;

  try {
    await import(indexURL);

    if (!Array.isArray(window.USERSCRIPTS)) {
      alert("USERSCRIPTS index is invalid.");
      return;
    }

    const confirmed = confirm(
      `Install ${window.USERSCRIPTS.length} userscripts?\n\nThis will open each script in a new tab.`
    );
    if (!confirmed) return;

    for (const file of window.USERSCRIPTS) {
      const url = `${base}/${file}`;
      window.open(url, "_blank");
    }
  } catch (err) {
    console.error("Failed to load userscript index:", err);
    alert("Error loading userscript list.");
  }
})();