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
            const saveButton = document.querySelector('button.btn.btn-sm.btn-primary.save-button[data-action="editpersonal"]') ||
                             document.querySelector('button.save-button[data-action="editpersonal"]') ||
                             Array.from(document.querySelectorAll('button')).find(btn =>
                                 btn.textContent.includes('Save') && btn.hasAttribute('data-action', 'editpersonal')
                             );

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

        function extractSenderName(sender) {
            if (!sender) return '';

            // Use MerusCore text utilities for cleaning
            let cleanSender = MerusCore.text.stripHTML(sender).trim();

            // Check if sender is just an email address (no name found)
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(cleanSender)) {
                return cleanSender; // Return email address as is
            }

            // Extract name from common formats like "John Doe <john@example.com>"
            const nameMatch = cleanSender.match(/^([^<]+)</);
            if (nameMatch) {
                return MerusCore.text.normalizeWhitespace(nameMatch[1].trim());
            }

            return cleanSender;
        }

        function determineEmailRelationship(subject) {
            if (!subject) return 'to';

            // Use MerusCore text utilities for subject cleaning
            const cleanSubject = MerusCore.text.normalizeWhitespace(subject);
            const subjectLower = cleanSubject.toLowerCase();

            // Check for reply patterns
            if (subjectLower.startsWith('re:') || subjectLower.startsWith('re ')) {
                return 'replying to';
            }

            // Check for forward patterns
            if (subjectLower.startsWith('fw:') || subjectLower.startsWith('fwd:') ||
                subjectLower.startsWith('fw ') || subjectLower.startsWith('fwd ')) {
                return 'forwarded to';
            }

            // Default to "to" for first message in chain
            return 'to';
        }

        function generateEmailName(emailInfo) {
            if (!emailInfo) return '';

            // Parse message date and format as MM-DD-YY @ HH:MM:SS
            let messageDate = emailInfo.messageDate;
            if (typeof messageDate === 'string') {
                messageDate = MerusCore.date.parse(messageDate) || new Date();
            }

            const formattedDate = MerusCore.date.format(messageDate, 'MM-DD-YY');
            const formattedTime = MerusCore.date.format(messageDate, 'HH:mm:ss');

            // Extract sender name
            const senderName = extractSenderName(emailInfo.sender);

            // Determine email relationship based on subject
            const relationship = determineEmailRelationship(emailInfo.subject);

            // Parse recipients
            const { first, others } = parseRecipients(emailInfo.recipients);

            // Build recipients string
            let recipientsString = '';
            if (first) {
                recipientsString = first;
                if (others.length > 0) {
                    recipientsString += ` (and ${others.join(', ')})`;
                }
            }

            // Build the formatted name using the new convention
            let emailName = `${formattedDate} @ ${formattedTime} - email from ${senderName} (${relationship}`;

            if (recipientsString) {
                emailName += ` ${recipientsString}`;
            }

            emailName += ')';

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

            const saveButton = document.querySelector('button.btn.btn-sm.btn-primary.save-button[data-action="editpersonal"]') ||
                             document.querySelector('button.save-button[data-action="editpersonal"]') ||
                             Array.from(document.querySelectorAll('button')).find(btn =>
                                 btn.textContent.includes('Save') && btn.hasAttribute('data-action', 'editpersonal')
                             );
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

                // Clear existing content and set new name more reliably
                updatedEditableArea.innerHTML = '';
                updatedEditableArea.textContent = newName;

                // Trigger comprehensive events to ensure the change is registered
                MerusCore.dom.triggerEvents(updatedEditableArea, [
                    'input', 'change', 'keyup', 'blur', 'focus', 'select'
                ]);

                // Longer delay to ensure the content is fully registered
                await MerusCore.utils.sleep(800);

                // Step 4: Enhanced save process with retry logic
                let saveSuccess = false;
                let saveAttempts = 0;
                const maxSaveAttempts = 4;

                while (!saveSuccess && saveAttempts < maxSaveAttempts) {
                    saveAttempts++;

                    // Find save button again for each attempt
                    const updatedSaveButton = document.querySelector('button.btn.btn-sm.btn-primary.save-button[data-action="editpersonal"]') ||
                                           document.querySelector('button.save-button[data-action="editpersonal"]') ||
                                           Array.from(document.querySelectorAll('button')).find(btn =>
                                               btn.textContent.includes('Save') && btn.hasAttribute('data-action', 'editpersonal')
                                           );

                    if (!updatedSaveButton) {
                        MerusCore.ui.showToast('Save button not found. Please save manually.', 'warning', 5000);
                        break;
                    }

                    // Check if save button is disabled
                    if (updatedSaveButton.disabled) {
                        console.log('Email Renamer: Save button is disabled, waiting...');
                        await MerusCore.utils.sleep(500);
                        continue;
                    }

                    console.log(`Email Renamer: Save attempt ${saveAttempts}/${maxSaveAttempts}`);

                    // Re-trigger events before save to ensure content is registered
                    MerusCore.dom.triggerEvents(updatedEditableArea, ['input', 'change']);

                    // Click save button
                    updatedSaveButton.click();

                    // Wait longer for save to complete
                    await MerusCore.utils.sleep(1500);

                    // Check if save was successful by looking for the content to stick
                    await MerusCore.utils.sleep(1000);

                    // Verify the content was saved by checking if the editable area still contains our text
                    const currentContent = MerusCore.text.stripHTML(updatedEditableArea.innerHTML).trim();
                    if (currentContent.includes(newName.substring(0, 20))) { // Check first 20 chars
                        saveSuccess = true;
                        console.log('Email Renamer: Save successful on attempt', saveAttempts);
                    } else {
                        console.log('Email Renamer: Save attempt failed, content did not stick');
                        console.log('Expected content:', newName.substring(0, 50));
                        console.log('Actual content:', currentContent.substring(0, 50));

                        // Re-apply content and try again
                        updatedEditableArea.focus();
                        updatedEditableArea.innerHTML = '';
                        updatedEditableArea.textContent = newName;
                        MerusCore.dom.triggerEvents(updatedEditableArea, ['input', 'change']);
                        await MerusCore.utils.sleep(500);
                    }
                }

                if (saveSuccess) {
                    MerusCore.ui.showToast(`Email renamed successfully! (Attempt ${saveAttempts})`, 'success', 3000);

                    // Send message to other scripts about the rename
                    MerusCore.messaging.emit('email-renamed', {
                        oldName: emailInfo.subject || 'No Subject',
                        newName: newName,
                        sender: emailInfo.sender,
                        recipients: emailInfo.recipients,
                        caseName: emailInfo.caseName,
                        saveAttempts: saveAttempts,
                        timestamp: Date.now()
                    });
                } else {
                    MerusCore.ui.showToast(`Failed to save after ${maxSaveAttempts} attempts. Please save manually.`, 'error', 5000);
                    console.error('Email Renamer: Save failed after all attempts');
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