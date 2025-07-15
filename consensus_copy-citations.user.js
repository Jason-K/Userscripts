// ==UserScript==
// @name         Consensus Copy with Citation Links (Sorted)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Appends sorted, deduplicated citation links when copying from consensus.app
// @match        *://consensus.app/*
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

    frag.querySelectorAll('a[href*="/papers/"]').forEach((a) => {
      const label = a.textContent.trim();
      if (/^\d+$/.test(label)) {
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
      ([a], [b]) => Number(a) - Number(b)
    );

    const refsText = sorted
      .map(([n, url]) => `[${n}] ${shortenURL(url)}`)
      .join("\n");

    const refsHTML = sorted
      .map(([n, url]) => `<li>[${n}] <a href="${url}">${shortenURL(url)}</a></li>`)
      .join("");

    return {
      plain: `${normalizedPlain}\n\nReferences:\n${refsText}`,
      html: `<div>${normalizedHTML}<p><strong>References:</strong></p><ul>${refsHTML}</ul></div>`
    };
  }

  function shortenURL(url) {
    const match = url.match(/\/papers\/[^/]+\/([a-f0-9]{16,})/);
    return match ? `https://consensus.app/p/${match[1]}` : url;
  }
})();