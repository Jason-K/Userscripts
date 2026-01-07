// ==UserScript==
// @name         MerusCase Note Smart Tab
// @version      4.0.0
// @description  Insert or remove 4-space indents in MerusCase notes with Tab, Shift+Tab, and Backspace. Toggle behavior and nbsp support.
// @author       Jason K.
// @namespace    https://github.com/Jason-K
// @match        *://*.meruscase.com/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tab-send4spaces.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tab-send4spaces.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Initialize script using MerusCore
  const script = MerusCore.createScript({
    name: 'SmartTab',
    version: '4.0.0'
  });

  // Script configuration
  const config = {
    enabled: true,
    useNbsp: false,
    SPACES: "    ",
    NBSP: "\u00A0\u00A0\u00A0\u00A0",
    logPrefix: "[MerusTab]"
  };

  // Helper functions using MerusCore utilities
  function isInNoteEditable() {
    const el = document.activeElement;
    return (
      el &&
      el.isContentEditable &&
      el.classList.contains("note-editable")
    );
  }

  function getStatusMessage() {
    return `SmartTab ${config.enabled ? "enabled" : "disabled"}`;
  }

  function getSpacesMessage() {
    return `SmartTab using ${config.useNbsp ? "non-breaking spaces" : "regular spaces"}`;
  }

  // Initialize script with MerusCore
  script.init(() => {
    if (!MerusCore.utils.isMerusCase()) return;

    // Create status indicator button
    const statusButton = MerusCore.ui.createButton({
      text: '🔧 SmartTab',
      position: 'top-left',
      style: 'info',
      onClick: () => {
        config.enabled = !config.enabled;
        statusButton.setText(`🔧 SmartTab ${config.enabled ? 'ON' : 'OFF'}`);
        MerusCore.ui.showToast(getStatusMessage(), config.enabled ? 'success' : 'warning', 2000);
      }
    });

    document.body.appendChild(statusButton.element);

    // Add cleanup
    script.addCleanup(() => {
      statusButton.remove();
    });

    // Set up keyboard event listener
    const keydownHandler = (e) => {
      if (!isInNoteEditable()) return;

      // ---- TOGGLES ----
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "t") {
        config.enabled = !config.enabled;
        statusButton.setText(`🔧 SmartTab ${config.enabled ? 'ON' : 'OFF'}`);
        MerusCore.ui.showToast(getStatusMessage(), config.enabled ? 'success' : 'warning', 2000);
        return;
      }

      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "n") {
        config.useNbsp = !config.useNbsp;
        MerusCore.ui.showToast(getSpacesMessage(), 'info', 2000);
        return;
      }

      if (!config.enabled) return;

    const sel = window.getSelection();
      if (!sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      const content = config.useNbsp ? config.NBSP : config.SPACES;

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
    };

    // Add event listener with cleanup
    document.addEventListener("keydown", keydownHandler);
    script.addCleanup(() => {
      document.removeEventListener("keydown", keydownHandler);
    });
  });

  // Text manipulation functions (kept from original with minor improvements)
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
