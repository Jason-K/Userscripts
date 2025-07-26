// ==UserScript==
// @name         PDRater Rating Formatter (Button Version)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @author       Jason K.
// @description  Adds a "Copy & Format" button next to PDRater rating field to copy formatted result
// @match        *://*.pdrater.com/*
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/pdrater_copy-rating.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/pdrater_copy-rating.user.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function createButton() {
    const input = document.getElementById('ratingout0');
    if (!input || document.getElementById('ratingFormatterBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'ratingFormatterBtn';
    btn.textContent = 'Copy & Format';
    btn.style.marginLeft = '8px';
    btn.style.padding = '4px 8px';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';

    input.parentElement.insertBefore(btn, input.nextSibling);

    btn.addEventListener('click', () => {
      const raw = input.value;
      const pattern = /^(?:(\d+(?:\.\d+)?)\s*)?\(?(\d{2}(?:\.\d{2}){3})\s*-\s*(\d+)\s*-\s*(\[\d+\.\d+\])(\d+)\s*-\s*(\S+)\s*-\s*(\d+)\s*=\s*(\d+)%\)?(?:\s*=\s*(\d+(?:\.\d+)?)%\s*=\s*(\d+)%\s*)?$/;
      const match = raw.match(pattern);

      if (!match) {
        showPopup("⚠️ Rating format not recognized.");
        return;
      }

      const [
        , // full match
        local_Rating_Apportionment,
        local_Rating_Chapter,
        local_Rating_WPI,
        local_Rating_FEC,
        local_Rating_FECAdjusted,
        local_Rating_Occ,
        local_Rating_OccAdjusted,
        local_Rating_AgeAdjusted,
        local_Rating_PD,
        local_Rating_PDApportionment
      ] = match;

      const formatted = local_Rating_Apportionment
        ? `${local_Rating_Apportionment} (${local_Rating_Chapter} - ${local_Rating_WPI} - ${local_Rating_FEC}${local_Rating_FECAdjusted} - ${local_Rating_Occ} - ${local_Rating_OccAdjusted} - ${local_Rating_AgeAdjusted}) = ${local_Rating_PDApportionment}% PD`
        : `1.0 (${local_Rating_Chapter} - ${local_Rating_WPI} - ${local_Rating_FEC}${local_Rating_FECAdjusted} - ${local_Rating_Occ} - ${local_Rating_OccAdjusted} - ${local_Rating_AgeAdjusted}) = ${local_Rating_AgeAdjusted}% PD`;

      navigator.clipboard.writeText(formatted).then(() => {
        showPopup(`✅ Copied:\n${formatted}`);
      }).catch(err => {
        showPopup("❌ Failed to copy.");
        console.error(err);
      });
    });
  }

  function showPopup(message) {
    const popup = document.createElement("div");
    popup.textContent = message;
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      color: "white",
      padding: "10px 14px",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "monospace",
      whiteSpace: "pre-wrap",
      zIndex: 9999,
      boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
      transition: "opacity 0.5s ease",
      opacity: "1",
    });

    document.body.appendChild(popup);
    setTimeout(() => {
      popup.style.opacity = "0";
      setTimeout(() => popup.remove(), 500);
    }, 3000);
  }

  // Retry until the input is available (in case of dynamic rendering)
  const interval = setInterval(() => {
    if (document.getElementById("ratingout0")) {
      clearInterval(interval);
      createButton();
    }
  }, 500);
})();