// ==UserScript==
// @name         MerusCase Default Assignee
// @namespace    https://github.com/Jason-K/Userscripts
// @version      2.0.0
// @description  Automatically sets Sommer Murray as default assignee and today's date for new tasks in MerusCase
// @author       Jason Knox
// @match        https://*.meruscase.com/tasks/add*
// @match        https://*.meruscase.com/cms*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_default-assignee.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_default-assignee.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Initialize script using MerusCore
    const script = MerusCore.createScript({
        name: 'DefaultAssignee',
        version: '2.0.0'
    });

    // Configuration
    const CONFIG = {
        defaultAssignee: 'Sommer Murray (SEM)',
        setDueDate: true,
        showNotifications: false,
        debugMode: false
    };

    function debugLog(...args) {
        if (CONFIG.debugMode) {
            console.log('[MerusCase Default Assignee]', ...args);
        }
    }

    // Initialize script with MerusCore
    script.init(() => {
        if (!MerusCore.utils.isMerusCase()) return;

        debugLog('Initializing MerusCase Default Assignee script...');

        // Function to set the default assignee using MerusCore utilities
        function setDefaultAssignee() {
            debugLog('Looking for assignee select field...');

            // Use MerusCore DOM selector
            const assigneeSelect = document.querySelector('select[name="data[Task][user_id]"]');

            if (!assigneeSelect) {
                debugLog('Assignee select field not found');
                return false;
            }

            debugLog('Assignee select field found, looking for Sommer Murray option...');

            // Find the option containing the configured name
            let targetOption = null;
            for (let option of assigneeSelect.options) {
                if (option.textContent.includes(CONFIG.defaultAssignee)) {
                    targetOption = option;
                    break;
                }
            }

            if (targetOption) {
                // Check if already selected
                if (assigneeSelect.value === targetOption.value) {
                    debugLog('Sommer Murray already selected');
                    return false;
                }

                // Set the value
                assigneeSelect.value = targetOption.value;

                // Trigger change event using MerusCore utilities
                MerusCore.dom.triggerEvents(assigneeSelect, ['change']);

                debugLog(`Set assignee to: ${targetOption.textContent} (ID: ${targetOption.value})`);
                return true;
            } else {
                debugLog(`Could not find option for: ${CONFIG.defaultAssignee}`);
                if (CONFIG.showNotifications) {
                    MerusCore.ui.showToast(
                        `Assignee "${CONFIG.defaultAssignee}" not found in dropdown`,
                        'error',
                        3000
                    );
                }
                return false;
            }
        }

        // Function to set today's date using MerusCore utilities
        function setTodayDate() {
            if (!CONFIG.setDueDate) return false;

            debugLog('Looking for due date field...');

            // Find the due date input field
            const dueDateInput = document.querySelector('input[name="data[Task][date_due]"]');

            if (!dueDateInput) {
                debugLog('Due date field not found');
                return false;
            }

            // Check if date is already set
            if (dueDateInput.value && dueDateInput.value.trim() !== '') {
                debugLog('Due date already has a value');
                return false;
            }

            // Use MerusCore date formatting
            const todayFormatted = MerusCore.date.format(new Date(), 'MM/DD/YYYY');
            dueDateInput.value = todayFormatted;

            // Trigger events using MerusCore utilities
            MerusCore.dom.triggerEvents(dueDateInput, ['input', 'change']);

            debugLog(`Set due date to: ${todayFormatted}`);
            return true;
        }

        // Main function to apply defaults
        function applyDefaults() {
            debugLog('Applying defaults...');

            let changes = [];

            // Set assignee
            if (setDefaultAssignee()) {
                changes.push('assignee');
            }

            // Set date
            if (setTodayDate()) {
                changes.push('due date');
            }

            // Show notification if changes were made
            if (changes.length > 0) {
                const message = `Set default ${changes.join(' and ')}`;
                if (CONFIG.showNotifications) {
                    MerusCore.ui.showToast(message, 'success', 3000);
                }
                debugLog(message);

                // Send notification to other scripts
                MerusCore.messaging.emit('defaults-applied', {
                    changes: changes,
                    assignee: CONFIG.defaultAssignee,
                    date: MerusCore.date.today('MM/DD/YYYY')
                });
            }
        }

        // Function to check for form using MerusCore Cloudflare-safe observer
        function observeFormCreation() {
            debugLog('Starting form observation with retry logic...');

            // Use MerusCore safe observer instead of manual retry logic
            const observer = MerusCore.observer.createSafeObserver(() => {
                // Check if task form elements now exist
                const assigneeSelect = document.querySelector('select[name="data[Task][user_id]"]');
                const dueDateInput = document.querySelector('input[name="data[Task][date_due]"]');

                if (assigneeSelect || dueDateInput) {
                    debugLog('Task form detected, applying defaults...');
                    // Small delay to ensure form is fully rendered
                    setTimeout(applyDefaults, 100);

                    // Disconnect observer once we've applied defaults
                    observer.disconnect();
                }
            }, {
                delay: 2000,
                maxRetries: 5,
                autoDisconnect: 30000
            });
        }

        // Check if we're on a task add page
        if (window.location.href.includes('/tasks/add')) {
            debugLog('On task add page, waiting for form...');
            observeFormCreation();
        }

        // Listen for clicks on "New Task" or "New Case Task" links
        const clickHandler = (event) => {
            const target = event.target.closest('a');
            if (!target) return;

            const href = target.href || '';
            const text = target.textContent || '';

            // Check if this is a new task link
            if (href.includes('/tasks/add') ||
                text.includes('New Task') ||
                text.includes('New Case Task')) {

                debugLog('New task link clicked, preparing to set defaults...');
                // Start observing for form creation
                setTimeout(observeFormCreation, 100);
            }
        };

        document.addEventListener('click', clickHandler, true);
        script.addCleanup(() => {
            document.removeEventListener('click', clickHandler, true);
        });

        // Listen for any dynamic form loading (for SPA behavior)
        if (window.location.href.includes('cms#')) {
            debugLog('On CMS page, watching for dynamic form loading...');
            observeFormCreation();
        }

        // Expose functions for debugging using MerusCore messaging
        MerusCore.messaging.on('debug-default-assignee', (event) => {
            const { action } = event.data;
            switch (action) {
                case 'apply':
                    applyDefaults();
                    break;
                case 'check-form':
                    const assigneeSelect = document.querySelector('select[name="data[Task][user_id]"]');
                    const dueDateInput = document.querySelector('input[name="data[Task][date_due]"]');
                    console.log('Form elements found:', { assigneeSelect: !!assigneeSelect, dueDateInput: !!dueDateInput });
                    break;
                case 'set-assignee':
                    setDefaultAssignee();
                    break;
                case 'set-date':
                    setTodayDate();
                    break;
            }
        });

        // Expose functions for debugging via global object
        window.merusDefaultAssignee = {
            setAssignee: setDefaultAssignee,
            setDate: setTodayDate,
            applyDefaults: applyDefaults,
            CONFIG: CONFIG
        };
    });

})();
