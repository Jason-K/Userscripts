// ==UserScript==
// @name         URL Redirector (Velja replacement)
// @namespace    https://github.com/jason-k
// @version      1.0.0
// @description  Redirect legal/work URLs to Velja-equivalent targets
// @author       Jason
// @match        *://*/*
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const href = window.location.href;

  const rules = [
    {
      // sullivannoncomp, lexis, pdrater, caaa, uptodate, etc.
      from: /^(https?:\/\/)(www\.)?((sullivannoncomp|.*lexis|pdrater|caaa|uptodate|g[^/]*))(.*)/i,
      to: (m) => `https://www.${m[3]}${m[5]}`,
    },
    {
      // docusign.com / docusign.net
      from: /^(https?:\/\/)(www\.)?(docusign)(\.com|\.net)(\/.*)?$/i,
      to: (m) => `https://www.${m[3]}${m[4]}${m[5] ?? ''}`,
    },
    {
      // meruscase.com — open as-is (rule just forced Velja to pick a browser)
      from: /^(https?:\/\/)(www\.)?(meruscase\.com.*)/i,
      to: (m) => `https://www.${m[3]}`,
    },
  ];

  for (const rule of rules) {
    const m = href.match(rule.from);
    if (m) {
      const target = rule.to(m);
      if (target !== href) {
        window.location.replace(target);
      }
      break;
    }
  }
})();
