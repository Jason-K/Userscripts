// ==UserScript==
// @name         MerusCase Default Assignee
// @namespace    https://github.com/Jason-K/Userscripts
// @version      1.0.0
// @description  Automatically sets Sommer Murray as default assignee and today's date for new tasks in MerusCase
// @author       Jason Knox
// @match        https://*.meruscase.com/tasks/add*
// @match        https://*.meruscase.com/cms*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_default-assignee.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_default-assignee.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        defaultAssignee: 'Sommer Murray (SEM)', // The name to search for in the assignee dropdown
        setDueDate: true, // Whether to automatically set today's date
        showNotifications: true, // Show success/error notifications
        debugMode: false // Enable console logging
    };

    // Helper function to log debug messages
    function debugLog(...args) {
        if (CONFIG.debugMode) {
            console.log('[MerusCase Default Assignee]', ...args);
        }
    }

    // Helper function to format date as MM/DD/YYYY
    function getFormattedDate(date = new Date()) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    // Helper function to show notification
    function showNotification(message, type = 'success') {
        if (!CONFIG.showNotifications) return;

        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Function to set the default assignee
    function setDefaultAssignee() {
        debugLog('Looking for assignee select field...');

        // Find the assignee select field
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

            // Trigger change event to ensure any dependent JavaScript runs
            const changeEvent = new Event('change', { bubbles: true });
            assigneeSelect.dispatchEvent(changeEvent);

            debugLog(`Set assignee to: ${targetOption.textContent} (ID: ${targetOption.value})`);
            return true;
        } else {
            debugLog(`Could not find option for: ${CONFIG.defaultAssignee}`);
            showNotification(`Assignee "${CONFIG.defaultAssignee}" not found in dropdown`, 'error');
            return false;
        }
    }

    // Function to set today's date
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

        // Set today's date
        const todayFormatted = getFormattedDate();
        dueDateInput.value = todayFormatted;

        // Trigger change and input events
        const changeEvent = new Event('change', { bubbles: true });
        const inputEvent = new Event('input', { bubbles: true });
        dueDateInput.dispatchEvent(inputEvent);
        dueDateInput.dispatchEvent(changeEvent);

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
            showNotification(message);
            debugLog(message);
        }
    }

    // Function to observe DOM changes and apply defaults when form appears
    let observerThrottle = null;
    function observeFormCreation() {
        debugLog('Starting form observation...');

        // Create observer to watch for form creation with throttling
        const observer = new MutationObserver((mutations) => {
            // Throttle to prevent excessive firing (max once per 500ms)
            if (observerThrottle) return;
            observerThrottle = setTimeout(() => { observerThrottle = null; }, 500);

            // Check if task form elements now exist
            const assigneeSelect = document.querySelector('select[name="data[Task][user_id]"]');
            const dueDateInput = document.querySelector('input[name="data[Task][date_due]"]');

            if (assigneeSelect || dueDateInput) {
                debugLog('Task form detected, applying defaults...');

                // Small delay to ensure form is fully rendered
                setTimeout(() => {
                    applyDefaults();
                }, 100);

                // Stop observing once form is found
                observer.disconnect();
                observerThrottle = null;
            }
        });

        // Start observing with reduced scope - only childList, not attributes
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also try immediately in case form is already present
        setTimeout(() => {
            const assigneeSelect = document.querySelector('select[name="data[Task][user_id]"]');
            if (assigneeSelect) {
                applyDefaults();
                observer.disconnect();
            }
        }, 500);

        // Stop observing after 5 seconds to prevent memory leaks and rate limiting
        setTimeout(() => {
            observer.disconnect();
            observerThrottle = null;
            debugLog('Stopped observing after timeout');
        }, 5000);
    }

    // Initialize based on page context
    function initialize() {
        debugLog('Initializing MerusCase Default Assignee script...');

        // Check if we're on a task add page
        if (window.location.href.includes('/tasks/add')) {
            debugLog('On task add page, waiting for form...');

            // Wait for page to load
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', observeFormCreation);
            } else {
                observeFormCreation();
            }
        }

        // Also listen for clicks on "New Task" or "New Case Task" links
        document.addEventListener('click', (event) => {
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
        }, true);

        // Listen for any dynamic form loading (for SPA behavior)
        if (window.location.href.includes('cms#')) {
            debugLog('On CMS page, watching for dynamic form loading...');
            observeFormCreation();
        }
    }

    // Start the script
    initialize();

})();
