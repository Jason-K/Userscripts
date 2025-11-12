/**
 * MerusCore - Shared Utility Library for MerusCase Userscripts
 * Provides unified UI components, DOM utilities, and Cloudflare-safe patterns
 *
 * @version 1.0.0
 * @author Jason K.
 * @namespace https://github.com/Jason-K
 */

(function() {
    'use strict';

    // Prevent multiple initializations
    if (window.MerusCore) {
        console.warn('MerusCore: Library already loaded');
        return;
    }

    window.MerusCore = {
        version: '1.0.0',

        /**
         * Core initialization and script management
         */
        createScript(options = {}) {
            const config = {
                name: 'UnnamedScript',
                version: '1.0.0',
                autoInit: true,
                cleanupOnUnload: true,
                ...options
            };

            const script = {
                name: config.name,
                version: config.version,
                config,
                isActive: false,
                cleanupFunctions: new Set(),

                init(callback) {
                    if (this.isActive) return;

                    try {
                        callback();
                        this.isActive = true;
                        console.log(`MerusCore: ${this.name} v${this.version} initialized`);
                    } catch (error) {
                        console.error(`MerusCore: Failed to initialize ${this.name}:`, error);
                    }

                    if (config.cleanupOnUnload) {
                        window.addEventListener('beforeunload', () => this.cleanup());
                    }
                },

                addCleanup(fn) {
                    this.cleanupFunctions.add(fn);
                },

                cleanup() {
                    this.cleanupFunctions.forEach(fn => {
                        try { fn(); } catch (e) { console.warn('MerusCore: Cleanup error:', e); }
                    });
                    this.cleanupFunctions.clear();
                    this.isActive = false;
                    console.log(`MerusCore: ${this.name} cleaned up`);
                }
            };

            // Inject shared CSS if not already present
            if (!document.getElementById('merus-core-styles')) {
                this.ui.injectStyles();
            }

            return script;
        },

        /**
         * Unified User Interface System
         */
        ui: {
            // Inject shared CSS styles
            injectStyles() {
                const style = document.createElement('style');
                style.id = 'merus-core-styles';
                style.textContent = `
                    /* MerusCore Unified Button System */
                    .merus-core-btn {
                        position: fixed;
                        z-index: 10000;
                        padding: 8px 12px;
                        border: none;
                        border-radius: 4px;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        font-size: 14px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        white-space: nowrap;
                        user-select: none;
                    }

                    .merus-core-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                    }

                    .merus-core-btn:active {
                        transform: translateY(0);
                        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    }

                    .merus-core-btn:disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                        transform: none;
                    }

                    /* Button Positions */
                    .merus-pos-top-right { top: 10px; right: 10px; }
                    .merus-pos-bottom-right { bottom: 70px; right: 18px; }
                    .merus-pos-top-left { top: 10px; left: 10px; }
                    .merus-pos-bottom-left { bottom: 10px; left: 10px; }

                    /* Button Styles */
                    .merus-style-primary {
                        background: linear-gradient(135deg, #4CAF50, #45a049);
                        color: white;
                    }
                    .merus-style-info {
                        background: linear-gradient(135deg, #2196F3, #1976D2);
                        color: white;
                    }
                    .merus-style-warning {
                        background: linear-gradient(135deg, #FF9800, #F57C00);
                        color: white;
                    }
                    .merus-style-danger {
                        background: linear-gradient(135deg, #f44336, #d32f2f);
                        color: white;
                    }
                    .merus-style-secondary {
                        background: linear-gradient(135deg, #6c757d, #5a6268);
                        color: white;
                    }

                    /* MerusCore Unified Toast System */
                    .merus-toast {
                        position: fixed;
                        background: rgba(30, 30, 30, 0.95);
                        color: white;
                        padding: 12px 16px;
                        border-radius: 8px;
                        z-index: 100001;
                        max-width: 320px;
                        line-height: 1.4;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        font-size: 14px;
                        opacity: 0;
                        transform: translateY(10px);
                        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        backdrop-filter: blur(10px);
                    }

                    .merus-toast-visible {
                        opacity: 1;
                        transform: translateY(0);
                    }

                    .merus-toast-success {
                        background: linear-gradient(135deg, rgba(76, 175, 80, 0.95), rgba(69, 160, 73, 0.95));
                    }
                    .merus-toast-error {
                        background: linear-gradient(135deg, rgba(244, 67, 54, 0.95), rgba(211, 47, 47, 0.95));
                    }
                    .merus-toast-warning {
                        background: linear-gradient(135deg, rgba(255, 152, 0, 0.95), rgba(245, 124, 0, 0.95));
                    }
                    .merus-toast-info {
                        background: linear-gradient(135deg, rgba(33, 150, 243, 0.95), rgba(25, 118, 210, 0.95));
                    }

                    /* Toast Positions */
                    .merus-pos-default { bottom: 10px; right: 10px; }
                    .merus-pos-center {
                        bottom: 50%;
                        right: 50%;
                        transform: translateX(50%);
                    }

                    /* Undo Button */
                    .merus-undo-btn {
                        position: fixed;
                        bottom: 10px;
                        left: 10px;
                        background: linear-gradient(135deg, #9C27B0, #7B1FA2);
                        color: white;
                        border: none;
                        border-radius: 20px;
                        padding: 6px 12px;
                        font-size: 12px;
                        cursor: pointer;
                        z-index: 100002;
                        transition: all 0.3s ease;
                        opacity: 0;
                        transform: scale(0.8);
                    }

                    .merus-undo-btn-visible {
                        opacity: 1;
                        transform: scale(1);
                    }

                    /* Loading Spinner */
                    .merus-spinner {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        border: 2px solid rgba(255,255,255,0.3);
                        border-radius: 50%;
                        border-top-color: white;
                        animation: merus-spin 0.8s linear infinite;
                        margin-left: 8px;
                    }

                    @keyframes merus-spin {
                        to { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            },

            /**
             * Create standardized button
             */
            createButton(options = {}) {
                const config = {
                    text: 'Button',
                    icon: null,
                    position: 'top-right',
                    style: 'primary',
                    className: '',
                    onClick: null,
                    disabled: false,
                    loading: false,
                    ...options
                };

                const button = document.createElement('button');
                button.className = `merus-core-btn merus-pos-${config.position} merus-style-${config.style} ${config.className}`.trim();

                // Build inner HTML
                let innerHTML = '';
                if (config.icon) {
                    if (config.icon.startsWith('fa-')) {
                        innerHTML = `<i class="fas ${config.icon}"></i> `;
                    } else {
                        innerHTML = `${config.icon} `;
                    }
                }
                innerHTML += config.text;
                if (config.loading) {
                    innerHTML += '<span class="merus-spinner"></span>';
                }
                button.innerHTML = innerHTML;

                // Set properties
                button.disabled = config.disabled;

                // Add event handler
                if (config.onClick) {
                    button.addEventListener('click', (e) => {
                        if (!button.disabled) {
                            config.onClick(e, button);
                        }
                    });
                }

                return {
                    element: button,
                    setText: (text) => {
                        const existingText = button.textContent.replace('Loading...', '').trim();
                        button.innerHTML = button.innerHTML.replace(existingText, text);
                    },
                    setIcon: (icon) => {
                        const iconElement = button.querySelector('i');
                        if (iconElement) {
                            iconElement.className = `fas ${icon}`;
                        }
                    },
                    setLoading: (loading) => {
                        config.loading = loading;
                        if (loading) {
                            button.innerHTML += '<span class="merus-spinner"></span>';
                            button.disabled = true;
                        } else {
                            const spinner = button.querySelector('.merus-spinner');
                            if (spinner) spinner.remove();
                            button.disabled = config.disabled;
                        }
                    },
                    setDisabled: (disabled) => {
                        button.disabled = disabled;
                    },
                    remove: () => {
                        button.remove();
                    }
                };
            },

            /**
             * Show unified toast notification
             */
            showToast(message, type = 'info', duration = 3000, position = 'default') {
                const toast = document.createElement('div');
                toast.className = `merus-toast merus-toast-${type} merus-pos-${position}`;
                toast.textContent = message;

                document.body.appendChild(toast);

                // Fade in animation
                requestAnimationFrame(() => {
                    toast.classList.add('merus-toast-visible');
                });

                // Auto-remove with fade out
                const removeToast = () => {
                    toast.classList.remove('merus-toast-visible');
                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.remove();
                        }
                    }, 400);
                };

                const timeoutId = setTimeout(removeToast, duration);

                // Allow manual dismissal
                toast.addEventListener('click', () => {
                    clearTimeout(timeoutId);
                    removeToast();
                });

                return {
                    element: toast,
                    remove: removeToast,
                    update: (newMessage, newType) => {
                        toast.textContent = newMessage;
                        toast.className = `merus-toast merus-toast-${newType || type} merus-pos-${position} merus-toast-visible`;
                    }
                };
            },

            /**
             * Create undo button
             */
            createUndoButton(callback, text = 'Undo') {
                const button = document.createElement('button');
                button.className = 'merus-undo-btn';
                button.textContent = text;
                button.addEventListener('click', callback);

                document.body.appendChild(button);

                // Show animation
                requestAnimationFrame(() => {
                    button.classList.add('merus-undo-btn-visible');
                });

                return {
                    element: button,
                    remove: () => {
                        button.classList.remove('merus-undo-btn-visible');
                        setTimeout(() => button.remove(), 300);
                    },
                    updateText: (newText) => {
                        button.textContent = newText;
                    }
                };
            }
        },

        /**
         * DOM Utilities and MerusCase-specific helpers
         */
        dom: {
            // Common MerusCase selectors
            selectors: {
                caseName: '.pretty-name-span',
                documentTitle: '.box-view h5 span',
                noteEditable: '.note-editable',
                saveButton: 'button.save-button',
                downloadLink: 'a[aria-label="Download Document"]',
                messageSender: '#message-sender',
                messageRecipient: '#message-recipient',
                tagsButton: 'button.edit-button.activity-control',
                taskAssignee: 'select[name="data[Task][user_id]"]',
                documentDate: 'input[name="data[Upload][document_date]"]',
                documentDescription: 'input[name="data[Upload][description]"]',
                searchInput: '#search-input',
                submitButton: 'button[type="submit"]'
            },

            /**
             * Promise-based element waiting
             */
            waitForElement(selector, timeout = 10000) {
                return new Promise((resolve) => {
                    const element = document.querySelector(selector);
                    if (element) return resolve(element);

                    const observer = new MutationObserver(() => {
                        const element = document.querySelector(selector);
                        if (element) {
                            observer.disconnect();
                            resolve(element);
                        }
                    });

                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: false
                    });

                    setTimeout(() => {
                        observer.disconnect();
                        resolve(null);
                    }, timeout);
                });
            },

            /**
             * Wait for multiple elements
             */
            waitForElements(selectors, timeout = 10000) {
                const promises = selectors.map(selector =>
                    this.waitForElement(selector, timeout)
                );
                return Promise.all(promises);
            },

            /**
             * Extract common MerusCase data
             */
            extractCaseName() {
                const element = document.querySelector(this.selectors.caseName);
                return element ? element.textContent.trim() : '';
            },

            extractActiveDocument() {
                const element = document.querySelector(this.selectors.documentTitle);
                return element ? element.textContent.trim() : '';
            },

            findNoteEditable() {
                return document.querySelector(this.selectors.noteEditable);
            },

            findSaveButton() {
                return document.querySelector(this.selectors.saveButton);
            },

            findDownloadLink() {
                return document.querySelector(this.selectors.downloadLink);
            },

            /**
             * Trigger multiple events on an element
             */
            triggerEvents(element, events) {
                if (!element) return;

                events.forEach(eventType => {
                    element.dispatchEvent(new Event(eventType, {
                        bubbles: true,
                        cancelable: true
                    }));
                });
            },

            /**
             * Check if element is visible and interactive
             */
            isElementReady(element) {
                if (!element) return false;

                const style = window.getComputedStyle(element);
                return style.display !== 'none' &&
                       style.visibility !== 'hidden' &&
                       !element.disabled;
            },

            /**
             * Safe text extraction with fallback
             */
            safeText(selector, fallback = '') {
                const element = document.querySelector(selector);
                return element ? element.textContent.trim() : fallback;
            },

            /**
             * Get element value with fallback
             */
            safeValue(selector, fallback = '') {
                const element = document.querySelector(selector);
                return element ? element.value.trim() : fallback;
            }
        },

        /**
         * Date and Text Processing Utilities
         */
        date: {
            /**
             * Format date with multiple output formats
             */
            format(date, format = 'YYYY.MM.DD') {
                const d = date instanceof Date ? date : new Date(date);
                if (isNaN(d.getTime())) return '';

                const year = d.getFullYear();
                const month = (d.getMonth() + 1).toString().padStart ?
                    String(d.getMonth() + 1).padStart(2, '0') :
                    ('0' + (d.getMonth() + 1)).slice(-2);
                const day = d.getDate().toString().padStart ?
                    String(d.getDate()).padStart(2, '0') :
                    ('0' + d.getDate()).slice(-2);

                switch (format) {
                    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
                    case 'YYYY.MM.DD': return `${year}.${month}.${day}`;
                    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
                    case 'YYYY/MM/DD': return `${year}/${month}/${day}`;
                    default: return `${year}.${month}.${day}`;
                }
            },

            /**
             * Multi-format date parsing
             */
            parse(text) {
                if (!text || typeof text !== 'string') return null;

                // Helper function for padding
                const pad = (str, length = 2) => {
                    str = str.toString();
                    return str.padStart ? str.padStart(length, '0') : ('0'.repeat(length) + str).slice(-length);
                };

                // ISO formats: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
                const isoMatch = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                if (isoMatch) {
                    const [, year, month, day] = isoMatch;
                    return new Date(`${year}-${pad(month)}-${pad(day)}`);
                }

                // US formats: MM-DD-YYYY, MM/DD/YYYY, MM.DD.YYYY
                const usMatch = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
                if (usMatch) {
                    const [, month, day, year] = usMatch;
                    return new Date(`${year}-${pad(month)}-${pad(day)}`);
                }

                // Short year formats: MM-DD-YY, MM/DD/YY
                const shortMatch = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})/);
                if (shortMatch) {
                    const [, month, day, year] = shortMatch;
                    const fullYear = parseInt(year) + 2000;
                    return new Date(`${fullYear}-${pad(month)}-${pad(day)}`);
                }

                // No separator: YYYYMMDD, MMDDYYYY
                const noSepMatch = text.match(/(\d{6}|\d{8})/);
                if (noSepMatch) {
                    const dateStr = noSepMatch[1];
                    if (dateStr.length === 8) {
                        const year = dateStr.substring(0, 4);
                        const month = dateStr.substring(4, 6);
                        const day = dateStr.substring(6, 8);
                        return new Date(`${year}-${month}-${day}`);
                    } else if (dateStr.length === 6) {
                        const month = dateStr.substring(0, 2);
                        const day = dateStr.substring(2, 4);
                        const year = parseInt(dateStr.substring(4, 6)) + 2000;
                        return new Date(`${year}-${month}-${day}`);
                    }
                }

                return null;
            },

            /**
             * Get formatted today's date
             */
            today(format = 'YYYY.MM.DD') {
                return this.format(new Date(), format);
            },

            /**
             * Extract date from text content
             */
            extractFromText(text, fallbackDate = null) {
                const parsed = this.parse(text);
                return parsed || fallbackDate || new Date();
            }
        },

        text: {
            /**
             * Unified title case with medical/legal acronym preservation
             */
            titleCase(text, options = {}) {
                if (!text || typeof text !== 'string') return '';

                const config = {
                    acronyms: [
                        "PT", "MD", "M.D.", "QME", "AME", "UR", "EMG", "NCS", "MRI",
                        "PTP", "TTD", "PPD", "C&R", "OACR", "OAC&R", "MSA", "IMR",
                        "DME", "TD", "P&S", "F&A", "W/C", "ME", "SBR", "RTW"
                    ],
                    businessSuffixes: [
                        "LLC", "Inc", "PC", "Corp", "LLP", "Ltd", "Co", "L.P."
                    ],
                    preserveOriginal: false,
                    ...options
                };

                const acronyms = new Set(config.acronyms);
                const businessSuffixes = new Set(config.businessSuffixes);

                return text.toLowerCase().trim().replace(/\b(\w+\.?\w*)\b/g, (word, p1) => {
                    const upper = p1.toUpperCase();

                    // Always check for exact acronym matches first
                    if (acronyms.has(upper)) return upper;

                    // Handle acronyms with periods
                    if (p1.includes('.')) {
                        const clean = p1.replace(/\./g, '').toUpperCase();
                        if (acronyms.has(clean)) return p1.toUpperCase();
                    }

                    // Preserve business suffixes
                    if (businessSuffixes.has(upper)) return upper;

                    // Preserve exact matches if configured
                    if (config.preserveOriginal) {
                        if (acronyms.has(upper)) return upper;
                    }

                    // Capitalize first letter, preserve rest
                    return p1.charAt(0).toUpperCase() + p1.slice(1);
                });
            },

            /**
             * Clean and normalize whitespace
             */
            normalizeWhitespace(text) {
                if (!text || typeof text !== 'string') return '';
                return text.replace(/\s+/g, ' ').trim();
            },

            /**
             * Remove HTML tags safely
             */
            stripHTML(html) {
                if (!html || typeof html !== 'string') return '';
                const temp = document.createElement('div');
                temp.innerHTML = html;
                return temp.textContent || temp.innerText || '';
            },

            /**
             * Truncate text with ellipsis
             */
            truncate(text, maxLength = 100, suffix = '...') {
                if (!text || typeof text !== 'string') return '';
                if (text.length <= maxLength) return text;
                return text.substring(0, maxLength - suffix.length) + suffix;
            }
        },

        /**
         * Cloudflare-safe Observer System
         */
        observer: {
            // Global rate limiting coordination
            state: {
                activeObservers: new Set(),
                lastActivity: Date.now(),
                backoffLevel: 0,
                isRateLimited: false,
                globalDebounceDelay: 5000,
                maxBackoffLevel: 5
            },

            /**
             * Create rate-limited safe observer
             */
            createSafeObserver(callback, options = {}) {
                const config = {
                    delay: 5000,
                    maxRetries: 5,
                    autoDisconnect: 30000,
                    backoffMultipliers: [1, 2, 4, 8, 16],
                    target: document.body,
                    observeOptions: { childList: true, subtree: false },
                    ...options
                };

                let observer = null;
                let retryCount = 0;
                let disconnectTimer = null;

                const debouncedCallback = this.debounce(() => {
                    // Check global rate limiting state
                    if (this.state.isRateLimited) {
                        console.warn('MerusCore: Skipping callback due to rate limiting');
                        return;
                    }

                    try {
                        callback();
                        this.state.lastActivity = Date.now();
                        this.state.backoffLevel = Math.max(0, this.state.backoffLevel - 1);
                        retryCount = 0;
                    } catch (error) {
                        this.handleRateLimit(error);
                        retryCount++;

                        if (retryCount >= config.maxRetries) {
                            console.warn('MerusCore: Max retries reached, disconnecting observer');
                            this.disconnectObserver(observer);
                        }
                    }
                }, config.delay);

                const safeCallback = () => {
                    // Coordinated activity check
                    const timeSinceLastActivity = Date.now() - this.state.lastActivity;
                    const minimumDelay = config.delay / 2;

                    if (timeSinceLastActivity < minimumDelay) {
                        console.warn(`MerusCore: Throttling to prevent rate limiting (${timeSinceLastActivity}ms since last activity)`);
                        return;
                    }

                    debouncedCallback();
                };

                observer = new MutationObserver(safeCallback);
                this.state.activeObservers.add(observer);

                // Start observing
                observer.observe(config.target, config.observeOptions);

                // Auto-disconnect timer
                if (config.autoDisconnect > 0) {
                    disconnectTimer = setTimeout(() => {
                        this.disconnectObserver(observer);
                        console.log('MerusCore: Observer auto-disconnected');
                    }, config.autoDisconnect);
                }

                return {
                    observer,
                    disconnect: () => this.disconnectObserver(observer, disconnectTimer),
                    isActive: () => this.state.activeObservers.has(observer)
                };
            },

            /**
             * Disconnect observer safely
             */
            disconnectObserver(observer, timer = null) {
                if (observer) {
                    observer.disconnect();
                    this.state.activeObservers.delete(observer);
                }
                if (timer) clearTimeout(timer);
            },

            /**
             * Handle rate limiting detection
             */
            handleRateLimit(error) {
                const errorMessage = error.message || '';

                if (errorMessage.includes('429') ||
                    errorMessage.includes('rate limit') ||
                    errorMessage.includes('too many requests')) {

                    this.state.isRateLimited = true;
                    this.state.backoffLevel = Math.min(
                        this.state.backoffLevel + 1,
                        this.state.maxBackoffLevel
                    );

                    const backoffDelay = Math.min(
                        60000,
                        5000 * Math.pow(2, this.state.backoffLevel)
                    );

                    console.warn(`MerusCore: Rate limiting detected, backing off for ${backoffDelay}ms`);

                    setTimeout(() => {
                        this.state.isRateLimited = false;
                        console.log('MerusCore: Rate limiting backoff completed');
                    }, backoffDelay);

                    // Notify any listeners
                    this.emitRateLimitEvent(this.state.backoffLevel, backoffDelay);
                }
            },

            /**
             * Emit rate limiting event
             */
            emitRateLimitEvent(backoffLevel, backoffDelay) {
                const event = new CustomEvent('merusRateLimit', {
                    detail: { backoffLevel, backoffDelay, timestamp: Date.now() }
                });
                document.dispatchEvent(event);
            },

            /**
             * Standardized debounce function
             */
            debounce(func, delay) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func.apply(this, args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, delay);
                };
            },

            /**
             * Check if we're currently rate limited
             */
            isRateLimited() {
                return this.state.isRateLimited;
            },

            /**
             * Get current backoff level
             */
            getBackoffLevel() {
                return this.state.backoffLevel;
            },

            /**
             * Manually trigger backoff (for testing)
             */
            triggerBackoff(level = 1) {
                this.state.backoffLevel = Math.min(level, this.state.maxBackoffLevel);
                this.state.isRateLimited = true;
                this.emitRateLimitEvent(level, 5000 * Math.pow(2, level));
            }
        },

        /**
         * Cross-script messaging system
         */
        messaging: {
            /**
             * Emit event to all scripts
             */
            emit(event, data) {
                const customEvent = new CustomEvent(`merus-${event}`, {
                    detail: { data, source: 'MerusCore', timestamp: Date.now() }
                });
                document.dispatchEvent(customEvent);
            },

            /**
             * Listen to events from other scripts
             */
            on(event, callback) {
                const handler = (e) => callback(e.detail);
                document.addEventListener(`merus-${event}`, handler);

                // Return unsubscribe function
                return () => {
                    document.removeEventListener(`merus-${event}`, handler);
                };
            },

            /**
             * One-time event listener
             */
            once(event, callback) {
                const handler = (e) => {
                    callback(e.detail);
                    document.removeEventListener(`merus-${event}`, handler);
                };
                document.addEventListener(`merus-${event}`, handler);
            },

            /**
             * Coordinate actions between scripts
             */
            coordinate(action, options = {}) {
                this.emit('coordinate', { action, options });
            }
        },

        /**
         * Utility functions
         */
        utils: {
            /**
             * Deep merge objects
             */
            merge(target, source) {
                const result = { ...target };
                for (const key in source) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        result[key] = this.merge(result[key] || {}, source[key]);
                    } else {
                        result[key] = source[key];
                    }
                }
                return result;
            },

            /**
             * Generate unique ID
             */
            generateId(prefix = 'merus') {
                return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            },

            /**
             * Check if we're on MerusCase
             */
            isMerusCase() {
                return window.location.hostname.includes('meruscase.com');
            },

            /**
             * Wait for specified time
             */
            async sleep(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }
        }
    };

    // Initialize core systems
    console.log(`MerusCore v${window.MerusCore.version} loaded`);

    // Start rate limiting monitoring
    window.MerusCore.observer.state.lastActivity = Date.now();

    // Listen for rate limiting events
    window.MerusCore.messaging.on('rateLimitHit', (event) => {
        console.log('MerusCore: Rate limiting event received:', event.data);
    });

})();