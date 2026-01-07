// ==UserScript==
// @name         MerusCase Auto-Tagger
// @namespace    https://github.com/Jason-K
// @version      2.0.0
// @description  Automatically apply activity tags based on note content in MerusCase
// @author       Jason K.
// @match        https://meruscase.com/*
// @match        https://*.meruscase.com/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tag-calls.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tag-calls.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Initialize script using MerusCore
    const script = MerusCore.createScript({
        name: 'AutoTagger',
        version: '2.0.0'
    });

    // Configuration object for tag rules based on actual MerusCase options
    const tagRules = {
        // Communication & Correspondence
        'email': '35551', // EMAIL
        'e-mail': '35551', // EMAIL
        'sent email': '104', // Email Sent
        'received email': '107', // Email Received
        'correspondence': '35539', // CORRESPONDENCE
        'letter': '102', // Letter Sent
        'received letter': '105', // Letter Received
        'fax': '103', // Fax Sent
        'received fax': '106', // Fax Received
        'telephone': '111', // Telephone Call
        'phone': '111', // Telephone Call
        'called': '111', // Telephone Call
        'call': '111', // Telephone Call

        // Legal Proceedings
        'deposition': '42912', // DEPOSITION NOTICES
        'depo': '42912', // DEPOSITION NOTICES
        'deposition transcript': '42913', // DEPOSITION TRANSCRIPTS
        'discovery': '97855', // DISCOVERY
        'plaintiff discovery': '42915', // DISCOVERY – PLAINTIFF
        'defendant discovery': '42914', // DISCOVERY – DEFENDANT
        'trial': '42921', // TRIAL
        'mediation': '42920', // MEDIATION
        'arbitration': '42908', // ARBITRATION
        'adr': '97854', // ADR
        'msc': '42927', // MSC
        'motion': '42922', // MOTIONS
        'demurrer': '42929', // DEMURRER
        'pleading': '35538', // PLEADING

        // Medical & Evaluations
        'qme': '35550', // QME PANEL LIST/PROCESS
        'ame': '35549', // AME/QME
        'medical': '35537', // MEDICAL
        'dme': '42916', // DME
        'expert': '42923', // EXPERTS
        'expert demand': '42924', // EXPERT DEMANDS
        'expert disclosure': '42925', // EXPERT DISCLOSURES
        'imr': '40657', // IMR

        // Records & Documentation
        'medical records': '42919', // RECORDS REQUESTING
        'records': '42919', // RECORDS REQUESTING
        'subpoena': '35545', // SUBPOENA RECORDS
        'exhibits': '60105', // EXHIBITS
        'photos': '42928', // PHOTOS & VIDEOS
        'video': '42928', // PHOTOS & VIDEOS
        'memo': '42918', // MEMOS & NOTES
        'note': '101', // Note
        'facts': '42917', // FACTS

        // Case Management
        'settlement': '35723', // Settlement
        'lien': '35543', // LIENS
        'benefit': '35541', // BENEFIT TRACKING
        'penalties': '35544', // PENALTIES
        'penalty': '35544', // PENALTIES
        'costs': '42911', // COSTS
        'fee': '109', // Fee
        'fee tracking': '35547', // FEE TRACKING
        'payment': '110', // Payment
        'check': '53629', // Check

        // Administrative
        'client info': '35548', // CLIENT INFO
        'client forms': '42907', // CLIENT FORMS & AUTHORIZATIONS
        'authorization': '42907', // CLIENT FORMS & AUTHORIZATIONS
        'case management': '42910', // CASE MANAGEMENT
        'opening documents': '35542', // OPENING DOCUMENTS
        'calendar': '98316', // Calendar Mail

        // Insurance & Benefits
        'social security': '35546', // SOCIAL SECURITY
        'rehabilitation': '35535', // REHAB
        'rehab': '35535', // REHAB
        'utilization review': '35540', // UTILIZATION REVIEW
        'longshore': '35536', // LONGSHORE
        'mpn': '35587', // MPN
        'msa': '71813', // MSA/CMS
        'cms': '71813', // MSA/CMS
        'um': '42930', // UM-UIM
        'uim': '42930', // UM-UIM
        'disability retirement': '56718', // Disability Retirement

        // Electronic/Technical
        'eams': '82511', // EAMS E-FILED
        'e-filed': '82511', // EAMS E-FILED
        'efax': '57696', // eFax Confirmation
        'electronic signature': '114', // Electronic Signature

        // Attorney Work
        'attorney': '35531', // Attorney
        'attorney note': '35640', // Attorney Note

        // Miscellaneous
        'library': '40631', // LIBRARY
        'reviewed': '113', // Reviewed
        'proof': '108', // Proof Sent
        'copy service': '112', // Copy Service Request
        'court rules': '115', // Court Rules
        'manual entry': '100', // Manual Entry
        'indexable': '99047', // Indexable
        'mail to bsa': '35629', // Mail to BSA
        'unread mail': '35574', // Unread Mail
        'main case activity': '35534' // MAIN CASE ACTIVITY
    };

    // Initialize script with MerusCore
    script.init(() => {
        if (!MerusCore.utils.isMerusCase()) return;

        console.log('MerusCase Auto-Tagger initialized');

        // Add custom CSS for visual feedback
        const style = document.createElement('style');
        style.textContent = `
            .auto-tag-suggestion {
                background-color: #e8f5e8 !important;
                border: 2px solid #4CAF50 !important;
            }
        `;
        document.head.appendChild(style);

        // Add cleanup
        script.addCleanup(() => {
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        });

        // Core functions using MerusCore utilities
        function analyzeNoteContent(noteContent) {
            const suggestedTags = [];
            const content = noteContent.toLowerCase();
            let extractedContact = null;

            // Special handling for telephone call pattern
            const telephonePattern = /telephone call with\s+([^,\n\r.]+)/i;
            const telephoneMatch = noteContent.match(telephonePattern);

            if (telephoneMatch) {
                suggestedTags.push('111'); // Telephone Call tag
                extractedContact = MerusCore.text.normalizeWhitespace(telephoneMatch[1]);
                console.log('Detected telephone call with contact:', extractedContact);
            }

            // Check for other keyword matches (but skip if we already found telephone call)
            if (!telephoneMatch) {
                for (const [keyword, tagValue] of Object.entries(tagRules)) {
                    if (content.includes(keyword.toLowerCase())) {
                        suggestedTags.push(tagValue);
                    }
                }
            }

            // Remove duplicates
            return {
                tags: [...new Set(suggestedTags)],
                contact: extractedContact
            };
        }

        function applyTags(tagValues, contactName = null) {
            const tagSelect = document.querySelector('select[name="data[Activity][activity_type_id][]"]');
            if (!tagSelect) {
                console.log('Tag select element not found');
                return;
            }

            // Apply the first suggested tag
            if (tagValues.length > 0) {
                const firstTag = tagValues[0];
                tagSelect.value = firstTag;

                // Trigger change event using MerusCore utilities
                MerusCore.dom.triggerEvents(tagSelect, ['change']);

                // Get the tag name for display
                const selectedOption = tagSelect.querySelector(`option[value="${firstTag}"]`);
                const tagName = selectedOption ? selectedOption.textContent : 'Unknown';

                console.log(`Auto-applied tag: ${tagName} (${firstTag})`);

                // If we have a contact name and this is a telephone call, populate the contact field
                if (contactName && firstTag === '111') {
                    // Wait a bit for the contact field to appear after tag selection
                    setTimeout(() => {
                        populateContactField(contactName);
                    }, 500);
                }

                // Show visual feedback using MerusCore toast
                let message = `Auto-applied tag: ${tagName}`;
                if (contactName) {
                    message += `\nContact: ${contactName}`;
                }
                if (tagValues.length > 1) {
                    message += `\n(+${tagValues.length - 1} more suggestions)`;
                }

                MerusCore.ui.showToast(message, 'success', 4000);
            }
        }

        function populateContactField(contactName) {
            // Look for the contact input field
            const contactInput = document.querySelector('input[name="data[Activity][contact_name]"]');

            if (contactInput) {
                contactInput.value = contactName;

                // Trigger events using MerusCore utilities
                MerusCore.dom.triggerEvents(contactInput, ['input', 'change']);

                // Also try triggering focus and blur to activate any autocomplete
                contactInput.focus();
                setTimeout(() => contactInput.blur(), 100);

                console.log(`Auto-populated contact field with: ${contactName}`);
            } else {
                console.log('Contact input field not found - it may not be visible yet');

                // Try again after a longer delay in case the field takes time to appear
                setTimeout(() => {
                    const delayedContactInput = document.querySelector('input[name="data[Activity][contact_name]"]');
                    if (delayedContactInput) {
                        delayedContactInput.value = contactName;
                        MerusCore.dom.triggerEvents(delayedContactInput, ['input', 'change']);
                        console.log(`Auto-populated contact field (delayed) with: ${contactName}`);
                    }
                }, 1000);
            }
        }

        function getNoteContent() {
            // Use MerusCore DOM utilities with fallbacks
            const noteEditable = MerusCore.dom.findNoteEditable();
            if (noteEditable) {
                return MerusCore.text.stripHTML(noteEditable.innerHTML).trim();
            }

            const textarea = document.querySelector('textarea[name="data[Activity][activity]"]');
            if (textarea) {
                return textarea.value.trim();
            }

            return '';
        }

        function handleSaveClick(event) {
            console.log('Save button clicked, analyzing note content...');

            const noteContent = getNoteContent();
            console.log('Note content:', noteContent);

            if (noteContent) {
                const analysis = analyzeNoteContent(noteContent);
                console.log('Analysis result:', analysis);

                if (analysis.tags.length > 0) {
                    // Check if a tag is already selected
                    const tagSelect = document.querySelector('select[name="data[Activity][activity_type_id][]"]');
                    if (tagSelect && tagSelect.value === '0') {
                        applyTags(analysis.tags, analysis.contact);
                    } else {
                        console.log('Tag already selected, skipping auto-tagging');
                    }
                } else {
                    console.log('No matching tags found for the note content');
                }
            } else {
                console.log('No note content found');
            }
        }

        function addSaveButtonListeners() {
            // Look for save buttons with various selectors
            const saveButtons = document.querySelectorAll([
                'button.save-button',
                'button[data-action="editpersonal"]',
                '.btn.btn-primary.save-button',
                '#case-ledger-save-and-close-button'
            ].join(', '));

            saveButtons.forEach(button => {
                if (!button.hasAttribute('data-auto-tagger-attached')) {
                    button.addEventListener('click', handleSaveClick);
                    button.setAttribute('data-auto-tagger-attached', 'true');
                    console.log('Added auto-tagger listener to save button');
                }
            });
        }

        // Initialize listeners
        addSaveButtonListeners();

        // Use event delegation on document instead of MutationObserver (Cloudflare-safe)
        const clickHandler = function(e) {
            if (e.target && e.target.closest('button[type="submit"]')) {
                // Re-attach listeners when user clicks submit (safer than observing)
                setTimeout(addSaveButtonListeners, 100);
            }
        };

        document.addEventListener('click', clickHandler, true);
        script.addCleanup(() => {
            document.removeEventListener('click', clickHandler, true);
        });

        // Expose functions for debugging using MerusCore messaging
        MerusCore.messaging.on('debug-autotag', (event) => {
            const { action, data } = event.data;
            switch (action) {
                case 'analyze':
                    const analysis = analyzeNoteContent(data.content);
                    console.log('AutoTagger Analysis:', analysis);
                    break;
                case 'apply':
                    applyTags(data.tags, data.contact);
                    break;
                case 'test-telephone':
                    const pattern = /telephone call with\s+([^,\n\r.]+)/i;
                    const match = data.text.match(pattern);
                    console.log('Telephone pattern result:', match ? match[1].trim() : null);
                    break;
            }
        });

        // Expose functions for debugging via global object
        window.merusAutoTagger = {
            analyzeContent: analyzeNoteContent,
            applyTags: applyTags,
            getNoteContent: getNoteContent,
            populateContactField: populateContactField,
            tagRules: tagRules,
            // Test function for the telephone pattern
            testTelephonePattern: function(text) {
                const pattern = /telephone call with\s+([^,\n\r.]+)/i;
                const match = text.match(pattern);
                return match ? MerusCore.text.normalizeWhitespace(match[1]) : null;
            }
        };
    });

})();
