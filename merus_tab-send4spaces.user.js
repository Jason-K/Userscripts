// ==UserScript==
// @name         MerusCase Note Smart Tab
// @namespace    http://tampermonkey.net/
// @version      3.0
// @author       Jason K.
// @description  Insert or remove 4-space indents in MerusCase notes with Tab, Shift+Tab, and Backspace. Toggle behavior and nbsp support.
// @match        *://*.meruscase.com/*
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tab-send4spaces.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tab-send4spaces.user.js
// @grant        none
// ==/UserScript==

(function () {
  let enabled = true;
  let useNbsp = false;

  const logPrefix = "[MerusTab]";
  const SPACES = "    ";
  const NBSP = "\u00A0\u00A0\u00A0\u00A0";

  const toastStyle = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: #333;
    color: #fff;
    padding: 6px 10px;
    font-size: 12px;
    border-radius: 5px;
    z-index: 9999;
    opacity: 0.9;
  `;

  function showToast(text) {
    const toast = document.createElement("div");
    toast.textContent = text;
    toast.setAttribute("style", toastStyle);
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  function isInNoteEditable() {
    const el = document.activeElement;
    return (
      el &&
      el.isContentEditable &&
      el.classList.contains("note-editable")
    );
  }

  document.addEventListener("keydown", (e) => {
    if (!isInNoteEditable()) return;

    // ---- TOGGLES ----
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "t") {
      enabled = !enabled;
      showToast(`MerusTab ${enabled ? "enabled" : "disabled"}`);
      return;
    }

    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "n") {
      useNbsp = !useNbsp;
      showToast(`MerusTab using ${useNbsp ? "non-breaking spaces" : "regular spaces"}`);
      return;
    }

    if (!enabled) return;

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const content = useNbsp ? NBSP : SPACES;

    // ---- BACKSPACE: delete 4 spaces if behind caret ----
    if (e.key === "Backspace" && sel.isCollapsed) {
      const node = sel.anchorNode;
      const offset = sel.anchorOffset;

      if (node && node.nodeType === Node.TEXT_NODE && offset >= 4) {
        const preceding = node.textContent.slice(offset - 4, offset);
        if (preceding === content) {
          e.preventDefault();
          node.textContent =
            node.textContent.slice(0, offset - 4) + node.textContent.slice(offset);
          const newRange = document.createRange();
          newRange.setStart(node, offset - 4);
          newRange.setEnd(node, offset - 4);
          sel.removeAllRanges();
          sel.addRange(newRange);
          return;
        }
      }
    }

    // ---- TAB / SHIFT+TAB ----
    if (e.key === "Tab") {
      e.preventDefault();
      const selectedText = sel.toString();

      if (selectedText.includes("\n")) {
        if (e.shiftKey) {
          unindentMultipleLines(sel, content);
        } else {
          indentMultipleLines(sel, content);
        }
      } else {
        if (e.shiftKey) {
          tryUnindentInline(range, content);
        } else {
          insertAtCaret(range, content);
        }
      }
    }
  });

  function insertAtCaret(range, content) {
    range.deleteContents();
    const node = document.createTextNode(content);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function indentMultipleLines(sel, content) {
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(fragment);
    const lines = temp.innerText.split("\n");

    const indented = lines.map(line => content + line).join("\n");

    const newNode = document.createTextNode(indented);
    range.deleteContents();
    range.insertNode(newNode);

    const newRange = document.createRange();
    newRange.setStartBefore(newNode);
    newRange.setEndAfter(newNode);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function unindentMultipleLines(sel, content) {
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(fragment);
    const lines = temp.innerText.split("\n");

    const pattern = content.replace(/\u00A0/g, '\u00A0'); // safe for nbsp
    const unindented = lines.map(line =>
      line.startsWith(pattern) ? line.slice(content.length) : line
    ).join("\n");

    const newNode = document.createTextNode(unindented);
    range.deleteContents();
    range.insertNode(newNode);

    const newRange = document.createRange();
    newRange.setStartBefore(newNode);
    newRange.setEndAfter(newNode);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function tryUnindentInline(range, content) {
    const sel = window.getSelection();
    const node = sel.anchorNode;
    const offset = sel.anchorOffset;

    if (node && node.nodeType === Node.TEXT_NODE && offset >= content.length) {
      const before = node.textContent.slice(offset - content.length, offset);
      if (before === content) {
        node.textContent =
          node.textContent.slice(0, offset - content.length) +
          node.textContent.slice(offset);
        const newRange = document.createRange();
        newRange.setStart(node, offset - content.length);
        newRange.setEnd(node, offset - content.length);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }
  }

})();