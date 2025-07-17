// ==UserScript==
// @name         UpToDate Copy with Citation Links (Sorted)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Appends sorted, deduplicated citation links when copying from uptodate.com
// @match        *://*.uptodate.com/*
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/uptodate_copy-citations.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/uptodate_copy-citations.user.js
// @grant        none
// ==/UserScript==

(function () {
  let button = null;
  let selectionTimer = null;

  // Show floating button when user selects text
  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        removeCopyButton();
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showCopyButton(rect.left + window.scrollX, rect.top + window.scrollY - 35);
    }, 100);
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
      copyWithCitations();
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

  // Intercept Cmd/Ctrl+C
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const { plain, html } = buildCitationAppend(sel);
    if (plain && html) {
      e.clipboardData.setData("text/plain", plain);
      e.clipboardData.setData("text/html", html);
      e.preventDefault();
    }
  });

  function copyWithCitations() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

    const { plain, html } = buildCitationAppend(sel);
    const listener = (e) => {
      e.clipboardData.setData("text/plain", plain);
      e.clipboardData.setData("text/html", html);
      e.preventDefault();
    };
    document.addEventListener("copy", listener, { once: true });
    document.execCommand("copy");
  }

  function buildCitationAppend(selection) {
    const range = selection.getRangeAt(0).cloneRange();
    const frag = range.cloneContents();
    const citations = new Map(); // Map<label, href>

    frag.querySelectorAll('a.abstract_t').forEach((a) => {
      const label = a.textContent.trim();
      if (/^\d+(-\d+)?$/.test(label)) {
        citations.set(label, a.href); // deduplicates automatically
        a.textContent = `[${label}]`; // inline bracket replacement
      }
    });

    const container = document.createElement("div");
    container.appendChild(frag);
    const normalizedHTML = container.innerHTML;
    const normalizedPlain = container.textContent;

    // Sort citation map entries numerically by label
    const sorted = Array.from(citations.entries()).sort(
      ([a], [b]) => Number(a.split('-')[0]) - Number(b.split('-')[0])
    );

    const refsText = sorted.length > 0
      ? sorted.map(([n, url]) => `[${n}] ${url}`).join("\n")
      : "No references found.";

    const refsHTML = sorted.length > 0
      ? sorted.map(([n, url]) => `<li>[${n}] <a href="${url}">${url}</a></li>`).join("")
      : "<li>No references found.</li>";

    const pageTitle = document.title.trim() || "Untitled Page";
    const pageURL = window.location.href;

    const sourceText = `Source:\n"${pageTitle}" (${pageURL})`;
    const sourceHTML = `<p><strong>Source:</strong><br>"<em>${pageTitle}</em>" (<a href="${pageURL}">${pageURL}</a>)</p>`;

    return {
      plain: `${normalizedPlain}\n\n${sourceText}\n\nReferences:\n${refsText}`,
      html: `<div>${normalizedHTML}${sourceHTML}<p><strong>References:</strong></p><ul>${refsHTML}</ul></div>`
    };
  }
})();
