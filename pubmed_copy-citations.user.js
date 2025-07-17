// ==UserScript==
// @name         PMC Copy with Citations (PubMed-style IDs)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Appends citation links when copying from PMC with references like "#B34"
// @match        *://pmc.ncbi.nlm.nih.gov/articles/*
// @grant        none
// ==/UserScript==


(function () {
  let button = null;
  let selectionTimer = null;

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
      background: #2d7f5e;
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
  const rawText = selection.toString();
  const range = selection.getRangeAt(0).cloneRange();
  const frag = range.cloneContents();

  const citations = new Map();

  const allMatches = [...rawText.matchAll(/\[(\d+)(?:[-–](\d+))?\]/g)];
  const citationNums = new Set();

  for (const match of allMatches) {
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;
    for (let n = start; n <= end; n++) {
      citationNums.add(n);
    }
  }

  for (const num of citationNums) {
    const refId = "B" + num;
    const refEl = document.getElementById(refId);
    if (!refEl) continue;

    let refText = refEl.textContent.trim().replace(/\s+/g, " ");
    refText = refText.replace(/\s*\[[^\]]+\]\s*/g, "").trim(); // strip [PubMed] etc.
    citations.set(num.toString(), refText);
  }

  const sorted = Array.from(citations.entries()).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  const refsText = sorted.map(([n, ref]) => `[${n}] ${ref}`).join("\n");
  const refsHTML = sorted.map(([n, ref]) => `<li>[${n}] ${ref}</li>`).join("");

  const paperTitle =
    document.querySelector('h1')?.textContent.trim() ||
    document.title.replace(" - PMC", "").trim();
  const pageURL = window.location.href;

  const sourceText = `Source:\n"${paperTitle}" (${pageURL})`;
  const sourceHTML = `<p><strong>Source:</strong><br>"<em>${paperTitle}</em>" (<a href="${pageURL}">${pageURL}</a>)</p>`;

  const container = document.createElement("div");
  container.appendChild(frag);
  const normalizedHTML = container.innerHTML;
  const normalizedPlain = container.textContent;

  return {
    plain: `${normalizedPlain}\n\n${sourceText}\n\nReferences:\n${refsText}`,
    html: `<div>${normalizedHTML}${sourceHTML}<p><br><strong>References:</strong></p><ul>${refsHTML}</ul></div>`
  };
}
})();