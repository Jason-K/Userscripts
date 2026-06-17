// ==UserScript==
// @name         MerusCase Unified Utilities
// @namespace    https://github.com/Jason-K/Userscripts
// @version      3.9.6.0
// @description  Combined MerusCase utilities: Default Assignee, PDF Download, Smart Renamer, Email Renamer, Smart Tab, Close Warning Prevention, Antinote Integration, and Request Throttling
// @author       Jason Knox
// @match        https://*.meruscase.com/*
// @match        https://meruscase-customer-uploads.s3.amazonaws.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      meruscase.com
// @connect      meruscase-customer-uploads.s3.amazonaws.com
// @connect      self
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_unified.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_unified.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================================
    // REQUEST RATE LIMITER - MUST RUN FIRST (document-start)
    // Intercepts MerusCase's runaway API calls caused by mouseenter→focus cascade
    // ============================================================================

    const RequestThrottler = {
        requestLog: new Map(),
        WINDOW_MS: 5000,
        MAX_REQUESTS: 3,
        BLOCK_DURATION_MS: 10000,
        blockedUntil: new Map(),
        stats: { blocked: 0, allowed: 0, focusDebounced: 0 },

        // Focus event debouncing
        lastFocusTime: 0,
        FOCUS_DEBOUNCE_MS: 2000,

        // URL patterns to throttle
        THROTTLE_PATTERNS: [
            '/activities/view/',
            '/caseFiles/view/'
        ],

        shouldThrottleUrl(url) {
            if (!url) return false;
            return this.THROTTLE_PATTERNS.some(pattern => url.includes(pattern));
        },

        shouldBlock(url) {
            if (!this.shouldThrottleUrl(url)) return false;

            const now = Date.now();
            const urlKey = url.split('?')[0]; // Normalize URL without query params

            // Check if currently blocked
            const blocked = this.blockedUntil.get(urlKey);
            if (blocked && now < blocked) {
                this.stats.blocked++;
                if (this.stats.blocked % 10 === 1) { // Log every 10th block to reduce spam
                    console.warn(`⏳ Blocked (rate limit): ${urlKey} [${this.stats.blocked} total blocked]`);
                }
                return true;
            }

            // Get or create request log entry
            let log = this.requestLog.get(urlKey);
            if (!log || now - log.firstRequest > this.WINDOW_MS) {
                log = { count: 0, firstRequest: now };
            }

            log.count++;
            log.lastRequest = now;
            this.requestLog.set(urlKey, log);

            // Check if over limit
            if (log.count > this.MAX_REQUESTS) {
                this.blockedUntil.set(urlKey, now + this.BLOCK_DURATION_MS);
                this.stats.blocked++;
                console.warn(`🚫 Rate limit hit: ${urlKey} (${log.count} requests in ${this.WINDOW_MS}ms) - blocking for ${this.BLOCK_DURATION_MS/1000}s`);
                return true;
            }

            this.stats.allowed++;
            return false;
        },

        init() {
            const self = this;

            // ─────────────────────────────────────────────────────────────────
            // Intercept XMLHttpRequest
            // ─────────────────────────────────────────────────────────────────
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                this._throttleUrl = url;
                this._throttleMethod = method;
                return originalXHROpen.call(this, method, url, ...args);
            };

            XMLHttpRequest.prototype.send = function(...args) {
                try {
                    if (self.shouldBlock(this._throttleUrl)) {
                        const xhr = this;
                        setTimeout(() => {
                            // Simulate a 429 response
                            try {
                                Object.defineProperty(xhr, 'status', { value: 429, configurable: true });
                                Object.defineProperty(xhr, 'statusText', { value: 'Too Many Requests (Throttled by Userscript)', configurable: true });
                                Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
                                Object.defineProperty(xhr, 'responseText', { value: '{"error":"Rate limited by userscript"}', configurable: true });
                            } catch (e) {
                                // Property definition may fail on some browsers
                            }
                            try {
                                xhr.dispatchEvent(new Event('readystatechange'));
                                xhr.dispatchEvent(new Event('error'));
                                xhr.dispatchEvent(new Event('loadend'));
                            } catch (e) {
                                // Event dispatch may fail
                            }
                        }, 0);
                        return;
                    }
                    return originalXHRSend.apply(this, args);
                } catch (e) {
                    console.warn('Error in XHR interception:', e);
                    return originalXHRSend.apply(this, args);
                }
            };

            // ─────────────────────────────────────────────────────────────────
            // Intercept fetch API
            // ─────────────────────────────────────────────────────────────────
            const originalFetch = window.fetch;
            if (typeof originalFetch === "function") {
              const wrappedFetch = function (input, ...args) {
                const url =
                  typeof input === "string"
                    ? input
                    : input?.url || input?.toString() || "";
                if (self.shouldBlock(url)) {
                  return Promise.resolve(
                    new Response(
                      JSON.stringify({ error: "Rate limited by userscript" }),
                      {
                        status: 429,
                        statusText:
                          "Too Many Requests (Throttled by Userscript)",
                      },
                    ),
                  );
                }
                return originalFetch.call(this, input, ...args);
              };

              // In Firefox/userscript injected worlds, fetch can be read-only.
              // If so, skip fetch interception and continue with XHR/focus guards.
              const fetchDescriptor = Object.getOwnPropertyDescriptor(
                window,
                "fetch",
              );
              const canAssignFetch =
                !fetchDescriptor ||
                fetchDescriptor.writable ||
                typeof fetchDescriptor.set === "function";

              if (canAssignFetch) {
                try {
                  window.fetch = wrappedFetch;
                } catch (e) {
                  console.warn(
                    "⚠️ Could not patch fetch (continuing without fetch throttle):",
                    e,
                  );
                }
              } else {
                console.warn(
                  "⚠️ window.fetch is read-only; fetch throttling disabled in this context",
                );
              }
            }

            // ─────────────────────────────────────────────────────────────────
            // Debounce synthetic focus events (the root cause)
            // MerusCase fires focus on every mouseenter which triggers API calls
            // ─────────────────────────────────────────────────────────────────
            this.patchFocusEvents();

            console.log('✓ Request throttler enabled (protecting activities/view, caseFiles/view)');
        },

        patchFocusEvents() {
            const self = this;

            // Wait for MooTools to load, then patch
            const patchWhenReady = () => {
                // Patch window.fireEvent if it exists (MooTools)
                if (typeof window.fireEvent === 'function') {
                    const originalFireEvent = window.fireEvent;
                    window.fireEvent = function(eventType, ...args) {
                        if (eventType === 'focus') {
                            const now = Date.now();
                            if (now - self.lastFocusTime < self.FOCUS_DEBOUNCE_MS) {
                                self.stats.focusDebounced++;
                                return this; // Skip - too soon
                            }
                            self.lastFocusTime = now;
                        }
                        return originalFireEvent.call(this, eventType, ...args);
                    };
                    console.log('✓ Focus event debouncing enabled (MooTools window.fireEvent)');
                    return true;
                }
                return false;
            };

            // Try immediately
            if (!patchWhenReady()) {
                // Retry after DOM loads
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(patchWhenReady, 100);
                    });
                } else {
                    setTimeout(patchWhenReady, 100);
                }
            }

            // Also patch Element.prototype.fireEvent for MooTools elements
            const patchElementFireEvent = () => {
                if (typeof Element !== 'undefined' && Element.prototype && typeof Element.prototype.fireEvent === 'function') {
                    const originalElementFireEvent = Element.prototype.fireEvent;
                    Element.prototype.fireEvent = function(eventType, ...args) {
                        if (eventType === 'focus' && this === window) {
                            const now = Date.now();
                            if (now - self.lastFocusTime < self.FOCUS_DEBOUNCE_MS) {
                                self.stats.focusDebounced++;
                                return this;
                            }
                            self.lastFocusTime = now;
                        }
                        return originalElementFireEvent.call(this, eventType, ...args);
                    };
                    console.log('✓ Focus event debouncing enabled (Element.prototype.fireEvent)');
                }
            };

            setTimeout(patchElementFireEvent, 500);
        },

        getStats() {
            return {
                ...this.stats,
                activeBlocks: [...this.blockedUntil.entries()].filter(([k, v]) => v > Date.now()).length,
                trackedUrls: this.requestLog.size
            };
        }
    };

    // Initialize throttler IMMEDIATELY (before MerusCase loads)
    RequestThrottler.init();

    // ============================================================================
    // REMAINING MODULES - Wait for DOM
    // ============================================================================

    function initializeModules() {
      // Fallback for GM_addStyle
      if (typeof GM_addStyle !== "function") {
        window.GM_addStyle = function (css) {
          const style = document.createElement("style");
          style.textContent = css;
          document.head.appendChild(style);
          return style;
        };
      }

      console.log(
        "🚀 MerusCase Unified Utilities v3.9.6.0 initializing modules...",
      );

      // ============================================================================
      // SHARED UTILITIES
      // ============================================================================

      const Utils = {
        debounce(func, delay) {
          let timeout;
          return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
          };
        },

        formatDate(date, format = "MM/DD/YYYY") {
          const d = date instanceof Date ? date : new Date(date);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");

          switch (format) {
            case "MM/DD/YYYY":
              return `${month}/${day}/${year}`;
            case "YYYY.MM.DD":
              return `${year}.${month}.${day}`;
            case "MM/DD/YY":
              return `${month}/${day}/${String(year).slice(-2)}`;
            default:
              return `${month}/${day}/${year}`;
          }
        },

        parseDate(text) {
          if (!text) return null;

          // ISO format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
          const isoMatch = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
          if (isoMatch) {
            const [, year, month, day] = isoMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          }

          // US format with 4-digit year: MM-DD-YYYY or MM/DD/YYYY or MM.DD.YYYY or MM_DD_YYYY
          const usMatch = text.match(/(\d{1,2})[-/._](\d{1,2})[-/._](\d{4})/);
          if (usMatch) {
            const [, month, day, year] = usMatch;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          }

          // US format with 2-digit year: MM-DD-YY or MM/DD/YY or MM.DD.YY or MM_DD_YY
          const us2DigitMatch = text.match(
            /(\d{1,2})[-/._](\d{1,2})[-/._](\d{2})(?!\d)/,
          );
          if (us2DigitMatch) {
            let [, month, day, year] = us2DigitMatch;
            // Convert 2-digit year to 4-digit (assumes 20xx for years 00-99)
            const fullYear = 2000 + parseInt(year);
            return new Date(fullYear, parseInt(month) - 1, parseInt(day));
          }

          // Compact format with 2-digit year: MMDDYY (6 digits)
          const compactMatch = text.match(
            /(?:^|_)(\d{2})(\d{2})(\d{2})(?:$|_|\.)/,
          );
          if (compactMatch) {
            let [, month, day, year] = compactMatch;
            // Convert 2-digit year to 4-digit
            const fullYear = 2000 + parseInt(year);
            return new Date(fullYear, parseInt(month) - 1, parseInt(day));
          }

          return null;
        },

        sanitizeFilename(str) {
          return str
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        },

        titleCase(text, acronyms = []) {
          const acronymSet = new Set(acronyms);
          // Use regex that captures letters with optional periods (e.g., "m.d." as one word)
          return text
            .toLowerCase()
            .replace(/\b([a-z]+(?:\.[a-z]+)*)\.?\b/g, (match, word) => {
              // Remove periods for comparison
              const stripped = word.replace(/\./g, "");
              const upper = stripped.toUpperCase();
              if (acronymSet.has(upper)) return upper;

              // Regular title case
              return word.charAt(0).toUpperCase() + word.slice(1);
            });
        },

        getCaseName() {
          const el = document.querySelector(
            "#lpClientName span.pretty-name-span",
          );
          if (!el) return "Unknown Case";
          const raw = (el.getAttribute("title") || el.textContent || "").trim();
          const namePart = raw.split(" v. ")[0].trim();
          return namePart;
        },

        // Consolidated list of acronyms that should remain uppercase
        ACRONYMS: [
          "ADR",
          "AME",
          "APPROVAL",
          "C&R",
          "CMC",
          "DENIAL",
          "DOR",
          "EMG",
          "LF",
          "LT",
          "MD",
          "MMI",
          "MOD",
          "MODIFICATION",
          "MRI",
          "MSA",
          "MSC",
          "NCV",
          "OAC&R",
          "OACR",
          "PC",
          "PPD",
          "PR2",
          "PT",
          "PTP",
          "QME",
          "RFP",
          "ROG",
          "SC",
          "SDT",
          "TTD",
          "UR",
          "WCAB",
          "WCJ",
          "XR",
        ],

        // Consolidated list of words that should remain lowercase in titles
        LOWERCASE_WORDS: [
          "a",
          "about",
          "affidavit",
          "agreement",
          "among",
          "an",
          "and",
          "as",
          "assessment",
          "at",
          "between",
          "by",
          "case",
          "concerning",
          "contract",
          "declaration",
          "deposition",
          "document",
          "email",
          "evaluation",
          "file",
          "for",
          "form",
          "from",
          "in",
          "interview",
          "letter",
          "note",
          "notes",
          "of",
          "on",
          "or",
          "per",
          "re",
          "regarding",
          "report",
          "statement",
          "summary",
          "the",
          "to",
          "transcript",
          "via",
          "with",
        ],

        // Consolidated substitution function for all renaming operations
        applyStandardSubstitutions(text) {
          if (!text) return text;

          // Define substitutions: [pattern, replacement, flags]
          // Patterns are case-insensitive by default
          const substitutions = [
            // Parties
            [/\bqualified medical evaluator\b/gi, "QME"],
            [/\bWorkers' Compensation Appeals Board\b/gi, "WCAB"],
            [/\bAppeals'? Board\b/gi, "WCAB"],
            [/\bBoard\b/gi, "WCAB"],
            [/\bdefense attorney\b/gi, "DA"],
            [/\bjudge\b/gi, "WCJ"],
            [/\bagreed medical evaluator\b/gi, "AME"],

            // Reports
            [/\btreatment report\b/gi, "PR2"],
            [/\bMRI report\b/gi, "MRI"],
            [/\bEMG\/NCS\b/gi, "EMG-NCS"],
            [/\bEMG NCS\b/gi, "EMG-NCS"],
            [/\bbenefits printout\b/gi, "POB"],
            [/\bprintout of benefits\b/gi, "POB"],

            // Letters (must be checked in order from most specific to least specific)
            [/\bletter to\b/gi, "LT-"],
            [/\bletter from\b/gi, "LF-"],
            [/\b\- WCAB\b/gi, " -WCAB"],
            [/\b\- judge\b/gi, " -WCJ"],
            [/\b\- QME\b/gi, "LT-QME"],
            [/\b\- AME\b/gi, "LT-AME"],
            [/\b\- MD\b/gi, "LT-MD"],
            [/\b\- PTP\b/gi, "LT-MD"],
            [/\b\- D\b/gi, "LT-D"],
            [/\b\- C\b/gi, "LT-C"],

            // Medicare Set Aside
            [/\bmedicare set-aside\b/gi, "MSA"],
            [/\bmedicare set aside\b/gi, "MSA"],
            [/\bMSA allocation\b/gi, "MSA"],
            [/\bMSA proposal\b/gi, "MSA"],
            [/\bproposed MSA\b/gi, "MSA"],

            // Business entity suffixes
            [/\ba professional corporation\b/gi, ""],
            [/\bA Prof\. Corp\.\b/gi, ""],
            [/\bprof corp\b/gi, ""],
            [/\binc\b/gi, ""],
            [/\bincorporated\b/gi, ""],
            [/\bcorp\b/gi, ""],
            [/\bcorporation\b/gi, ""],

            // Litigation documents
            [/\bdeposition\b/gi, "depo"],
            [/\bdeclaration of readiness to proceed\b/gi, "DOR"],
            [/\bdeclaration of readiness\b/gi, "DOR"],

            // hearing types
            [/\bmandatory settlement conference\b/gi, "MSC"],
            [/\bmandatory settlement\b/gi, "MSC"],
            [/\bstatus conference\b/gi, "SC"],
            [/\bpriority conference\b/gi, "PC"],
            [/\bcase management conference\b/gi, "CMC"],
            [/\bmediation\b/gi, "ADR"],
            [/\barbitration\b/gi, "ADR"],

            // discovery
            [/\binterrogatory\b/gi, "ROG"],
            [/\brequest for production\b/gi, "RFP"],
            [/\bsubpoena\b/gi, "SDT"],
          ];

          let result = text;
          for (const [pattern, replacement] of substitutions) {
            result = result.replace(pattern, replacement);
          }

          // Clean up multiple spaces that might result from removals
          result = result.replace(/\s+/g, " ").trim();

          // Clean up stray punctuation
          result = result.replace(/\s*-\s*$/g, ""); // Remove trailing dash
          result = result.replace(/\s*,\s*,/g, ","); // Remove double commas

          return result;
        },
      };

      const ClipboardUtils = {
        copyText(text) {
          if (!text) {
            return Promise.reject(new Error("No text provided for clipboard"));
          }

          // Firefox often blocks async clipboard writes after user activation expires.
          // Try synchronous copy first while still in the click event call stack.
          if (this.copyWithExecCommand(text)) {
            return Promise.resolve();
          }

          if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
          ) {
            return navigator.clipboard.writeText(text);
          }

          return Promise.reject(new Error("Clipboard unavailable"));
        },

        copyWithExecCommand(text) {
          try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.top = "-10000px";
            textarea.style.left = "-10000px";
            textarea.style.opacity = "0";

            const container = document.body || document.documentElement;
            container.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);

            const copied = document.execCommand("copy");
            textarea.remove();
            return copied;
          } catch (_e) {
            return false;
          }
        },
      };

      // ============================================================================
      // 1. PREVENT CLOSE WARNING
      // ============================================================================

        const PreventCloseWarning = {
          init() {
            // Firefox still shows native dialogs when sites use beforeunload listeners.
            // Block both property assignment and event listener registration.
            const originalAddEventListener =
              EventTarget.prototype.addEventListener;
            const originalRemoveEventListener =
              EventTarget.prototype.removeEventListener;

            const isBeforeUnload = (type) =>
              String(type).toLowerCase() === "beforeunload";

            try {
              Object.defineProperty(window, "onbeforeunload", {
                configurable: true,
                enumerable: true,
                get() {
                  return null;
                },
                set(_handler) {
                  // Intentionally ignored to suppress page-defined handlers.
                },
              });
            } catch (e) {
              // Ignore if browser disallows redefining this property.
            }

            // Firefox can still trigger dialogs when returnValue is set.
            // Ignore non-empty assignments while preserving normal event flow.
            try {
              const beforeUnloadProto =
                window.BeforeUnloadEvent && window.BeforeUnloadEvent.prototype;
              if (beforeUnloadProto) {
                Object.defineProperty(beforeUnloadProto, "returnValue", {
                  configurable: true,
                  enumerable: true,
                  get() {
                    return undefined;
                  },
                  set(_value) {
                    // Intentionally ignored.
                  },
                });
              }
            } catch (e) {
              // Ignore if browser disallows redefining this property.
            }

            EventTarget.prototype.addEventListener = function (
              type,
              listener,
              options,
            ) {
              if (
                isBeforeUnload(type) &&
                (this === window || this === document || this === document.body)
              ) {
                return;
              }
              return originalAddEventListener.call(
                this,
                type,
                listener,
                options,
              );
            };

            EventTarget.prototype.removeEventListener = function (
              type,
              listener,
              options,
            ) {
              if (
                isBeforeUnload(type) &&
                (this === window || this === document || this === document.body)
              ) {
                return;
              }
              return originalRemoveEventListener.call(
                this,
                type,
                listener,
                options,
              );
            };

            const neutralizeBeforeUnload = (event) => {
              event.stopImmediatePropagation();
              event.preventDefault();
              event.returnValue = undefined;
            };

            // Capture phase handler runs first and neutralizes any existing handlers.
            window.addEventListener("beforeunload", neutralizeBeforeUnload, {
              capture: true,
            });
            document.addEventListener("beforeunload", neutralizeBeforeUnload, {
              capture: true,
            });

            const protectFrame = (frameWin) => {
              try {
                if (!frameWin || !frameWin.document) return;
                try {
                  Object.defineProperty(frameWin, "onbeforeunload", {
                    configurable: true,
                    enumerable: true,
                    get() {
                      return null;
                    },
                    set(_handler) {
                      // Intentionally ignored.
                    },
                  });
                } catch (e) {
                  // Ignore if not configurable.
                }

                frameWin.addEventListener(
                  "beforeunload",
                  neutralizeBeforeUnload,
                  { capture: true },
                );
                frameWin.document.addEventListener(
                  "beforeunload",
                  neutralizeBeforeUnload,
                  { capture: true },
                );
              } catch (e) {
                // Cross-origin frames are inaccessible by design.
              }
            };

            const protectExistingFrames = () => {
              const frames = document.querySelectorAll("iframe");
              for (const frame of frames) {
                protectFrame(frame.contentWindow);
              }
            };

            const frameObserver = new MutationObserver(() => {
              protectExistingFrames();
            });

            frameObserver.observe(document.documentElement, {
              childList: true,
              subtree: true,
            });

            window.addEventListener("load", () => {
              window.onbeforeunload = null;
              protectExistingFrames();
            });
            console.log("✓ Close warning prevention enabled");
          },
        };

      // ============================================================================
      // 2. DEFAULT ASSIGNEE
      // ============================================================================

      const DefaultAssignee = {
        config: {
          defaultAssignee: "Sommer Murray (SEM)",
          setDueDate: true,
        },

        setDefaultAssignee() {
          const assigneeSelect = document.querySelector(
            'select[name="data[Task][user_id]"]',
          );
          if (!assigneeSelect) return false;

          let targetOption = null;
          for (let option of assigneeSelect.options) {
            if (option.textContent.includes(this.config.defaultAssignee)) {
              targetOption = option;
              break;
            }
          }

          if (targetOption && assigneeSelect.value !== targetOption.value) {
            assigneeSelect.value = targetOption.value;
            assigneeSelect.dispatchEvent(
              new Event("change", { bubbles: true }),
            );
            return true;
          }
          return false;
        },

        setTodayDate() {
          if (!this.config.setDueDate) return false;

          const dueDateInput = document.querySelector(
            'input[name="data[Task][date_due]"]',
          );
          if (!dueDateInput || dueDateInput.value.trim() !== "") return false;

          const today = Utils.formatDate(new Date(), "MM/DD/YYYY");
          dueDateInput.value = today;
          dueDateInput.dispatchEvent(new Event("input", { bubbles: true }));
          dueDateInput.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        },

        applyDefaults() {
          const assigneeSet = this.setDefaultAssignee();
          const dateSet = this.setTodayDate();
          if (assigneeSet || dateSet) {
            console.log("✓ Applied task defaults:", {
              assignee: assigneeSet,
              date: dateSet,
            });
          }
        },

        init() {
          if (window.location.href.includes("/tasks/add")) {
            setTimeout(() => this.applyDefaults(), 500);
          }

          document.addEventListener(
            "click",
            (event) => {
              const target = event.target.closest("a");
              if (!target) return;
              const href = target.href || "";
              const text = target.textContent || "";
              if (href.includes("/tasks/add") || text.includes("New Task")) {
                setTimeout(() => this.applyDefaults(), 500);
              }
            },
            true,
          );

          console.log("✓ Default assignee enabled");
        },
      };

      // ============================================================================
      // 3. SMART TAB (4 spaces in notes)
      // ============================================================================

      const SmartTab = {
        config: {
          enabled: true,
          useNbsp: false,
          SPACES: "    ",
          NBSP: "\u00A0\u00A0\u00A0\u00A0",
        },

        isInNoteEditable() {
          const el = document.activeElement;
          return (
            el && el.isContentEditable && el.classList.contains("note-editable")
          );
        },

        insertAtCaret(range, content) {
          range.deleteContents();
          const node = document.createTextNode(content);
          range.insertNode(node);
          range.setStartAfter(node);
          range.setEndAfter(node);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        },

        tryUnindentInline(range, content) {
          const sel = window.getSelection();
          const node = sel.anchorNode;
          const offset = sel.anchorOffset;

          if (
            node &&
            node.nodeType === Node.TEXT_NODE &&
            offset >= content.length
          ) {
            const before = node.textContent.substring(
              offset - content.length,
              offset,
            );
            if (before === content) {
              const newText =
                node.textContent.substring(0, offset - content.length) +
                node.textContent.substring(offset);
              node.textContent = newText;
              range.setStart(node, offset - content.length);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
              return true;
            }
          }
          return false;
        },

        init() {
          document.addEventListener("keydown", (e) => {
            if (!this.config.enabled || !this.isInNoteEditable()) return;

            const content = this.config.useNbsp
              ? this.config.NBSP
              : this.config.SPACES;

            if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const sel = window.getSelection();
              if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                this.insertAtCaret(range, content);
              }
            } else if (e.key === "Tab" && e.shiftKey) {
              e.preventDefault();
              const sel = window.getSelection();
              if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                this.tryUnindentInline(range, content);
              }
            } else if (e.key === "Backspace") {
              const sel = window.getSelection();
              if (sel.rangeCount > 0 && sel.isCollapsed) {
                const range = sel.getRangeAt(0);
                if (this.tryUnindentInline(range, content)) {
                  e.preventDefault();
                }
              }
            }
          });

          console.log("✓ Smart tab enabled");
        },
      };

      // ============================================================================
      // 4. QUICK PDF DOWNLOAD
      // ============================================================================

      const QuickPDFDownload = {
        // Walk up from the download link looking for a nearby element whose text
        // looks like a dated MerusCase filename (YYYY.MM.DD prefix). MerusCase
        // shows the original name in the UI but Content-Disposition often uses
        // an internal name without the date.
        _findDocumentNameFromDOM(link) {
          const container = link.closest(
            'tr, li, [class*="attach"], [class*="doc"], [class*="file"], [class*="activity"]'
          );
          if (!container) return '';
          for (const el of container.querySelectorAll('[title], a, span, td, label')) {
            if (el === link || el.contains(link)) continue;
            const text = (el.getAttribute('title') || el.textContent || '').trim();
            if (/^\d{4}[.\-]\d{2}[.\-]\d{2}[\s\-._]/.test(text)) return text;
          }
          return '';
        },

        // Build the sentinel filename from the client name, the XHR response,
        // and an optional DOM-derived filename (carries the original date when
        // the server's Content-Disposition omits it).
        _buildSentinelName(client, resp, domName) {
          // --- server filename from response headers ---
          const headers = resp.responseHeaders || '';
          let serverFilename = '';

          const starM = headers.match(/filename\*\s*=\s*(?:[^']*'')?([^;\r\n]+)/i);
          if (starM) serverFilename = decodeURIComponent(starM[1].trim());

          if (!serverFilename) {
            const plainM = headers.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);
            if (plainM) serverFilename = plainM[1].trim();
          }

          if (!serverFilename) {
            try {
              const p = new URL(resp.finalUrl || '').pathname;
              serverFilename = decodeURIComponent(p.split('/').pop() || '');
            } catch (_) {}
          }

          serverFilename = serverFilename || 'document.pdf';

          // --- extension (from server filename, most authoritative) ---
          const extMatch = serverFilename.match(/\.([a-z0-9]{1,6})$/i);
          const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';

          // Strip MerusCase's internal ".merged YYYYMMDDHHMMSS" suffix from the
          // server stem before using it for the title.
          const serverStem = serverFilename.replace(/\.[^.]+$/, '')
            .replace(/\.merged[\s_]*\d+$/i, '');
          console.log('[MerusUtils] serverFilename:', serverFilename, '| serverStem:', serverStem);

          // --- date ---
          // Priority: 1) YYYY.MM.DD at start of DOM name, 2) YYYY.MM.DD at start
          // of server stem, 3) /YYYY-MM-DD/ in final URL path, 4) Undated.
          let dateStr = 'Undated';
          const findDate = (s) => s && s.match(/^(\d{4})[.\-](\d{2})[.\-](\d{2})\b/);
          const domDate = findDate(domName);
          const srvDate = findDate(serverStem);
          if (domDate)    dateStr = `${domDate[1]}.${domDate[2]}.${domDate[3]}`;
          else if (srvDate) dateStr = `${srvDate[1]}.${srvDate[2]}.${srvDate[3]}`;
          else {
            try {
              const pd = new URL(resp.finalUrl || '').pathname.match(/\/(\d{4})-(\d{2})-(\d{2})\//);
              if (pd) dateStr = `${pd[1]}.${pd[2]}.${pd[3]}`;
            } catch (_) {}
          }

          // --- title: prefer server stem (cleaner), strip date prefix, clean separators ---
          const title = serverStem
            .replace(/^\d{4}[.\-]\d{2}[.\-]\d{2}\s*[-–—]?\s*/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || 'Untitled';

          const san = (s) => String(s).replace(/[<>"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim();
          const parts = [client, dateStr, title].map(s => san(s) || 'Unknown');
          return `${parts.join(' ___ ')}.${ext}`;
        },

        // Trigger a browser download of `blob` with the given filename.
        // Using a blob URL + <a download> avoids GM_download's colon
        // sanitization issue (GM_download replaces ':' with '_' on macOS).
        _saveBlob(blob, name) {
          const objUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href     = objUrl;
          a.download = name;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(objUrl);
          }, 2000);
        },

        handleDownloadClick(event) {
          const link = event.target.closest('a[aria-label="Download Document"]');
          if (!link) return;
          const href = link.href;
          if (!href) return;
          // Prevent MerusCase's bubble-phase handler from opening its inline
          // preview lightbox; we handle the download ourselves.
          event.preventDefault();

          const client = Utils.getCaseName();
          if (!client || client === 'Unknown Case') {
            console.warn('[MerusUtils] no client name found — opening directly');
            window.open(href, '_blank', 'noopener');
            return;
          }

          // Also cache client name for the S3InboxButton fallback (non-Firefox).
          try {
            GM_setValue('merus_pending_meta', JSON.stringify({ client, ts: Date.now() }));
          } catch (_) {}

          // Capture the DOM-visible filename NOW (before the XHR), because
          // Content-Disposition often uses an internal name without the date.
          const domName = this._findDocumentNameFromDOM(link);
          console.log('[MerusUtils] fetching document for client:', client,
            domName ? `| dom name: ${domName}` : '| no dom name found');

          GM_xmlhttpRequest({
            method: 'GET',
            url: href,
            responseType: 'blob',
            onload: (resp) => {
              try {
                const name = this._buildSentinelName(client, resp, domName);
                this._saveBlob(resp.response, name);
                console.log('[MerusUtils] saving to inbox as:', name);
              } catch (err) {
                console.error('[MerusUtils] save failed:', err);
              }
            },
            onerror: (resp) => {
              console.error('[MerusUtils] XHR error; opening directly', resp.status, resp.statusText);
              window.open(href, '_blank', 'noopener');
            },
          });
        },

        init() {
          const handler = this.handleDownloadClick.bind(this);
          document.addEventListener('click', handler, true);
          document.addEventListener('auxclick', handler, true);
          console.log('✓ Quick PDF download (inbox capture) enabled');
        },
      };


      // ============================================================================
      // 5. SMART RENAMER (Documents)
      // ============================================================================

      const SmartRenamer = {
        // Use shared acronyms list from Utils
        get ACRONYMS() {
          return new Set(Utils.ACRONYMS);
        },

        transform(stem) {
          // Strip file extension if present
          stem = stem.replace(/\.(pdf|doc|docx|txt|jpg|png|jpeg)$/i, "");

          // Apply standard substitutions FIRST
          stem = Utils.applyStandardSubstitutions(stem);

          // Extract and convert date
          const dateMatch = stem.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
          let date = "";
          if (dateMatch) {
            const parsedDate = Utils.parseDate(dateMatch[1]);
            if (parsedDate) {
              date = Utils.formatDate(parsedDate, "YYYY.MM.DD");
              stem = stem.replace(dateMatch[0], "").trim();
            }
          }

          // Remove common business suffixes
          stem = stem.replace(/,?\s*(llp|inc\.?|pc|corp\.?|llc)$/i, "");

          // Process tokens while preserving parentheses
          const tokens = stem.split(/\s+/);
          const processed = tokens.map((token) => {
            // Check if token has parentheses
            const parenMatch = token.match(/^(\(*)([^()]+)(\)*)$/);
            if (parenMatch) {
              const [, openParens, word, closeParens] = parenMatch;
              const upper = word.toUpperCase();
              if (this.ACRONYMS.has(upper)) {
                return openParens + upper + closeParens;
              }
              return (
                openParens +
                word.charAt(0).toUpperCase() +
                word.slice(1).toLowerCase() +
                closeParens
              );
            }

            const upper = token.toUpperCase();
            if (this.ACRONYMS.has(upper)) return upper;
            return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
          });

          let result = processed.join(" ");
          if (date) result = `${date} - ${result}`;

          return result.replace(/\s+/g, " ").trim();
        },

        extractDate(dateStr) {
          const parsed = Utils.parseDate(dateStr);
          return parsed ? Utils.formatDate(parsed, "YYYY.MM.DD") : "";
        },

        handleRename() {
          const input = document.querySelector(
            'input[name="data[Upload][description]"]',
          );
          if (!input) {
            console.log("❌ Smart renamer: Description input not found");
            return;
          }

          const original = input.value.trim();
          if (!original) {
            console.log("❌ Smart renamer: Input is empty");
            return;
          }

          const transformed = this.transform(original);
          if (transformed !== original) {
            input.value = transformed;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("✓ Renamed:", original, "→", transformed);
          } else {
            console.log("ℹ️ Smart renamer: No changes needed");
          }
        },

        init() {
          let isRenaming = false;

          // Listen for clicks on rename button
          document.addEventListener(
            "click",
            (event) => {
              const btn = event.target.closest("button.rename-button");

              if (btn) {
                console.log("🔍 Rename button clicked, waiting for dialog...");
                isRenaming = true;

                setTimeout(() => {
                  this.handleRename();
                  setTimeout(() => {
                    isRenaming = false;
                  }, 200);
                }, 500);
              }
            },
            true,
          );

          // Watch for the input field appearing
          const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                  const input = node.querySelector?.(
                    'input[name="data[Upload][description]"]',
                  );
                  if (input && isRenaming) {
                    console.log("🔍 Rename input detected via observer");
                    setTimeout(() => this.handleRename(), 100);
                  }
                }
              }
            }
          });

          observer.observe(document.body, { childList: true, subtree: true });

          console.log("✓ Smart renamer enabled");
        },
      };

      // ============================================================================
      // 6. EMAIL RENAMER
      // ============================================================================

      const EmailRenamer = {
        isEmailView() {
          return document.querySelector("#message-sender") !== null;
        },

        extractEmailInfo() {
          const sender =
            document.querySelector("#message-sender")?.textContent.trim() || "";
          const recipientText =
            document.querySelector("#message-recipient")?.textContent.trim() ||
            "";
          // Extract description from note-editable content
          const description =
            document
              .querySelector(".note-editable.panel-body")
              ?.textContent.trim() || "";
          const dateEl = document.querySelector("#merus-message-sent-date");

          // Parse date and time from merus-message-sent-date element
          // Format: "01/08/2026 12:02 PM"
          let date = new Date();
          if (dateEl) {
            const dateText = dateEl.textContent.trim();
            // Parse the date and time together
            const parsed = new Date(dateText);
            if (!isNaN(parsed.getTime())) {
              date = parsed;
            }
          }

          return { sender, recipientText, description, date };
        },

        extractRecipientNames(recipientText) {
          if (!recipientText) return null;

          // Split by comma and process each recipient
          const recipients = recipientText.split(",").map((r) => r.trim());
          const contactRecipients = [];

          for (const recipient of recipients) {
            // Match "Name <email@domain.com>" format
            const match = recipient.match(/^(.+?)\s*<[^>]+>$/);
            if (match) {
              contactRecipients.push(match[1].trim());
            }
          }

          // Return null if no contact recipients found
          if (contactRecipients.length === 0) return null;

          // Return first recipient with "et al" if there are more
          if (contactRecipients.length === 1) {
            return contactRecipients[0];
          } else {
            return `${contactRecipients[0]} et al`;
          }
        },

        generateEmailName(info) {
          const dateStr = Utils.formatDate(info.date, "YYYY.MM.DD");
          const timeStr = info.date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });

          // Extract sender name from "First Last <email@domain.com>" format
          let senderName = info.sender;
          const angleMatch = info.sender.match(/^(.+?)\s*<[^>]+>$/);
          if (angleMatch) {
            senderName = angleMatch[1].trim();
          } else {
            // Fallback: if no angle brackets, extract name before @ if it exists
            senderName = info.sender.split("<")[0].trim();
          }

          // Apply sender name substitutions
          if (info.sender.includes("jknox@boxerlaw.com")) {
            senderName = "JJK";
          } else if (info.sender.includes("smurray@boxerlaw.com")) {
            senderName = "SEM";
          } else if (info.sender.includes("jlitvack@boxerlaw.com")) {
            senderName = "JML";
          }

          // Extract recipient names (only those with contact info)
          const recipientNames = this.extractRecipientNames(info.recipientText);
          const recipientPart = recipientNames ? ` to ${recipientNames}` : "";

          // Apply standard substitutions to description before truncating
          let processedDesc = Utils.applyStandardSubstitutions(
            info.description,
          );
          const descShort = processedDesc.substring(0, 50).trim();

          return `${dateStr} at ${timeStr} - email from ${senderName}${recipientPart} - ${descShort}`;
        },

        async renameEmail() {
          if (!this.isEmailView()) {
            console.log("❌ Email renamer: Not in email view");
            return;
          }

          const info = this.extractEmailInfo();
          const newName = this.generateEmailName(info);

          // Extract sender name for the document_author field
          let senderName = info.sender;
          const angleMatch = info.sender.match(/^(.+?)\s*<[^>]+>$/);
          if (angleMatch) {
            senderName = angleMatch[1].trim();
          }

          // Apply sender name substitutions
          if (info.sender.includes("jknox@boxerlaw.com")) {
            senderName = "JJK";
          } else if (info.sender.includes("smurray@boxerlaw.com")) {
            senderName = "SEM";
          } else if (info.sender.includes("jlitvack@boxerlaw.com")) {
            senderName = "JML";
          }

          // Format date for document_date field (MM/DD/YYYY)
          const dateStr = Utils.formatDate(info.date, "MM/DD/YYYY");

          // Populate note-editable (activity description)
          const noteEditable = document.querySelector(
            ".note-editable.panel-body",
          );
          if (noteEditable) {
            noteEditable.textContent = newName;
            noteEditable.dispatchEvent(new Event("input", { bubbles: true }));
            noteEditable.dispatchEvent(new Event("change", { bubbles: true }));
          }

          // Populate document_date field
          const docDateInput = document.querySelector(
            'input[name="data[Upload][document_date]"]',
          );
          if (docDateInput) {
            docDateInput.value = dateStr;
            docDateInput.dispatchEvent(new Event("input", { bubbles: true }));
            docDateInput.dispatchEvent(new Event("change", { bubbles: true }));
          }

          // Populate document_author field
          const docAuthorInput = document.querySelector(
            'input[name="data[Upload][document_author]"]',
          );
          if (docAuthorInput) {
            docAuthorInput.value = senderName;
            docAuthorInput.dispatchEvent(new Event("input", { bubbles: true }));
            docAuthorInput.dispatchEvent(
              new Event("change", { bubbles: true }),
            );
          }

          if (noteEditable || docDateInput || docAuthorInput) {
            console.log("✓ Email renamed and metadata populated:", {
              newName,
              date: dateStr,
              author: senderName,
            });
          } else {
            console.log("❌ Email renamer: Required form elements not found");
          }
        },

        init() {
          let isEditing = false;

          // Listen for clicks on edit button
          document.addEventListener(
            "click",
            (event) => {
              const btn = event.target.closest(
                "button.edit-button.activity-control",
              );
              if (btn && this.isEmailView()) {
                console.log(
                  "🔍 Edit button clicked on email, waiting for dialog...",
                );
                isEditing = true;
                setTimeout(() => {
                  this.renameEmail();
                  isEditing = false;
                }, 500);
              }
            },
            true,
          );

          // Also watch for the edit dialog to appear
          // Only trigger if we just clicked the edit button
          const observer = new MutationObserver((mutations) => {
            if (!isEditing) return;

            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                  const input = node.querySelector?.(
                    'input[name="data[Activity][description]"]',
                  );
                  if (input && this.isEmailView()) {
                    console.log("🔍 Email edit dialog detected via observer");
                    setTimeout(() => this.renameEmail(), 100);
                  }
                }
              }
            }
          });

          observer.observe(document.body, { childList: true, subtree: true });

          console.log("✓ Email renamer enabled");
        },
      };

      // ============================================================================
      // 7. ANTINOTE INTEGRATION
      // ============================================================================

      const AntinoteIntegration = {
        config: {
          LAUNCH_METHOD: "anchor",
          USE_TITLE: true,
          REENTRY_MS: 1500,
          SIDENOTES_MODE: "shortcut",
          SIDENOTES_SHORTCUT_NAME: "Merus Add Sidenote",
          ENABLE_SIDENOTES_DIRECT: false,
        },

        showToast(message) {
          const toast = document.createElement("div");
          toast.textContent = message;
          toast.style.cssText = [
            "position:fixed",
            "bottom:14px",
            "right:14px",
            "z-index:999999",
            "background:rgba(30,30,30,0.95)",
            "color:#fff",
            "padding:10px 12px",
            "border-radius:10px",
            "font:12px/1.2 -apple-system,system-ui,Segoe UI,Roboto",
            "box-shadow:0 6px 20px rgba(0,0,0,.25)",
            "opacity:0",
            "transition:opacity .2s",
          ].join(";");
          document.body.appendChild(toast);
          requestAnimationFrame(() => {
            toast.style.opacity = "1";
          });
          setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 200);
          }, 2500);
        },

        lastLaunchAt: 0,
        launching: false,

        getClientFirstLast() {
          const el = document.querySelector(
            "#lpClientName span.pretty-name-span",
          );
          if (!el) {
            console.warn("❌ Could not find client name element");
            return null;
          }

          const raw = (el.getAttribute("title") || el.textContent || "").trim();
          const namePart = raw.split(" v. ")[0].trim();
          const parts = namePart.split(",");

          if (parts.length < 2) {
            return namePart;
          }

          const last = parts[0].trim();
          const firstM = parts.slice(1).join(" ").trim();
          return `${firstM} ${last}`.trim();
        },

        getClientLastFirst() {
          const el = document.querySelector(
            "#lpClientName span.pretty-name-span",
          );
          if (!el) {
            return null;
          }

          const raw = (el.getAttribute("title") || el.textContent || "").trim();
          const namePart = raw.split(" v. ")[0].trim();
          const parts = namePart.split(",");

          if (parts.length < 2) {
            return namePart;
          }

          const last = parts[0].trim();
          const firstM = parts.slice(1).join(" ").trim();
          return `${last}, ${firstM}`.trim();
        },

        getActiveDocument() {
          const el = document.querySelector(
            ".box-view .list-group-item h5 span",
          );
          return el ? el.textContent.trim() : "";
        },

        isEmailView() {
          return document.querySelector("#message-sender") !== null;
        },

        getEmailInfo() {
          const sentDate =
            document
              .querySelector("#merus-message-sent-date")
              ?.textContent.trim() || "";
          const subject =
            document.querySelector(".panel-title")?.textContent.trim() || "";
          return { sentDate, subject };
        },

        getActiveDocumentTitle() {
          const activeDoc = this.getActiveDocument();
          if (activeDoc) return activeDoc;

          const { subject } = this.getEmailInfo();
          if (subject) return subject;

          return (document.title || "Active Document").trim();
        },

        copyActiveDocumentMarkdownLink() {
          const title = this.getActiveDocumentTitle();
          const pageUrl = window.location.href;
          const markdownLink = `[${title}](${pageUrl})`;

          ClipboardUtils.copyText(markdownLink)
            .then(() => {
              this.showToast("Markdown link copied to clipboard");
            })
            .catch((err) => {
              console.warn("Could not copy markdown link:", err);
              this.showToast("Could not copy markdown link");
            });
        },

        buildAntinoteURL(action, content, title) {
          const base = "antinote://x-callback-url";
          let url = `${base}/${action}?content=${encodeURIComponent(content)}`;
          if (title) {
            url += `&title=${encodeURIComponent(title)}`;
          }

          console.log("Generated Antinote URL:", url);

          return url;
        },

        buildSidenotesURL(content) {
          const encoded = encodeURIComponent(content);
          const url = `sidenotes://add-note-with-text/${encoded}`;

          console.log("Generated Sidenotes URL:", url);

          return url;
        },

        buildSidenotesShortcutURL(payload) {
          const shortcut = this.config.SIDENOTES_SHORTCUT_NAME;
          const text = JSON.stringify(payload);
          const url = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcut)}&input=text&text=${encodeURIComponent(text)}`;

          console.log("Generated Sidenotes Shortcut URL:", url);

          return url;
        },

        buildSidenotesNoteBody(clientFirstLast, activeDocument, sourceUrl) {
          const safeClient = (clientFirstLast || "Unknown Client").trim();
          const safeActiveDocument = (
            activeDocument || "Untitled Document"
          ).trim();
          const safeSourceUrl = (sourceUrl || "").trim();
          const activeDocumentMarkdown = safeSourceUrl
            ? `[${safeActiveDocument}](${safeSourceUrl})`
            : safeActiveDocument;

          return `CLIENT: ${safeClient}\nTOPIC: \n---\n\n## ${activeDocumentMarkdown}\n`;
        },

        getNameParts(clientFirstLast, clientLastFirst) {
          const firstName =
            (clientFirstLast || "").trim().split(/\s+/)[0] || "";
          const lastName = (clientLastFirst || "").split(",")[0]?.trim() || "";
          return { firstName, lastName };
        },

        buildSidenotesFolderName(firstName, lastName, fallbackName) {
          if (lastName && firstName) {
            return `${lastName}, ${firstName}`;
          }

          return (fallbackName || "Unknown Case").trim();
        },

        buildDatestampTitle() {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const dd = String(now.getDate()).padStart(2, "0");
          const hh = String(now.getHours()).padStart(2, "0");
          const min = String(now.getMinutes()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
        },

        launch(url, appName = "App") {
          if (this.launching) return;
          const now = Date.now();
          if (now - this.lastLaunchAt < this.config.REENTRY_MS) return;

          this.launching = true;
          this.lastLaunchAt = now;

          const isSafari = /^((?!chrome|android).)*safari/i.test(
            navigator.userAgent,
          );
          let opened = false;

          try {
            if (isSafari) {
              window.location.assign(url);
            } else {
              const a = document.createElement("a");
              a.href = url;
              a.style.display = "none";
              document.body.appendChild(a);
              a.click();
              a.remove();
            }
            opened = true;
          } catch (e) {
            opened = false;
          }

          if (!opened) {
            if (url) {
              ClipboardUtils.copyText(url)
                .then(() => {
                  this.showToast(
                    `${appName} URL copied. Tap to open ${appName}.`,
                  );
                })
                .catch(() => {
                  this.showToast("Unable to open. Please paste URL manually.");
                });
            } else {
              this.showToast("Unable to open. Please copy/paste the URL.");
            }
          }

          setTimeout(() => {
            this.launching = false;
          }, 1000);
        },

        createNote() {
          const client = this.getClientFirstLast();
          const date = Utils.formatDate(new Date(), "MM/DD/YY");
          const pageUrl = window.location.href;

          const header = client ? `# ${client} — ${date}` : `# ${date}`;
          let content = `${header}\n\n## ISSUE\n\n---\n\n`;

          // Check if we're viewing an email
          if (this.isEmailView()) {
            const { sentDate, subject } = this.getEmailInfo();
            content += `**Sent:** ${sentDate}\n**Subject:** ${subject}\n**Link:** ${pageUrl}\n\n`;
          } else {
            const activeDoc = this.getActiveDocument();
            if (activeDoc) {
              content += `**Active Document:** ${activeDoc}\n**Link:** ${pageUrl}\n\n`;
            } else {
              content += `**Link:** ${pageUrl}\n\n`;
            }
          }

          const title = this.config.USE_TITLE && client ? client : null;
          const url = this.buildAntinoteURL("createNote", content, title);
          this.launch(url, "Antinote");
        },

        appendToCurrent() {
          const date = Utils.formatDate(new Date(), "MM/DD/YY");
          const time = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const client = this.getClientFirstLast();
          const pageUrl = window.location.href;

          const subHeader = client
            ? `## ${date} ${time} — ${client}`
            : `## ${date} ${time}`;
          let content = `---\n\n${subHeader}\n\n`;

          // Check if we're viewing an email
          if (this.isEmailView()) {
            const { sentDate, subject } = this.getEmailInfo();
            content += `**Sent:** ${sentDate}\n**Subject:** ${subject}\n**Link:** ${pageUrl}\n\n`;
          } else {
            const activeDoc = this.getActiveDocument();
            if (activeDoc) {
              content += `**Active Document:** ${activeDoc}\n**Link:** ${pageUrl}\n\n`;
            } else {
              content += `**Link:** ${pageUrl}\n\n`;
            }
          }

          const url = this.buildAntinoteURL("appendToCurrent", content);
          this.launch(url, "Antinote");
        },

        addToSidenotes(mode = this.config.SIDENOTES_MODE) {
          const date = Utils.formatDate(new Date(), "MM/DD/YY");
          const time = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const client = this.getClientFirstLast();
          const clientLastFirst = this.getClientLastFirst();
          const pageUrl = window.location.href;
          const activeDoc = this.getActiveDocument();
          const activeDocument =
            activeDoc || this.getEmailInfo().subject || "Untitled Document";
          const noteTitle = this.buildDatestampTitle();
          const noteBody = this.buildSidenotesNoteBody(
            client,
            activeDocument,
            pageUrl,
          );
          const { firstName, lastName } = this.getNameParts(
            client,
            clientLastFirst,
          );
          const folderName = this.buildSidenotesFolderName(
            firstName,
            lastName,
            clientLastFirst,
          );

          const useShortcut = mode === "shortcut";
          const url = useShortcut
            ? this.buildSidenotesShortcutURL({
                action: "create",
                folderName,
                noteTitle,
                noteBody,
                content: noteBody,
                firstName,
                lastName,
                clientFirstLast: client || "",
                clientLastFirst: clientLastFirst || "",
                date,
                time,
                activeDocument,
                sourceUrl: pageUrl,
              })
            : this.buildSidenotesURL(noteBody);
          this.launch(url, "Sidenotes");
        },

        appendToSidenotes() {
          const date = Utils.formatDate(new Date(), "MM/DD/YY");
          const time = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const client = this.getClientFirstLast();
          const clientLastFirst = this.getClientLastFirst();
          const pageUrl = window.location.href;
          const activeDoc = this.getActiveDocument();
          const activeDocument =
            activeDoc || this.getEmailInfo().subject || "Untitled Document";
          const noteTitle = this.buildDatestampTitle();
          const { firstName, lastName } = this.getNameParts(
            client,
            clientLastFirst,
          );
          const folderName = this.buildSidenotesFolderName(
            firstName,
            lastName,
            clientLastFirst,
          );

          const linkText = pageUrl
            ? `[${activeDocument}](${pageUrl})`
            : activeDocument;
          const appendBody =
            `---\n\n` +
            `${client ? `## ${date} ${time} - ${client}` : `## ${date} ${time}`}\n\n` +
            `Active Document: ${linkText}\n\n`;

          const url = this.buildSidenotesShortcutURL({
            action: "append",
            folderName,
            noteTitle,
            appendBody,
            content: appendBody,
            firstName,
            lastName,
            clientFirstLast: client || "",
            clientLastFirst: clientLastFirst || "",
            date,
            time,
            activeDocument,
            sourceUrl: pageUrl,
          });
          this.launch(url, "Sidenotes");
        },

        init() {
          GM_addStyle(`
                    .jjk-antinote-wrap{position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;gap:10px}
                    .jjk-antinote-btn{padding:10px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);background:#1f6feb;color:#fff !important;font:600 13px/1 -apple-system,sans-serif;cursor:pointer;border:none;opacity:.95}
                    .jjk-antinote-btn:hover{opacity:1}
                    .jjk-antinote-btn.append{background:#6f42c1}
                    .jjk-antinote-btn.copy-link{background:#1f883d}
                    .jjk-antinote-btn.sidenotes{background:#0f766e}
                .jjk-antinote-btn.sidenotes-url{background:#0b5ed7}
                `);

          const wrap = document.createElement("div");
          wrap.className = "jjk-antinote-wrap";

          const createBtn = document.createElement("button");
          createBtn.className = "jjk-antinote-btn";
          createBtn.textContent = "📝 Create Note";
          createBtn.onclick = () => this.createNote();

          const appendBtn = document.createElement("button");
          appendBtn.className = "jjk-antinote-btn append";
          appendBtn.textContent = "➕ Append";
          appendBtn.onclick = () => this.appendToCurrent();

          const copyLinkBtn = document.createElement("button");
          copyLinkBtn.className = "jjk-antinote-btn copy-link";
          copyLinkBtn.textContent = "🔗 Copy MD Link";
          copyLinkBtn.title =
            "Copies [active document title](current URL) to clipboard";
          copyLinkBtn.onclick = () => this.copyActiveDocumentMarkdownLink();

          const sidenotesBtn = document.createElement("button");
          sidenotesBtn.className = "jjk-antinote-btn sidenotes";
          sidenotesBtn.textContent = "📚 Sidenotes (Structured)";
          sidenotesBtn.title =
            "Launches the Sidenotes note flow with case metadata";
          sidenotesBtn.onclick = () => this.addToSidenotes("shortcut");

          const sidenotesAppendBtn = document.createElement("button");
          sidenotesAppendBtn.className = "jjk-antinote-btn sidenotes-append";
          sidenotesAppendBtn.textContent = "🧩 Sidenotes Append";
          sidenotesAppendBtn.title =
            "Appends a timestamped section to a Sidenotes note via Shortcut";
          sidenotesAppendBtn.onclick = () => this.appendToSidenotes();

          wrap.appendChild(createBtn);
          wrap.appendChild(appendBtn);
          wrap.appendChild(copyLinkBtn);
          wrap.appendChild(sidenotesBtn);
          wrap.appendChild(sidenotesAppendBtn);
          if (this.config.ENABLE_SIDENOTES_DIRECT) {
            const sidenotesUrlBtn = document.createElement("button");
            sidenotesUrlBtn.className = "jjk-antinote-btn sidenotes-url";
            sidenotesUrlBtn.textContent = "🔗 Sidenotes (Direct)";
            sidenotesUrlBtn.title =
              "Launches Sidenotes using the direct text URL";
            sidenotesUrlBtn.onclick = () => this.addToSidenotes("url");
            wrap.appendChild(sidenotesUrlBtn);
          }
          document.body.appendChild(wrap);

          document.addEventListener("keydown", (e) => {
            if (e.altKey && e.shiftKey && e.key === "A") {
              e.preventDefault();
              this.appendToCurrent();
            }
          });

          console.log("✓ Antinote integration enabled");
        },
      };

      // ============================================================================
      // 8. COMBINED RECORDS DOWNLOAD RENAMER
      // ============================================================================

      const CombinedRecordsRenamer = {
        getClientLastFirst() {
          const el = document.querySelector(
            "#lpClientName span.pretty-name-span",
          );
          if (!el) return null;

          const raw = (el.getAttribute("title") || el.textContent || "").trim();
          const namePart = raw.split(" v. ")[0].trim();
          const parts = namePart.split(",");

          if (parts.length < 2) return namePart;

          const last = parts[0].trim();
          const first = parts.slice(1).join(" ").trim();
          return `${last}_${first}`.trim();
        },

        buildFilename() {
          const today = Utils.formatDate(new Date(), "YYYY.MM.DD");
          const lastFirst = this.getClientLastFirst() || "Unknown_Case";
          return `${today}-${lastFirst}-combinedRecords.zip`;
        },

        handleClick(event) {
          const link = event.target.closest("a.btn.btn-default.btn-lg");
          if (!link) return;

          const label = (link.textContent || "").trim();
          if (!label.includes("Open/Download Now")) return;

          if (event.button !== 0 && event.button !== 1) return;

          const filename = this.buildFilename();
          if (filename) {
            ClipboardUtils.copyText(filename)
              .then(() => {
                console.log("✓ Combined records filename copied:", filename);
              })
              .catch((err) => {
                console.warn("Could not copy combined records filename:", err);
              });
          }

          const href = link.getAttribute("href");
          if (!href) return;

          event.preventDefault();

          const a = document.createElement("a");
          a.href = href;
          a.download = filename;
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
        },

        init() {
          const handler = this.handleClick.bind(this);
          document.addEventListener("click", handler, true);
          document.addEventListener("auxclick", handler, true);
          console.log("✓ Combined records download renamer enabled");
        },
      };

      // ============================================================================
      // 9. CALENDAR USER AUTO-CHECK
      // ============================================================================

      const CalendarUserAutoCheck = {
        config: {
          usersToCheck: [
            { value: "1531458", title: "Jason Knox (JJK)" },
            { value: "123731", title: "Justin Litvack (JML)" },
          ],
        },

        observer: null,

        isCalendarRoute() {
          const hash = window.location.hash || "";
          return /^#\/calendars(?:\?|$)/.test(hash);
        },

        findCheckbox(user) {
          const byValue = document.querySelector(
            `label input[type="checkbox"][value="${user.value}"]`,
          );
          if (byValue) return byValue;

          const safeTitle =
            window.CSS && CSS.escape
              ? CSS.escape(user.title)
              : user.title.replace(/"/g, '\\"');
          return document.querySelector(
            `label[title="${safeTitle}"] input[type="checkbox"]`,
          );
        },

        ensureChecked() {
          if (!this.isCalendarRoute()) return;

          let changedCount = 0;
          for (const user of this.config.usersToCheck) {
            const checkbox = this.findCheckbox(user);
            if (!checkbox) continue;

            if (!checkbox.checked) {
              checkbox.checked = true;
              changedCount++;
              checkbox.dispatchEvent(new Event("input", { bubbles: true }));
              checkbox.dispatchEvent(new Event("change", { bubbles: true }));
            }

            checkbox.setAttribute("checked", "");
          }

          if (changedCount > 0) {
            console.log(
              `✓ Calendar auto-check applied to ${changedCount} user(s)`,
            );
          }
        },

        scheduleEnsure: Utils.debounce(function () {
          CalendarUserAutoCheck.ensureChecked();
        }, 250),

        startObserver() {
          if (this.observer) return;

          this.observer = new MutationObserver(() => {
            this.scheduleEnsure();
          });

          this.observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
        },

        stopObserver() {
          if (!this.observer) return;
          this.observer.disconnect();
          this.observer = null;
        },

        handleRouteChange() {
          if (this.isCalendarRoute()) {
            this.startObserver();
            this.scheduleEnsure();
          } else {
            this.stopObserver();
          }
        },

        init() {
          this.handleRouteChange();
          window.addEventListener("hashchange", () => this.handleRouteChange());
          window.addEventListener("popstate", () => this.handleRouteChange());
          console.log("✓ Calendar user auto-check enabled");
        },
      };

      // ============================================================================
      // 10. DEBUG HELPER (Console access to throttler stats)
      // ============================================================================

      unsafeWindow.MerusUtils = {
        getThrottlerStats: () => RequestThrottler.getStats(),
        resetThrottler: () => {
          RequestThrottler.requestLog.clear();
          RequestThrottler.blockedUntil.clear();
          RequestThrottler.stats = {
            blocked: 0,
            allowed: 0,
            focusDebounced: 0,
          };
          console.log("✓ Throttler reset");
        },
      };

      // ============================================================================
      // INITIALIZE ALL MODULES
      // ============================================================================

      //   PreventCloseWarning.init();
      DefaultAssignee.init();
      SmartTab.init();
      QuickPDFDownload.init();
      SmartRenamer.init();
      EmailRenamer.init();
      AntinoteIntegration.init();
      CombinedRecordsRenamer.init();
      CalendarUserAutoCheck.init();

      console.log("✅ All MerusCase utilities initialized successfully");
      console.log(
        "💡 Tip: Run MerusUtils.getThrottlerStats() in console to see rate limiter stats",
      );
    }

    // ============================================================================
    // S3 INBOX SAVE BUTTON
    // Runs only on meruscase-customer-uploads.s3.amazonaws.com/* pages.
    // Reads the client name stored by QuickPDFDownload.storeContextMeta() when
    // the user was on a MerusCase case page and clicked any link.
    // ============================================================================

    const S3InboxButton = {
        META_KEY: 'merus_pending_meta',
        META_TTL_MS: 120_000,   // 2 minutes — S3 pre-signed URLs expire in 3 min

        _sanitize(str) {
            return String(str)
                .replace(/[<>"/\\|?*\x00-\x1F]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        },

        getStoredMeta() {
            try {
                const raw = GM_getValue(this.META_KEY, null);
                if (!raw) return null;
                const meta = JSON.parse(raw);
                if (Date.now() - meta.ts > this.META_TTL_MS) return null;
                return meta;
            } catch (e) {
                return null;
            }
        },

        buildSentinelName(client) {
            const pathname = window.location.pathname;

            // Date from URL path segment (e.g. /acct/docid/2026-06-17/file.pdf)
            const dateSeg = pathname.match(/\/(\d{4})-(\d{2})-(\d{2})\//);
            const dateStr = dateSeg
                ? `${dateSeg[1]}.${dateSeg[2]}.${dateSeg[3]}`
                : 'Undated';

            // Title from filename (strip extension, replace separators)
            const filename = pathname.split('/').pop() || 'document';
            const extMatch = filename.match(/\.([a-z0-9]{1,6})$/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
            const rawStem = filename.replace(/\.[^.]+$/, '');
            const cleanTitle = rawStem
                .replace(/^\d{4}[._-]\d{2}[._-]\d{2}\s*[-–—]?\s*/, '')
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim() || 'Untitled';

            const parts = [client, dateStr, cleanTitle].map(s => this._sanitize(s) || 'Unknown');
            return `${parts.join(' ___ ')}.${ext}`;
        },

        async saveToInbox(name) {
            // fetch() is same-origin on the S3 page; no GM_xmlhttpRequest needed.
            // <a download> avoids Firefox's "open PDF inline" behavior for blob URLs.
            const resp = await fetch(window.location.href);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const objUrl = URL.createObjectURL(blob);
            try {
                await new Promise((resolve) => {
                    const a = document.createElement('a');
                    a.href = objUrl;
                    a.download = name;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { document.body.removeChild(a); resolve(); }, 2000);
                });
                return name;
            } finally {
                URL.revokeObjectURL(objUrl);
            }
        },

        inject(client) {
            const name = this.buildSentinelName(client);
            const displayName = name.split('/').pop();

            const btn = document.createElement('button');
            btn.textContent = '⬇ Save to Inbox';
            btn.title = displayName;
            btn.style.cssText = [
                'position:fixed', 'top:14px', 'right:14px', 'z-index:999999',
                'background:#1f6feb', 'color:#fff',
                'padding:10px 16px', 'border-radius:10px',
                'font:600 13px/1.4 -apple-system,sans-serif',
                'cursor:pointer', 'border:none',
                'box-shadow:0 4px 16px rgba(0,0,0,.3)',
            ].join(';');

            const sub = document.createElement('div');
            sub.textContent = displayName;
            sub.style.cssText = 'font-size:10px;font-weight:400;opacity:.75;margin-top:2px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:fixed;top:14px;right:14px;z-index:999999;text-align:right;';
            wrap.appendChild(btn);
            wrap.appendChild(sub);
            document.body.appendChild(wrap);

            btn.addEventListener('click', () => {
                btn.disabled = true;
                btn.textContent = '⏳ Saving…';
                this.saveToInbox(name)
                    .then((saved) => {
                        btn.textContent = '✓ Saved';
                        btn.style.background = '#1f883d';
                        sub.textContent = saved.split('/').pop();
                        console.log('✓ Saved to _MerusInbox:', saved);
                        try { GM_setValue(this.META_KEY, null); } catch (e) {}
                        setTimeout(() => wrap.remove(), 3500);
                    })
                    .catch((err) => {
                        btn.disabled = false;
                        btn.textContent = '⚠ Error — retry?';
                        btn.style.background = '#cf222e';
                        console.error('[MerusUtils] S3 save failed:', err);
                        setTimeout(() => {
                            btn.textContent = '⬇ Save to Inbox';
                            btn.style.background = '#1f6feb';
                        }, 3000);
                    });
            });
        },

        init() {
            const meta = this.getStoredMeta();
            if (!meta) {
                console.log('[MerusUtils] S3 page: no recent case metadata — open this PDF from a MerusCase tab to enable the Save to Inbox button');
                return;
            }
            this.inject(meta.client);
            console.log('[MerusUtils] S3 inbox button injected for client:', meta.client);
        },
    };

    // ============================================================================
    // BOOT — split on hostname
    // ============================================================================

    const _isS3Page = window.location.hostname.includes('s3.amazonaws.com');

    if (!_isS3Page) {
        // MerusCase: throttler runs at document-start before DOM exists
        RequestThrottler.init();
    }

    function _runOnDOMReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    if (_isS3Page) {
        _runOnDOMReady(() => S3InboxButton.init());
    } else {
        _runOnDOMReady(initializeModules);
    }

})();
