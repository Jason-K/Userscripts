// ==UserScript==
// @name         Merus - Prevent Close Warning
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Prevents "Are you sure you want to close this tab?" warning on MerusCase
// @author       You
// @match        https://*.meruscase.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Wait for page to fully load to avoid Cloudflare detection
    window.addEventListener('load', function() {
        // Simply set onbeforeunload to null - passive approach
        window.onbeforeunload = null;

        // Use a mutation observer to watch for any attempts to re-add the handler
        const observer = new MutationObserver(function() {
            if (window.onbeforeunload !== null) {
                window.onbeforeunload = null;
            }
        });

        // Observe the document for any changes
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    });
})();
