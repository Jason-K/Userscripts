// ==UserScript==
// @name         MerusCase Email Renamer (Refactored)
// @namespace    https://github.com/Jason-K
// @version      2.0.0
// @author       Jason K.
// @description  Renames emails in MerusCase based on sender, recipient, subject, and send date using MerusCore for better performance and UI consistency
// @match        https://meruscase.com/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_email-renamer.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_email-renamer.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Initialize script using MerusCore
    const script = MerusCore.createScript({
        name: 'EmailRenamer',
        version: '2.0.0'
    });

    script.init(() => {
        if (!MerusCore.utils.isMerusCase()) return;

        console.log('MerusCase Email Renamer initialized with MerusCore');

        // Configuration
        const CONFIG = {
            buttonId: 'merus-email-renamer-btn',
            debounceDelay: 5000,
            observerTimeout: 30000,
            dateFormat: 'YYYY.MM.DD',
            maxSubjectLength: 100
        };

        // State tracking
        let isActive = false;
        let renamerButton = null;
        let observer = null;

          // Helper functions using MerusCore utilities
        function isEmailView() {
            // Check for email view with editable capabilities
            const hasMessageSender = document.querySelector('#message-sender') !== null;
            const hasEditableArea = document.querySelector('.note-editable[contenteditable="true"]') !== null;
            const hasTagsButton = document.querySelector('button.edit-button.activity-control') !== null;

            return hasMessageSender && (hasEditableArea || hasTagsButton);
        }

        function isEmailInEditMode() {
            // Check if email is currently in edit mode (has visible editable area)
            const editableArea = document.querySelector('.note-editable[contenteditable="true"]');
            const saveButton = document.querySelector('button.save-button[data-action="editpersonal"]');

            return editableArea && saveButton;
        }

          function extractEmailInfo() {
            try {
                // Extract sender information using MerusCore DOM utilities
                const sender = MerusCore.dom.safeText('#message-sender');
                const recipients = MerusCore.dom.safeText('#message-recipient');
                const caseName = MerusCore.dom.extractCaseName();

                // Extract subject from the editable note area using MerusCore text utilities
                const noteElement = document.querySelector('.note-editable[contenteditable="true"]');
                let subject = '';
                if (noteElement) {
                    const content = MerusCore.text.stripHTML(noteElement.innerHTML).trim();
                    const subjectMatch = content.match(/^(.+?)(?:\n|$)/);
                    if (subjectMatch) {
                        subject = MerusCore.text.normalizeWhitespace(subjectMatch[1]);
                    } else {
                        subject = MerusCore.text.truncate(content, CONFIG.maxSubjectLength);
                    }
                }

                // Use MerusCore date parsing for message date
                let messageDate = MerusCore.date.today('YYYY-MM-DD');
                const dateElements = document.querySelectorAll('[data-merus-type="date"], .date-field, .message-date');
                for (const element of dateElements) {
                    const dateValue = element.value || element.textContent;
                    const parsedDate = MerusCore.date.parse(dateValue);
                    if (parsedDate) {
                        messageDate = MerusCore.date.format(parsedDate, 'YYYY-MM-DD');
                        break;
                    }
                }

                return {
                    sender: MerusCore.text.stripHTML(sender),
                    recipients: MerusCore.text.stripHTML(recipients),
                    subject: MerusCore.text.normalizeWhitespace(subject),
                    caseName,
                    messageDate
                };
            } catch (error) {
                console.error('Email Renamer: Error extracting email info:', error);
                MerusCore.ui.showToast('Error extracting email information', 'error', 3000);
                return null;
            }
        }

        function parseRecipients(recipientsString) {
            if (!recipientsString) return { first: '', others: [] };

            // Use MerusCore text utilities for parsing
            const recipients = MerusCore.text.normalizeWhitespace(recipientsString)
                .split(/[,;]+/)
                .map(r => MerusCore.text.stripHTML(r).trim())
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

            const formattedDate = MerusCore.date.format(emailInfo.messageDate, CONFIG.dateFormat);
            let cleanSubject = emailInfo.subject;

            // Use MerusCore text utilities for truncation
            if (cleanSubject.length > CONFIG.maxSubjectLength) {
                cleanSubject = MerusCore.text.truncate(cleanSubject, CONFIG.maxSubjectLength);
            }

            // Use MerusCore text utilities for sender cleaning
            let cleanSender = MerusCore.text.stripHTML(emailInfo.sender);

            // Parse recipients
            const { first, others } = parseRecipients(emailInfo.recipients);

            // Build the formatted name using the specified convention
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
            // Use MerusCore selectors for common elements - look for Tags button with various class combinations
            const tagsButton = document.querySelector('button.edit-button.activity-control') ||
                              document.querySelector('button.btn.btn-sm.btn-default.edit-button.activity-control') ||
                              document.querySelector('button:has(.fa-tags)') ||
                              document.querySelector('button[title*="Tags"]') ||
                              Array.from(document.querySelectorAll('button')).find(btn =>
                                  btn.textContent.includes('Tags') && btn.classList.contains('edit-button')
                              );

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

          // Main rename function using MerusCore utilities
        async function renameEmail() {
            try {
                const emailInfo = extractEmailInfo();
                if (!emailInfo) {
                    MerusCore.ui.showToast('Could not extract email information. Please make sure you are viewing an email.', 'error', 5000);
                    return;
                }

                const buttons = findButtons();

                // Debug information - log what buttons were found
                console.log('Email Renamer: Button search results:', {
                    tagsButton: !!buttons.tagsButton,
                    saveButton: !!buttons.saveButton,
                    dateInput: !!buttons.dateInput,
                    editableArea: !!buttons.editableArea,
                    allEditButtons: document.querySelectorAll('button.edit-button').length,
                    allActivityButtons: document.querySelectorAll('button.activity-control').length
                });

                if (!buttons.tagsButton || !buttons.saveButton || !buttons.editableArea) {
                    const missingButtons = [];
                    if (!buttons.tagsButton) missingButtons.push('Tags button');
                    if (!buttons.saveButton) missingButtons.push('Save button');
                    if (!buttons.editableArea) missingButtons.push('Editable area');

                    if (!buttons.editableArea && !buttons.saveButton && buttons.tagsButton) {
                        MerusCore.ui.showToast('Please click the "Tags" button first to enter edit mode', 'info', 4000);
                    } else {
                        MerusCore.ui.showToast(`Could not find: ${missingButtons.join(', ')}. Please make sure you\'re on an individual email view and click the Tags button.`, 'error', 5000);
                    }
                    return;
                }

                // Generate the new name
                const newName = generateEmailName(emailInfo);
                if (!newName) {
                    MerusCore.ui.showToast('Could not generate email name from available information.', 'error', 5000);
                    return;
                }

                // Show loading state using MerusCore button
                if (renamerButton) {
                    renamerButton.setLoading(true);
                }

                // Step 1: Click the Tags button to reveal edit controls
                buttons.tagsButton.click();

                // Use MerusCore utilities to wait for edit area
                const updatedEditableArea = await MerusCore.dom.waitForElement('.note-editable[contenteditable="true"]:not([disabled])', 3000);
                if (!updatedEditableArea) {
                    throw new Error('Editable area not available after clicking Tags button');
                }

                // Step 2: Set the document date if available and empty using MerusCore utilities
                if (buttons.dateInput && !buttons.dateInput.value) {
                    buttons.dateInput.value = emailInfo.messageDate;
                    // Trigger change event using MerusCore utilities
                    MerusCore.dom.triggerEvents(buttons.dateInput, ['change']);
                }

                // Step 3: Update the editable area with the new name
                updatedEditableArea.focus();
                updatedEditableArea.textContent = newName;

                // Trigger input event using MerusCore utilities
                MerusCore.dom.triggerEvents(updatedEditableArea, ['input']);

                // Small delay to ensure the content is registered
                await MerusCore.utils.sleep(500);

                // Step 4: Click Save button
                const updatedSaveButton = document.querySelector('button.save-button[data-action="editpersonal"]');
                if (updatedSaveButton) {
                    updatedSaveButton.click();

                    // Wait for save to complete
                    await MerusCore.utils.sleep(1000);

                    MerusCore.ui.showToast('Email renamed successfully!', 'success', 3000);

                    // Send message to other scripts about the rename
                    MerusCore.messaging.emit('email-renamed', {
                        oldName: emailInfo.subject || 'No Subject',
                        newName: newName,
                        sender: emailInfo.sender,
                        recipients: emailInfo.recipients,
                        caseName: emailInfo.caseName,
                        timestamp: Date.now()
                    });

                } else {
                    MerusCore.ui.showToast('Save button not found after editing. Please save manually.', 'warning', 5000);
                }

            } catch (error) {
                console.error('Email Renamer: Error during rename:', error);
                MerusCore.ui.showToast('An error occurred while renaming the email. Please try again.', 'error', 5000);
                MerusCore.utils.sleep(500);
                throw error;
            } finally {
                    // Reset button state using MerusCore button utilities
                    if (renamerButton) {
                        renamerButton.setLoading(false);
                    }
                }
            }

        function initEmailRenamer() {
            if (!isEmailView()) {
                return;
            }

            // Create rename button using MerusCore UI system
            if (renamerButton) {
                renamerButton.remove();
                renamerButton = null;
            }

            // Check if email is in edit mode
            const inEditMode = isEmailInEditMode();
            const buttonText = inEditMode ? '📧 Rename Email' : '📧 Edit Email First';
            const buttonStyle = inEditMode ? 'info' : 'warning';

            renamerButton = MerusCore.ui.createButton({
                text: buttonText,
                position: 'top-right',
                style: buttonStyle,
                icon: 'fa-envelope',
                onClick: MerusCore.observer.debounce(() => {
                    if (!isEmailInEditMode()) {
                        MerusCore.ui.showToast('Please click the "Tags" button first to enter edit mode', 'info', 4000);
                    } else {
                        renameEmail();
                    }
                }, 1000)
            });

            document.body.appendChild(renamerButton.element);
            isActive = true;

            console.log('Email Renamer: Initialized' + (inEditMode ? ' (in edit mode)' : ' (requires Tags button click)'));

            // Send message about initialization
            MerusCore.messaging.emit('email-renamer-initialized', {
                version: '2.0.0',
                inEditMode: inEditMode,
                timestamp: Date.now()
            });
        }

        function cleanupEmailRenamer() {
            if (renamerButton) {
                renamerButton.remove();
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

        // Use MerusCore Cloudflare-safe observer for SPA navigation and edit mode changes
        observer = MerusCore.observer.createSafeObserver(() => {
            if (isActive && !isEmailView()) {
                cleanupEmailRenamer();
            } else if (!isActive && isEmailView()) {
                checkAndInitialize();
            } else if (isActive && isEmailView()) {
                // Re-initialize to update button state when edit mode changes
                initEmailRenamer();
            }
        }, {
            delay: 2000, // Shorter delay to detect edit mode changes faster
            autoDisconnect: CONFIG.observerTimeout,
            target: document.querySelector('main') || document.body,
            observeOptions: { childList: true, subtree: false }
        });

        // Auto-disconnect observer after timeout
        setTimeout(() => {
            if (observer) {
                observer.disconnect();
                console.log('Email Renamer: Observer auto-disconnected to prevent rate limiting');
            }
        }, CONFIG.observerTimeout);

        // Add cleanup
        script.addCleanup(() => {
            cleanupEmailRenamer();
        });
    });

})();