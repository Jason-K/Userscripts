// ==UserScript==
// @name         MerusCase Unified Utilities
// @namespace    https://github.com/Jason-K/Userscripts
// @version      3.0.4
// @description  Combined MerusCase utilities: Default Assignee, PDF Download, Smart Renamer, Email Renamer, Smart Tab, Close Warning Prevention, and Antinote Integration
// @author       Jason Knox
// @match        https://*.meruscase.com/*
// @grant        GM_addStyle
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_unified.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_unified.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Fallback for GM_addStyle if not provided by the userscript manager (e.g. Violentmonkey/Chrome extensions environment)
    if (typeof GM_addStyle !== 'function') {
        window.GM_addStyle = function(css) {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
            return style;
        };
        console.log('ℹ️ GM_addStyle not found; using inline fallback implementation');
    }

    console.log('🚀 MerusCase Unified Utilities v3.0.0 initializing...');

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

                // Tab key - insert spaces
                if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        this.insertAtCaret(range, content);
                    }
                }
                // Shift+Tab - remove spaces
                else if (e.key === 'Tab' && e.shiftKey) {
                    e.preventDefault();
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        this.tryUnindentInline(range, content);
                    }
                }
                // Backspace - smart unindent
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

                event.preventDefault();
                const filename = this.runFilenameLogic();

                try {
                    await navigator.clipboard.writeText(filename);
                    console.log('✓ PDF filename copied:', filename);
                } catch (err) {
                    console.warn('Could not copy filename:', err);
                }

                const href = link.getAttribute('href');
                if (href) {
                    const a = document.createElement('a');
                    a.href = href;
                    a.download = filename + '.pdf';
                    a.click();
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
            // Extract date
            const dateMatch = stem.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
            let date = '';
            if (dateMatch) {
                date = this.extractDate(dateMatch[1]);
                stem = stem.replace(dateMatch[0], '').trim();
            }

            // Normalize business suffixes
            stem = stem.replace(/,?\s*(llp|inc\.?|pc|corp\.?|llc)$/i, '');

            // Smart case
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
            if (!input) return;

            const original = input.value.trim();
            if (!original) return;

            const transformed = this.transform(original);
            if (transformed !== original) {
                input.value = transformed;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('✓ Renamed:', original, '→', transformed);
            }
        },

        init() {
            // Watch for rename button clicks
            document.addEventListener('click', (event) => {
                const btn = event.target.closest('a.rename-document');
                if (btn) {
                    setTimeout(() => this.handleRename(), 500);
                }
            });

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
            if (!this.isEmailView()) return;

            const info = this.extractEmailInfo();
            const newName = this.generateEmailName(info);

            const descInput = document.querySelector('input[name="data[Activity][description]"]');
            if (descInput) {
                descInput.value = newName;
                descInput.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('✓ Email renamed:', newName);
            }
        },

        init() {
            // Trigger on edit button click
            document.addEventListener('click', (event) => {
                const btn = event.target.closest('button.edit-button.activity-control');
                if (btn && this.isEmailView()) {
                    setTimeout(() => this.renameEmail(), 500);
                }
            });

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
            // Lightweight, self-contained toast (no observers, minimal DOM impact)
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
                return null; // Return null instead of 'Unknown Client' so we can handle it differently
            }

            const raw = (el.getAttribute('title') || el.textContent || '').trim();
            console.log('📋 Raw client info:', raw);

            const namePart = raw.split(' v. ')[0].trim();
            console.log('📋 Name part (before v.):', namePart);

            const parts = namePart.split(',');
            if (parts.length < 2) {
                console.log('📋 Single-part name (no comma):', namePart);
                return namePart;
            }

            const last = parts[0].trim();
            const firstM = parts.slice(1).join(' ').trim();
            const fullName = `${firstM} ${last}`.trim();
            console.log('📋 Formatted name:', fullName);
            return fullName;
        },

        getActiveDocument() {
            const el = document.querySelector('.box-view .list-group-item h5 span');
            return el ? el.textContent.trim() : '';
        },

        buildAntinoteURL(action, content, title) {
            // Use Antinote custom URL scheme instead of https endpoints
            // createNote: antinote://x-callback-url/createNote?content=...
            // appendToCurrent: antinote://x-callback-url/appendToCurrent?content=...
            const base = 'antinote://x-callback-url';

            // Use encodeURIComponent directly to avoid URLSearchParams' + encoding for spaces
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

            // Prefer direct navigation for Safari to custom URL schemes
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            let opened = false;

            try {
                if (isSafari) {
                    // Use location.assign for custom schemes with a user gesture
                    window.location.assign(url);
                    opened = true;
                } else {
                    // Other browsers: try anchor click first
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

            // Fallback: try an invisible iframe (some Safari versions allow this)
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

            // Final fallback: copy URL to clipboard and notify user
            if (!opened) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(() => {
                        this.showToast('Antinote URL copied. Tap to open Antinote.');
                        console.warn('Antinote URL copied to clipboard. Tap it to open:', url);
                    }).catch(() => {
                        this.showToast('Unable to open. Please paste URL manually.');
                        console.warn('Unable to open Antinote URL. Please copy/paste:', url);
                    });
                } else {
                    this.showToast('Unable to open. Please copy/paste the URL.');
                    console.warn('Unable to open Antinote URL. Please copy/paste:', url);
                }
            }

            setTimeout(() => { this.launching = false; }, 1000);
        },

        createNote() {
            const client = this.getClientFirstLast();
            const date = Utils.formatDate(new Date(), 'MM/DD/YY');
            const activeDoc = this.getActiveDocument();

            console.log('📝 Client extracted:', client);
            console.log('📝 USE_TITLE config:', this.config.USE_TITLE);
            console.log('📝 Active document:', activeDoc);

            // Fallback: embed client name directly in content title line
            const header = client ? `# ${client} — ${date}` : `# ${date}`;
            let content = `${header}\n\n## ISSUE\n\n---\n\n`;
            if (activeDoc) content += `**Active Document:** ${activeDoc}\n\n`;

            // Only pass title if we have a valid client name
            const title = (this.config.USE_TITLE && client) ? client : null;
            console.log('📝 Title being passed:', title);

            const url = this.buildAntinoteURL('createNote', content, title);
            console.log('📝 Final URL:', url);
            this.launch(url);
        },

        appendToCurrent() {
            const date = Utils.formatDate(new Date(), 'MM/DD/YY');
            const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const activeDoc = this.getActiveDocument();
            const client = this.getClientFirstLast();

            // Include client name inline for context
            const subHeader = client ? `## ${date} ${time} — ${client}` : `## ${date} ${time}`;
            let content = `---\n\n${subHeader}\n\n`;
            if (activeDoc) content += `**Active Document:** ${activeDoc}\n\n`;

            const url = this.buildAntinoteURL('appendToCurrent', content);
            this.launch(url);
        },

        init() {
            // Add styles
            GM_addStyle(`
                .jjk-antinote-wrap{position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;gap:10px}
                .jjk-antinote-btn{padding:10px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);background:#1f6feb;color:#fff !important;font:600 13px/1 -apple-system,sans-serif;cursor:pointer;border:none;opacity:.95}
                .jjk-antinote-btn:hover{opacity:1}
                .jjk-antinote-btn.append{background:#6f42c1}
            `);

            // Create buttons
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

            // Hotkey Alt+Shift+A
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
    // INITIALIZE ALL MODULES
    // ============================================================================

    function initializeAll() {
        PreventCloseWarning.init();
        DefaultAssignee.init();
        SmartTab.init();
        QuickPDFDownload.init();
        SmartRenamer.init();
        EmailRenamer.init();
        AntinoteIntegration.init();

        console.log('✅ All MerusCase utilities initialized successfully');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAll);
    } else {
        initializeAll();
    }

})();
