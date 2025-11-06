// ==UserScript==
// @name         Meruscase Auto-Tagger
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Automatically apply activity tags based on note content in Meruscase
// @author       Jason K.
// @match        https://meruscase.com/*
// @match        https://*.meruscase.com/*
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tag-calls.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_tag-calls.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Configuration object for tag rules based on actual Meruscase options
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

    // Function to analyze note content and suggest tags
    function analyzeNoteContent(noteContent) {
        const suggestedTags = [];
        const content = noteContent.toLowerCase();
        let extractedContact = null;

        // Special handling for telephone call pattern
        const telephonePattern = /telephone call with\s+([^,\n\r.]+)/i;
        const telephoneMatch = noteContent.match(telephonePattern);

        if (telephoneMatch) {
            suggestedTags.push('111'); // Telephone Call tag
            extractedContact = telephoneMatch[1].trim();
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

    // Function to apply tags to the select element and populate contact if provided
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

            // Trigger change event to ensure any listeners are notified
            const changeEvent = new Event('change', { bubbles: true });
            tagSelect.dispatchEvent(changeEvent);

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

            // Show a visual indicator
            showTagNotification(tagName, tagValues.length > 1 ? tagValues.length - 1 : 0, contactName);
        }
    }

    // Function to populate the contact field
    function populateContactField(contactName) {
        // Look for the contact input field
        const contactInput = document.querySelector('input[name="data[Activity][contact_name]"]');

        if (contactInput) {
            contactInput.value = contactName;

            // Trigger input events to ensure autocomplete and other listeners are notified
            const inputEvent = new Event('input', { bubbles: true });
            const changeEvent = new Event('change', { bubbles: true });

            contactInput.dispatchEvent(inputEvent);
            contactInput.dispatchEvent(changeEvent);

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
                    const inputEvent = new Event('input', { bubbles: true });
                    const changeEvent = new Event('change', { bubbles: true });
                    delayedContactInput.dispatchEvent(inputEvent);
                    delayedContactInput.dispatchEvent(changeEvent);
                    console.log(`Auto-populated contact field (delayed) with: ${contactName}`);
                }
            }, 1000);
        }
    }

    // Function to show a notification about applied tags
    function showTagNotification(appliedTag, additionalSuggestions, contactName = null) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 10px 15px;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 300px;
        `;

        let message = `Auto-applied tag: ${appliedTag}`;
        if (contactName) {
            message += `\nContact: ${contactName}`;
        }
        if (additionalSuggestions > 0) {
            message += ` (+${additionalSuggestions} more suggestions)`;
        }

        notification.textContent = message;
        notification.style.whiteSpace = 'pre-line'; // Allow line breaks
        document.body.appendChild(notification);

        // Remove notification after 4 seconds (longer since there's more info)
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }

    // Function to get note content from the editor
    function getNoteContent() {
        // Try multiple selectors to find the note content
        const noteEditable = document.querySelector('.note-editable');
        const textarea = document.querySelector('textarea[name="data[Activity][activity]"]');

        if (noteEditable) {
            return noteEditable.textContent || noteEditable.innerText || '';
        } else if (textarea) {
            return textarea.value || '';
        }

        return '';
    }

    // Main function to handle save button click
    function handleSaveClick(event) {
        console.log('Save button clicked, analyzing note content...');

        const noteContent = getNoteContent();
        console.log('Note content:', noteContent);

        if (noteContent.trim()) {
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

    // Function to add event listeners to save buttons
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

    // Function to initialize the script
    function init() {
        console.log('Meruscase Auto-Tagger initialized');
        addSaveButtonListeners();

        // Re-run listener attachment when DOM changes (for dynamically loaded content)
        let observerThrottle = null;
        const observer = new MutationObserver(() => {
            // Throttle to max once per 3 seconds to prevent rate limiting
            if (observerThrottle) return;
            observerThrottle = setTimeout(() => { observerThrottle = null; }, 3000);

            addSaveButtonListeners();
        });

        // Reduced scope: only watch childList on body, no subtree
        observer.observe(document.body, {
            childList: true,
            subtree: false
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Add some CSS for better visual feedback
    const style = document.createElement('style');
    style.textContent = `
        .auto-tag-suggestion {
            background-color: #e8f5e8 !important;
            border: 2px solid #4CAF50 !important;
        }
    `;
    document.head.appendChild(style);

    // Expose functions for debugging/manual testing
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
            return match ? match[1].trim() : null;
        }
    };

})();
