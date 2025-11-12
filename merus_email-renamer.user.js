// ==UserScript==
// @name         MerusCase Email Renamer
// @namespace    https://github.com/Jason-K
// @version      1.0
// @author       Jason K.
// @description  Renames emails in MerusCase based on sender, recipient, subject, and send date
// @match        https://meruscase.com/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_email-renamer.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_email-renamer.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        buttonId: 'merus-email-renamer-btn',
        buttonClass: 'btn btn-sm btn-info',
        buttonText: 'Rename Email',
        debounceDelay: 5000, // Cloudflare rate limiting protection
        observerTimeout: 30000, // Auto-disconnect observer after 30 seconds
        dateFormat: 'YYYY.MM.DD',
        maxSubjectLength: 100 // Truncate long subjects
    };

    // State tracking
    let isActive = false;
    let renamerButton = null;
    let observer = null;

    // Utility functions
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function isMerusCase() {
        return window.location.hostname.includes('meruscase.com');
    }

    function isEmailView() {
        return document.querySelector('#message-sender') !== null;
    }

    function formatDate(dateString) {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                // If it's not a valid date, return as-is or try other formats
                return dateString;
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            return `${year}.${month}.${day}`;
        } catch (error) {
            console.warn('Email Renamer: Error formatting date:', error);
            return dateString;
        }
    }

    function extractEmailInfo() {
        try {
            // Extract sender information
            const senderElement = document.querySelector('#message-sender');
            const sender = senderElement ? senderElement.textContent.trim() : '';

            // Extract recipient information
            const recipientElement = document.querySelector('#message-recipient');
            const recipients = recipientElement ? recipientElement.textContent.trim() : '';

            // Extract case name
            const caseLinkElement = document.querySelector('.pretty-name-span');
            const caseName = caseLinkElement ? caseLinkElement.textContent.trim() : '';

            // Extract subject from the editable note area
            const noteElement = document.querySelector('.note-editable[contenteditable="true"]');
            let subject = '';
            if (noteElement) {
                // Try to extract subject from current content
                const content = noteElement.textContent.trim();
                // Look for common subject patterns
                const subjectMatch = content.match(/^(.+?)(?:\n|$)/);
                if (subjectMatch) {
                    subject = subjectMatch[1].trim();
                } else {
                    subject = content.substring(0, CONFIG.maxSubjectLength);
                }
            }

            // Try to find the message date (look for date elements in the page)
            let messageDate = new Date().toISOString().split('T')[0]; // Default to today

            // Look for common date patterns in the page
            const dateElements = document.querySelectorAll('[data-merus-type="date"], .date-field, .message-date');
            for (const element of dateElements) {
                const dateValue = element.value || element.textContent;
                if (dateValue && dateValue.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/)) {
                    messageDate = dateValue.trim();
                    break;
                }
            }

            return {
                sender: sender.replace(/<[^>]*>/g, '').trim(), // Remove HTML tags
                recipients: recipients.replace(/<[^>]*>/g, '').trim(),
                subject: subject.replace(/\s+/g, ' ').trim(), // Normalize whitespace
                caseName: caseName,
                messageDate: messageDate
            };
        } catch (error) {
            console.error('Email Renamer: Error extracting email info:', error);
            return null;
        }
    }

    function parseRecipients(recipientsString) {
        if (!recipientsString) return { first: '', others: [] };

        // Split by comma and semicolon, clean up each recipient
        const recipients = recipientsString
            .split(/[,;]+/)
            .map(r => r.replace(/<[^>]*>/g, '').trim()) // Remove email addresses in brackets
            .filter(r => r.length > 0);

        if (recipients.length === 0) return { first: '', others: [] };
        if (recipients.length === 1) return { first: recipients[0], others: [] };

        return {
            first: recipients[0],
            others: recipients.slice(1)
        };
    }

    function generateEmailName(emailInfo) {
        if (!emailInfo) return '';

        const formattedDate = formatDate(emailInfo.messageDate);
        let cleanSubject = emailInfo.subject;

        // Truncate subject if too long
        if (cleanSubject.length > CONFIG.maxSubjectLength) {
            cleanSubject = cleanSubject.substring(0, CONFIG.maxSubjectLength - 3) + '...';
        }

        // Clean up sender name (remove email address if present)
        let cleanSender = emailInfo.sender.replace(/<[^>]*>/g, '').trim();

        // Parse recipients
        const { first, others } = parseRecipients(emailInfo.recipients);

        // Build the formatted name using the new convention
        let emailName = `${formattedDate} - email from ${cleanSender}`;

        if (first) {
            emailName += ` to ${first}`;
        }

        if (others.length > 0) {
            emailName += ` (and ${others.join(', ')})`;
        }

        if (cleanSubject) {
            emailName += ` re. ${cleanSubject}`;
        }

        if (emailInfo.caseName) {
            emailName += ` - ${emailInfo.caseName}`;
        }

        return emailName;
    }

    function findButtons() {
        const tagsButton = document.querySelector('button.edit-button.activity-control');
        const saveButton = document.querySelector('button.save-button[data-action="editpersonal"]');
        const dateInput = document.querySelector('input[name="data[Upload][document_date]"]');
        const editableArea = document.querySelector('.note-editable[contenteditable="true"]');

        return {
            tagsButton,
            saveButton,
            dateInput,
            editableArea
        };
    }

    async function renameEmail() {
        try {
            const emailInfo = extractEmailInfo();
            if (!emailInfo) {
                alert('Could not extract email information. Please make sure you are viewing an email.');
                return;
            }

            const buttons = findButtons();
            if (!buttons.tagsButton || !buttons.saveButton || !buttons.editableArea) {
                alert('Could not find the necessary edit controls. Please try again.');
                return;
            }

            // Generate the new name
            const newName = generateEmailName(emailInfo);
            if (!newName) {
                alert('Could not generate email name from available information.');
                return;
            }

            // Show loading state
            if (renamerButton) {
                renamerButton.textContent = 'Processing...';
                renamerButton.disabled = true;
            }

            // Step 1: Click the Tags button to reveal edit controls
            buttons.tagsButton.click();

            // Wait for the edit area to become available
            await waitForElement('.note-editable[contenteditable="true"]:not([disabled])', 2000);

            // Step 2: Set the document date if available and empty
            if (buttons.dateInput && !buttons.dateInput.value) {
                buttons.dateInput.value = emailInfo.messageDate;
                // Trigger change event
                buttons.dateInput.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Step 3: Update the editable area with the new name
            const updatedEditableArea = document.querySelector('.note-editable[contenteditable="true"]');
            if (updatedEditableArea) {
                updatedEditableArea.focus();
                updatedEditableArea.textContent = newName;

                // Trigger input event to ensure changes are registered
                updatedEditableArea.dispatchEvent(new Event('input', { bubbles: true }));

                // Small delay to ensure the content is registered
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Step 4: Click Save button
            const updatedSaveButton = document.querySelector('button.save-button[data-action="editpersonal"]');
            if (updatedSaveButton) {
                updatedSaveButton.click();

                // Wait a moment for save to complete
                await new Promise(resolve => setTimeout(resolve, 1000));

                alert('Email renamed successfully!');
            } else {
                alert('Save button not found after editing. Please save manually.');
            }

        } catch (error) {
            console.error('Email Renamer: Error during rename:', error);
            alert('An error occurred while renaming the email. Please try again.');
        } finally {
            // Reset button state
            if (renamerButton) {
                renamerButton.textContent = CONFIG.buttonText;
                renamerButton.disabled = false;
            }
        }
    }

    function waitForElement(selector, timeout = 2000) {
        return new Promise((resolve) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    function createRenamerButton() {
        // Remove existing button if present
        if (renamerButton && renamerButton.parentNode) {
            renamerButton.parentNode.removeChild(renamerButton);
        }

        renamerButton = document.createElement('button');
        renamerButton.id = CONFIG.buttonId;
        renamerButton.className = CONFIG.buttonClass;
        renamerButton.innerHTML = `<i class="fas fa-envelope"></i> ${CONFIG.buttonText}`;
        renamerButton.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;

        renamerButton.addEventListener('click', debounce(renameEmail, 1000));
        document.body.appendChild(renamerButton);
    }

    function initEmailRenamer() {
        if (!isMerusCase() || !isEmailView()) {
            return;
        }

        createRenamerButton();
        isActive = true;

        console.log('Email Renamer: Initialized');
    }

    function cleanupEmailRenamer() {
        if (renamerButton && renamerButton.parentNode) {
            renamerButton.parentNode.removeChild(renamerButton);
            renamerButton = null;
        }

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        isActive = false;
    }

    // Main initialization with Cloudflare-safe observer
    function checkAndInitialize() {
        if (isActive) return;

        if (isEmailView()) {
            initEmailRenamer();
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndInitialize);
    } else {
        checkAndInitialize();
    }

    // Set up a conservative observer for SPA navigation
    // with auto-disconnect to avoid Cloudflare rate limiting
    observer = new MutationObserver(debounce(() => {
        if (isActive && !isEmailView()) {
            cleanupEmailRenamer();
        } else if (!isActive && isEmailView()) {
            checkAndInitialize();
        }
    }, CONFIG.debounceDelay));

    // Observe only specific changes, not the entire document
    const targetNode = document.querySelector('main') || document.body;
    if (targetNode) {
        observer.observe(targetNode, {
            childList: true,
            subtree: false // Limited observation to reduce rate limiting
        });
    }

    // Auto-disconnect observer after timeout to prevent issues
    setTimeout(() => {
        if (observer) {
            observer.disconnect();
            console.log('Email Renamer: Observer auto-disconnected to prevent rate limiting');
        }
    }, CONFIG.observerTimeout);

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanupEmailRenamer);

})();