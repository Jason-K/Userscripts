// ==UserScript==
// @name         Wikipedia Citation Copier with Button
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Adds a floating copy button to include references when copying text from Wikipedia
// @match        *://*.wikipedia.org/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/wikipedia_copy-citations.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/wikipedia_copy-citations.user.js
// ==/UserScript==

(function () {
  const LANG_REF_LABELS = {
    en: "References",
    es: "Referencias",
    fr: "Références",
    de: "Quellen",
    it: "Riferimenti",
    pt: "Referências",
    ru: "Источники",
    zh: "参考资料",
  };

  function getReferenceLabel() {
    const lang = location.hostname.split('.')[0];
    return LANG_REF_LABELS[lang] || LANG_REF_LABELS["en"];
  }

  let button = null;
  let selectionTimer = null;

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (sel.isCollapsed || !sel.toString().trim()) {
        removeCopyButton();
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showCopyButton(rect.left + window.scrollX, rect.top + window.scrollY - 30);
    }, 150);
  });

  function showCopyButton(x, y) {
    removeCopyButton();

    button = document.createElement("button");
    button.textContent = "📋 Copy with Citations";
    button.style = `
      position: absolute;
      top: ${y}px;
      left: ${x}px;
      z-index: 9999;
      padding: 5px 10px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      background: #3366cc;
      color: white;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;
    button.addEventListener("click", () => {
      copySelectionWithCitations();
      removeCopyButton();
    });

    document.body.appendChild(button);
  }

  function removeCopyButton() {
    if (button) {
      button.remove();
      button = null;
    }
  }

  function copySelectionWithCitations() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const selectedText = sel.toString();
    const citations = extractCitations(sel);

    const pageTitle = document.title.trim();
    const pageURL = window.location.href;

    const sourceText = `Source:\n"${pageTitle}" (${pageURL})`;
    const sourceHTML = `<p><strong>Source:</strong><br>"<em>${pageTitle}</em>" (<a href="${pageURL}">${pageURL}</a>)</p>`;

    const label = getReferenceLabel();
    const textBlock = `\n\n${label}:\n${citations.join("\n")}`;
    const htmlBlock = `<p><strong>${label}:</strong></p><ul>` + citations.map(c => `<li>${c}</li>`).join("") + "</ul>";

    const finalText = `${selectedText}\n\n${sourceText}${textBlock}`;
    const finalHTML = `<div>${getHTMLFromSelection()}${sourceHTML}${htmlBlock}</div>`;

    // Copy both text and HTML
    const listener = (e) => {
        e.clipboardData.setData("text/plain", finalText);
        e.clipboardData.setData("text/html", finalHTML);
        e.preventDefault();
    };

    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
  }

  function fallbackCopy(text) {
    const listener = (e) => {
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
    };
    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
  }

  function extractCitations(selection) {
    const citations = new Set();
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const links = fragment.querySelectorAll('sup.reference > a[href^="#cite_note-"]');

    links.forEach(link => {
      const href = link.getAttribute('href');
      const id = href.substring(1);
      const source = document.getElementById(id);
      if (source) {
        const cleaned = extractCitationText(source);
        if (cleaned) citations.add(`[${link.textContent}] ${cleaned}`);
      }
    });

    return Array.from(citations);
  }

  function extractCitationText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.mw-cite-backlink, .reference-text .error').forEach(el => el.remove());
    const ref = clone.querySelector('.reference-text');
    if (!ref) return null;
    let text = ref.textContent.trim().replace(/\s+/g, ' ').replace(/\.$/, '');
    return text;
  }

  function getHTMLFromSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return "";
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    const div = document.createElement("div");
    div.appendChild(fragment);
    return div.innerHTML;
  }
})();