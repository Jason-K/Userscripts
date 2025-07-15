// ==UserScript==
// @name         Userscript Bootstrap Loader
// @namespace    https://github.com/Jason-K
// @version      1.2
// @description  Dynamically loads and opens all user scripts listed in scripts-index.json
// @match        https://loadmyuserscripts.com/*
// @grant        none
// ==/UserScript==

(async function () {
  const repo = "Jason-K/Userscripts";
  const branch = "main";
  const base = `https://raw.githubusercontent.com/${repo}/${branch}`;
  const indexURL = `${base}/scripts-index.json`;

  try {
    const scripts = await fetch(indexURL).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    if (!Array.isArray(scripts)) {
      alert("scripts-index.json is invalid.");
      return;
    }

    const confirmed = confirm(
      `Install ${scripts.length} userscripts?\n\nThis will open each script in a new tab.`
    );
    if (!confirmed) return;

    for (const file of scripts) {
      const url = `${base}/${file}`;
      window.open(url, "_blank");
    }
  } catch (err) {
    console.error("Failed to load userscript index:", err);
    alert("Error loading userscript list.");
  }
})();