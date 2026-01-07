// ==UserScript==
// @name         MerusCase Unified Utilities
// @namespace    https://github.com/Jason-K/Userscripts
// @version      3.2.3
// @description  Combined MerusCase utilities: Default Assignee, PDF Download, Smart Renamer, Email Renamer, Smart Tab, Close Warning Prevention, Antinote Integration, and Request Throttling
// @author       Jason Knox
// @match        https://*.meruscase.com/*
// @grant        GM_addStyle
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
            window.fetch = function(input, ...args) {
                const url = typeof input === 'string' ? input : (input?.url || input?.toString() || '');
                if (self.shouldBlock(url)) {
                    return Promise.resolve(new Response(
                        JSON.stringify({ error: 'Rate limited by userscript' }),
                        { status: 429, statusText: 'Too Many Requests (Throttled by Userscript)' }
                    ));
                }
                return originalFetch.call(this, input, ...args);
            };

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
        if (typeof GM_addStyle !== 'function') {
            window.GM_addStyle = function(css) {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                return style;
            };
        }

        console.log('🚀 MerusCase Unified Utilities v3.2.0 initializing modules...');

        // ============================================================================
        // SHARED UTILITIES
        // ============================================================================

        const Utils = {
            debounce(func, delay) {
                let timeout;
                return function(...args) {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), delay);
                };
            },

            formatDate(date, format = 'MM/DD/YYYY') {
                const d = date instanceof Date ? date : new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');

                switch (format) {
                    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
                    case 'YYYY.MM.DD': return `${year}.${month}.${day}`;
                    case 'MM/DD/YY': return `${month}/${day}/${String(year).slice(-2)}`;
                    default: return `${month}/${day}/${year}`;
                }
            },

            parseDate(text) {
                if (!text) return null;
                const isoMatch = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                if (isoMatch) {
                    const [, year, month, day] = isoMatch;
                    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                }
                const usMatch = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
                if (usMatch) {
                    const [, month, day, year] = usMatch;
                    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                }
                return null;
            },

            sanitizeFilename(str) {
                return str.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim();
            },

            titleCase(text, acronyms = []) {
                const acronymSet = new Set(acronyms);
                return text.toLowerCase().replace(/\b(\w+\.?\w*)\b/g, (word) => {
                    const upper = word.toUpperCase();
                    if (acronymSet.has(upper)) return upper;
                    return word.charAt(0).toUpperCase() + word.slice(1);
                });
            },

            getCaseName() {
                const el = document.querySelector('#lpClientName span.pretty-name-span');
                if (!el) return 'Unknown Case';
                const raw = (el.getAttribute('title') || el.textContent || '').trim();
                const namePart = raw.split(' v. ')[0].trim();
                return namePart;
            }
        };

        // ============================================================================
        // 1. PREVENT CLOSE WARNING
        // ============================================================================

        const PreventCloseWarning = {
            init() {
                window.addEventListener('load', () => {
                    window.onbeforeunload = null;

                    const observer = new MutationObserver(() => {
                        if (window.onbeforeunload !== null) {
                            window.onbeforeunload = null;
                        }
                    });

                    observer.observe(document.documentElement, {
                        childList: true,
                        subtree: true
                    });
                });
                console.log('✓ Close warning prevention enabled');
            }
        };

        // ============================================================================
        // 2. DEFAULT ASSIGNEE
        // ============================================================================

        const DefaultAssignee = {
            config: {
                defaultAssignee: 'Sommer Murray (SEM)',
                setDueDate: true
            },

            setDefaultAssignee() {
                const assigneeSelect = document.querySelector('select[name="data[Task][user_id]"]');
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
                    assigneeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            },

            setTodayDate() {
                if (!this.config.setDueDate) return false;

                const dueDateInput = document.querySelector('input[name="data[Task][date_due]"]');
                if (!dueDateInput || dueDateInput.value.trim() !== '') return false;

                const today = Utils.formatDate(new Date(), 'MM/DD/YYYY');
                dueDateInput.value = today;
                dueDateInput.dispatchEvent(new Event('input', { bubbles: true }));
                dueDateInput.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            },

            applyDefaults() {
                const assigneeSet = this.setDefaultAssignee();
                const dateSet = this.setTodayDate();
                if (assigneeSet || dateSet) {
                    console.log('✓ Applied task defaults:', { assignee: assigneeSet, date: dateSet });
                }
            },

            init() {
                if (window.location.href.includes('/tasks/add')) {
                    setTimeout(() => this.applyDefaults(), 500);
                }

                document.addEventListener('click', (event) => {
                    const target = event.target.closest('a');
                    if (!target) return;
                    const href = target.href || '';
                    const text = target.textContent || '';
                    if (href.includes('/tasks/add') || text.includes('New Task')) {
                        setTimeout(() => this.applyDefaults(), 500);
                    }
                }, true);

                console.log('✓ Default assignee enabled');
            }
        };

        // ============================================================================
        // 3. SMART TAB (4 spaces in notes)
        // ============================================================================

        const SmartTab = {
            config: {
                enabled: true,
                useNbsp: false,
                SPACES: "    ",
                NBSP: "\u00A0\u00A0\u00A0\u00A0"
            },

            isInNoteEditable() {
                const el = document.activeElement;
                return el && el.isContentEditable && el.classList.contains('note-editable');
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

                if (node && node.nodeType === Node.TEXT_NODE && offset >= content.length) {
                    const before = node.textContent.substring(offset - content.length, offset);
                    if (before === content) {
                        const newText = node.textContent.substring(0, offset - content.length) +
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
                document.addEventListener('keydown', (e) => {
                    if (!this.config.enabled || !this.isInNoteEditable()) return;

                    const content = this.config.useNbsp ? this.config.NBSP : this.config.SPACES;

                    if (e.key === 'Tab' && !e.shiftKey) {
                        e.preventDefault();
                        const sel = window.getSelection();
                        if (sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0);
                            this.insertAtCaret(range, content);
                        }
                    }
                    else if (e.key === 'Tab' && e.shiftKey) {
                        e.preventDefault();
                        const sel = window.getSelection();
                        if (sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0);
                            this.tryUnindentInline(range, content);
                        }
                    }
                    else if (e.key === 'Backspace') {
                        const sel = window.getSelection();
                        if (sel.rangeCount > 0 && sel.isCollapsed) {
                            const range = sel.getRangeAt(0);
                            if (this.tryUnindentInline(range, content)) {
                                e.preventDefault();
                            }
                        }
                    }
                });

                console.log('✓ Smart tab enabled');
            }
        };

        // ============================================================================
        // 4. QUICK PDF DOWNLOAD
        // ============================================================================

        const QuickPDFDownload = {
            extractDateFromText(text) {
                const parsed = Utils.parseDate(text);
                return parsed ? Utils.formatDate(parsed, 'YYYY.MM.DD') : 'Undated';
            },

            extractTitle() {
                const titleEl = document.querySelector('.box-view h5 span');
                return titleEl ? titleEl.textContent.trim() : 'Document';
            },

            processTitle(text) {
                const acronyms = ['C&R', 'OACR', 'OAC&R', 'MSA', 'QME', 'AME', 'PTP', 'MRI', 'XR', 'MMI'];
                return Utils.titleCase(text, acronyms);
            },

            runFilenameLogic() {
                const caseName = Utils.getCaseName();
                const title = this.extractTitle();
                const dateStr = this.extractDateFromText(title);
                const processedTitle = this.processTitle(title);

                return Utils.sanitizeFilename(`${caseName} - ${dateStr} - ${processedTitle}`);
            },

            init() {
                document.addEventListener('click', async (event) => {
                    const link = event.target.closest('a[aria-label="Download Document"]');
                    if (!link) return;

                    // Only intercept left-click (button 0) and middle-click (button 1). Allow right-click through.
                    if (event.button !== 0 && event.button !== 1) return;

                    event.preventDefault();
                    const filename = this.runFilenameLogic();

                    try {
                        await navigator.clipboard.writeText(filename);
                        console.log('✓ PDF filename copied:', filename);
                    } catch (err) {
                        console.warn('Could not copy filename:', err);
                    }

                    // For left-click only, trigger the download
                    if (event.button === 0) {
                        const href = link.getAttribute('href');
                        if (href) {
                            const a = document.createElement('a');
                            a.href = href;
                            a.download = filename + '.pdf';
                            a.click();
                        }
                    }
                });

                console.log('✓ Quick PDF download enabled');
            }
        };

        // ============================================================================
        // 5. SMART RENAMER (Documents)
        // ============================================================================

        const SmartRenamer = {
            ACRONYMS: new Set(['PT', 'MD', 'QME', 'AME', 'UR', 'EMG', 'NCV', 'MRI', 'PTP', 'TTD', 'PPD', 'C&R', 'MSA', 'XR']),

            transform(stem) {
                const dateMatch = stem.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
                let date = '';
                if (dateMatch) {
                    date = this.extractDate(dateMatch[1]);
                    stem = stem.replace(dateMatch[0], '').trim();
                }

                stem = stem.replace(/,?\s*(llp|inc\.?|pc|corp\.?|llc)$/i, '');

                const tokens = stem.split(/\s+/);
                const processed = tokens.map(token => {
                    const upper = token.toUpperCase();
                    if (this.ACRONYMS.has(upper)) return upper;
                    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
                });

                let result = processed.join(' ');
                if (date) result = `${date} - ${result}`;

                return result.replace(/\s+/g, ' ').trim();
            },

            extractDate(dateStr) {
                const parsed = Utils.parseDate(dateStr);
                return parsed ? Utils.formatDate(parsed, 'YYYY.MM.DD') : '';
            },

            handleRename() {
                const input = document.querySelector('input[name="data[Upload][description]"]');
                if (!input) {
                    console.log('❌ Smart renamer: Description input not found');
                    return;
                }

                const original = input.value.trim();
                if (!original) {
                    console.log('❌ Smart renamer: Input is empty');
                    return;
                }

                const transformed = this.transform(original);
                if (transformed !== original) {
                    input.value = transformed;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('✓ Renamed:', original, '→', transformed);
                } else {
                    console.log('ℹ️ Smart renamer: No changes needed');
                }
            },

            init() {
                // Listen for clicks on rename button
                document.addEventListener('click', (event) => {
                    const btn = event.target.closest('a.rename-document');
                    if (btn) {
                        console.log('🔍 Rename button clicked, waiting for dialog...');
                        setTimeout(() => this.handleRename(), 500);
                    }
                }, true);

                // Also watch for the rename dialog to appear via MutationObserver
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                const input = node.querySelector?.('input[name="data[Upload][description]"]');
                                if (input) {
                                    console.log('🔍 Rename dialog detected via observer');
                                    setTimeout(() => this.handleRename(), 100);
                                }
                            }
                        }
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                console.log('✓ Smart renamer enabled');
            }
        };

        // ============================================================================
        // 6. EMAIL RENAMER
        // ============================================================================

        const EmailRenamer = {
            isEmailView() {
                return document.querySelector('#message-sender') !== null;
            },

            extractEmailInfo() {
                const sender = document.querySelector('#message-sender')?.textContent.trim() || '';
                const recipient = document.querySelector('#message-recipient')?.textContent.trim() || '';
                const subject = document.querySelector('.note-editable')?.textContent.trim() || '';
                const dateEl = document.querySelector('.activity-date');
                const date = dateEl ? Utils.parseDate(dateEl.textContent) : new Date();

                return { sender, recipient, subject, date };
            },

            generateEmailName(info) {
                const dateStr = Utils.formatDate(info.date, 'YYYY.MM.DD');
                const senderName = info.sender.split('@')[0].replace(/[._]/g, ' ');
                const subjectShort = info.subject.substring(0, 50).trim();

                return `${dateStr} - Email - ${senderName} - ${subjectShort}`;
            },

            async renameEmail() {
                if (!this.isEmailView()) {
                    console.log('❌ Email renamer: Not in email view');
                    return;
                }

                const info = this.extractEmailInfo();
                const newName = this.generateEmailName(info);

                const descInput = document.querySelector('input[name="data[Activity][description]"]');
                if (descInput) {
                    descInput.value = newName;
                    descInput.dispatchEvent(new Event('input', { bubbles: true }));
                    descInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('✓ Email renamed:', newName);
                } else {
                    console.log('❌ Email renamer: Description input not found');
                }
            },

            init() {
                // Listen for clicks on edit button
                document.addEventListener('click', (event) => {
                    const btn = event.target.closest('button.edit-button.activity-control');
                    if (btn && this.isEmailView()) {
                        console.log('🔍 Edit button clicked on email, waiting for dialog...');
                        setTimeout(() => this.renameEmail(), 500);
                    }
                }, true);

                // Also watch for the edit dialog to appear
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                const input = node.querySelector?.('input[name="data[Activity][description]"]');
                                if (input && this.isEmailView()) {
                                    console.log('🔍 Email edit dialog detected via observer');
                                    setTimeout(() => this.renameEmail(), 100);
                                }
                            }
                        }
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                console.log('✓ Email renamer enabled');
            }
        };

        // ============================================================================
        // 7. ANTINOTE INTEGRATION
        // ============================================================================

        const AntinoteIntegration = {
            config: {
                LAUNCH_METHOD: 'anchor',
                USE_TITLE: true,
                REENTRY_MS: 1500
            },

            showToast(message) {
                const toast = document.createElement('div');
                toast.textContent = message;
                toast.style.cssText = [
                    'position:fixed','bottom:14px','right:14px','z-index:999999',
                    'background:rgba(30,30,30,0.95)','color:#fff','padding:10px 12px',
                    'border-radius:10px','font:12px/1.2 -apple-system,system-ui,Segoe UI,Roboto',
                    'box-shadow:0 6px 20px rgba(0,0,0,.25)','opacity:0','transition:opacity .2s'
                ].join(';');
                document.body.appendChild(toast);
                requestAnimationFrame(() => { toast.style.opacity = '1'; });
                setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 200); }, 2500);
            },

            lastLaunchAt: 0,
            launching: false,

            getClientFirstLast() {
                const el = document.querySelector('#lpClientName span.pretty-name-span');
                if (!el) {
                    console.warn('❌ Could not find client name element');
                    return null;
                }

                const raw = (el.getAttribute('title') || el.textContent || '').trim();
                const namePart = raw.split(' v. ')[0].trim();
                const parts = namePart.split(',');

                if (parts.length < 2) {
                    return namePart;
                }

                const last = parts[0].trim();
                const firstM = parts.slice(1).join(' ').trim();
                return `${firstM} ${last}`.trim();
            },

            getActiveDocument() {
                const el = document.querySelector('.box-view .list-group-item h5 span');
                return el ? el.textContent.trim() : '';
            },

            buildAntinoteURL(action, content, title) {
                const base = 'antinote://x-callback-url';
                let url = `${base}/${action}?content=${encodeURIComponent(content)}`;
                if (title) {
                    url += `&title=${encodeURIComponent(title)}`;
                }
                return url;
            },

            launch(url) {
                if (this.launching) return;
                const now = Date.now();
                if (now - this.lastLaunchAt < this.config.REENTRY_MS) return;

                this.launching = true;
                this.lastLaunchAt = now;

                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                let opened = false;

                try {
                    if (isSafari) {
                        window.location.assign(url);
                        opened = true;
                    } else {
                        const a = document.createElement('a');
                        a.href = url;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        opened = true;
                    }
                } catch (e) {
                    opened = false;
                }

                if (!opened) {
                    try {
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = url;
                        document.body.appendChild(iframe);
                        setTimeout(() => iframe.remove(), 2000);
                        opened = true;
                    } catch (e) {
                        opened = false;
                    }
                }

                if (!opened) {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(url).then(() => {
                            this.showToast('Antinote URL copied. Tap to open Antinote.');
                        }).catch(() => {
                            this.showToast('Unable to open. Please paste URL manually.');
                        });
                    } else {
                        this.showToast('Unable to open. Please copy/paste the URL.');
                    }
                }

                setTimeout(() => { this.launching = false; }, 1000);
            },

            createNote() {
                const client = this.getClientFirstLast();
                const date = Utils.formatDate(new Date(), 'MM/DD/YY');
                const activeDoc = this.getActiveDocument();
                const pageUrl = window.location.href;

                const header = client ? `# ${client} — ${date}` : `# ${date}`;
                let content = `${header}\n\n## ISSUE\n\n---\n\n`;
                if (activeDoc) content += `**Active Document:** ${activeDoc}\n\n`;
                content += `[${activeDoc || 'Link'}](${pageUrl})\n\n`;

                const title = (this.config.USE_TITLE && client) ? client : null;
                const url = this.buildAntinoteURL('createNote', content, title);
                this.launch(url);
            },

            appendToCurrent() {
                const date = Utils.formatDate(new Date(), 'MM/DD/YY');
                const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const activeDoc = this.getActiveDocument();
                const client = this.getClientFirstLast();
                const pageUrl = window.location.href;

                const subHeader = client ? `## ${date} ${time} — ${client}` : `## ${date} ${time}`;
                let content = `---\n\n${subHeader}\n\n`;
                if (activeDoc) content += `**Active Document:** ${activeDoc}\n\n`;
                content += `[${activeDoc || 'Link'}](${pageUrl})\n\n`;

                const url = this.buildAntinoteURL('appendToCurrent', content);
                this.launch(url);
            },

            init() {
                GM_addStyle(`
                    .jjk-antinote-wrap{position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;gap:10px}
                    .jjk-antinote-btn{padding:10px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);background:#1f6feb;color:#fff !important;font:600 13px/1 -apple-system,sans-serif;cursor:pointer;border:none;opacity:.95}
                    .jjk-antinote-btn:hover{opacity:1}
                    .jjk-antinote-btn.append{background:#6f42c1}
                `);

                const wrap = document.createElement('div');
                wrap.className = 'jjk-antinote-wrap';

                const createBtn = document.createElement('button');
                createBtn.className = 'jjk-antinote-btn';
                createBtn.textContent = '📝 Create Note';
                createBtn.onclick = () => this.createNote();

                const appendBtn = document.createElement('button');
                appendBtn.className = 'jjk-antinote-btn append';
                appendBtn.textContent = '➕ Append';
                appendBtn.onclick = () => this.appendToCurrent();

                wrap.appendChild(createBtn);
                wrap.appendChild(appendBtn);
                document.body.appendChild(wrap);

                document.addEventListener('keydown', (e) => {
                    if (e.altKey && e.shiftKey && e.key === 'A') {
                        e.preventDefault();
                        this.appendToCurrent();
                    }
                });

                console.log('✓ Antinote integration enabled');
            }
        };

        // ============================================================================
        // 8. DEBUG HELPER (Console access to throttler stats)
        // ============================================================================

        window.MerusUtils = {
            getThrottlerStats: () => RequestThrottler.getStats(),
            resetThrottler: () => {
                RequestThrottler.requestLog.clear();
                RequestThrottler.blockedUntil.clear();
                RequestThrottler.stats = { blocked: 0, allowed: 0, focusDebounced: 0 };
                console.log('✓ Throttler reset');
            }
        };

        // ============================================================================
        // INITIALIZE ALL MODULES
        // ============================================================================

        PreventCloseWarning.init();
        DefaultAssignee.init();
        SmartTab.init();
        QuickPDFDownload.init();
        SmartRenamer.init();
        EmailRenamer.init();
        AntinoteIntegration.init();

        console.log('✅ All MerusCase utilities initialized successfully');
        console.log('💡 Tip: Run MerusUtils.getThrottlerStats() in console to see rate limiter stats');
    }

    // Wait for DOM before initializing modules
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeModules);
    } else {
        initializeModules();
    }

})();
