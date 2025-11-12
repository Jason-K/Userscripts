// ==UserScript==
// @name         MerusCore Test Suite
// @namespace    https://github.com/Jason-K
// @version      1.0.0
// @author       Jason K.
// @description  Test script for MerusCore library functionality
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core-test.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core-test.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Wait for MerusCore to load
    const initTest = () => {
        if (!window.MerusCore) {
            console.error('MerusCore not loaded');
            return;
        }

        console.log('🧪 Starting MerusCore Test Suite...');

        // Create test script instance
        const testScript = MerusCore.createScript({
            name: 'MerusCoreTest',
            version: '1.0.0'
        });

        testScript.init(() => {
            runTests();
        });
    };

    const runTests = () => {
        const results = {
            passed: 0,
            failed: 0,
            tests: []
        };

        // Helper to run individual test
        function test(name, testFn) {
            try {
                const result = testFn();
                if (result) {
                    console.log(`✅ ${name}`);
                    results.passed++;
                    results.tests.push({ name, status: 'PASS' });
                } else {
                    console.log(`❌ ${name}`);
                    results.failed++;
                    results.tests.push({ name, status: 'FAIL' });
                }
            } catch (error) {
                console.error(`❌ ${name} - Error: ${error.message}`);
                results.failed++;
                results.tests.push({ name, status: 'ERROR', error: error.message });
            }
        }

        // Test UI System
        test('UI Button Creation', () => {
            const button = MerusCore.ui.createButton({
                text: 'Test Button',
                icon: 'fa-check',
                position: 'top-right',
                style: 'primary',
                onClick: () => console.log('Button clicked')
            });

            const buttonElement = button.element;
            return buttonElement &&
                   buttonElement.classList.contains('merus-core-btn') &&
                   buttonElement.classList.contains('merus-pos-top-right') &&
                   buttonElement.classList.contains('merus-style-primary') &&
                   buttonElement.innerHTML.includes('Test Button') &&
                   buttonElement.innerHTML.includes('fa-check');
        });

        test('UI Toast System', () => {
            const toast = MerusCore.ui.showToast('Test message', 'success', 1000);
            const toastElement = toast.element;
            return toastElement &&
                   toastElement.classList.contains('merus-toast') &&
                   toastElement.classList.contains('merus-toast-success') &&
                   toastElement.textContent === 'Test message' &&
                   typeof toast.remove === 'function';
        });

        test('UI Undo Button', () => {
            const undoBtn = MerusCore.ui.createUndoButton(() => {}, 'Test Undo');
            const btnElement = undoBtn.element;
            return btnElement &&
                   btnElement.classList.contains('merus-undo-btn') &&
                   btnElement.textContent === 'Test Undo' &&
                   typeof undoBtn.remove === 'function';
        });

        // Test DOM Utilities
        test('DOM Safe Text', () => {
            const result1 = MerusCore.dom.safeText('h1', 'fallback');
            const result2 = MerusCore.dom.safeText('nonexistent-selector', 'fallback');
            return result1 !== undefined && result2 === 'fallback';
        });

        test('DOM Safe Value', () => {
            const result1 = MerusCore.dom.safeValue('input', 'fallback');
            const result2 = MerusCore.dom.safeValue('nonexistent-selector', 'fallback');
            return result1 !== undefined && result2 === 'fallback';
        });

        // Test Date Utilities
        test('Date Format - YYYY.MM.DD', () => {
            const date = new Date('2025-01-15');
            const result = MerusCore.date.format(date, 'YYYY.MM.DD');
            return result === '2025.01.15';
        });

        test('Date Format - MM/DD/YYYY', () => {
            const date = new Date('2025-01-15');
            const result = MerusCore.date.format(date, 'MM/DD/YYYY');
            return result === '01/15/2025';
        });

        test('Date Parse - ISO Format', () => {
            const date = MerusCore.date.parse('2025-01-15');
            return date && date.getFullYear() === 2025 && date.getMonth() === 0 && date.getDate() === 15;
        });

        test('Date Parse - US Format', () => {
            const date = MerusCore.date.parse('01/15/2025');
            return date && date.getFullYear() === 2025 && date.getMonth() === 0 && date.getDate() === 15;
        });

        test('Date Parse - Short Year', () => {
            const date = MerusCore.date.parse('01/15/25');
            return date && date.getFullYear() === 2025 && date.getMonth() === 0 && date.getDate() === 15;
        });

        test('Date Today Function', () => {
            const today = MerusCore.date.today('YYYY.MM.DD');
            const expected = MerusCore.date.format(new Date(), 'YYYY.MM.DD');
            return today === expected;
        });

        // Test Text Utilities
        test('Text Title Case - Basic', () => {
            const result = MerusCore.text.titleCase('hello world');
            return result === 'Hello World';
        });

        test('Text Title Case - Acronyms', () => {
            const result = MerusCore.text.titleCase('john smith md qme');
            return result === 'John Smith MD QME';
        });

        test('Text Normalize Whitespace', () => {
            const result = MerusCore.text.normalizeWhitespace('  hello   world  ');
            return result === 'hello world';
        });

        test('Text Strip HTML', () => {
            const result = MerusCore.text.stripHTML('<p>Hello <b>World</b></p>');
            return result === 'Hello World';
        });

        test('Text Truncate', () => {
            const result = MerusCore.text.truncate('This is a very long text', 10);
            return result === 'This is...';
        });

        // Test Observer System
        test('Observer Debounce', () => {
            let callCount = 0;
            const debouncedFn = MerusCore.observer.debounce(() => callCount++, 100);

            debouncedFn();
            debouncedFn();
            debouncedFn();

            // Should not have been called yet
            if (callCount !== 0) return false;

            // Wait for debounce
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(callCount === 1);
                }, 150);
            });
        });

        test('Observer Rate Limiting State', () => {
            const initialRateLimited = MerusCore.observer.isRateLimited();
            const initialBackoffLevel = MerusCore.observer.getBackoffLevel();

            return typeof initialRateLimited === 'boolean' &&
                   typeof initialBackoffLevel === 'number';
        });

        // Test Messaging System
        test('Messaging Emit/On', (done) => {
            let received = false;

            const unsubscribe = MerusCore.messaging.on('test-event', (event) => {
                received = true;
                unsubscribe();
            });

            MerusCore.messaging.emit('test-event', { test: 'data' });

            // Small delay for event propagation
            setTimeout(() => {
                return received;
            }, 50);
        });

        // Test Utility Functions
        test('Utils Merge Objects', () => {
            const obj1 = { a: 1, b: { c: 2 } };
            const obj2 = { b: { d: 3 }, e: 4 };
            const result = MerusCore.utils.merge(obj1, obj2);

            return result.a === 1 && result.b.c === 2 && result.b.d === 3 && result.e === 4;
        });

        test('Utils Generate ID', () => {
            const id1 = MerusCore.utils.generateId('test');
            const id2 = MerusCore.utils.generateId('test');

            return typeof id1 === 'string' &&
                   typeof id2 === 'string' &&
                   id1 !== id2 &&
                   id1.startsWith('test-');
        });

        test('Utils Sleep Function', async () => {
            const start = Date.now();
            await MerusCore.utils.sleep(100);
            const elapsed = Date.now() - start;

            return elapsed >= 90 && elapsed <= 200; // Allow some variance
        });

        // Wait for async tests to complete
        setTimeout(() => {
            // Report results
            console.log('\n📊 Test Results:');
            console.log(`✅ Passed: ${results.passed}`);
            console.log(`❌ Failed: ${results.failed}`);
            console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

            if (results.failed > 0) {
                console.log('\n❌ Failed Tests:');
                results.tests
                    .filter(t => t.status !== 'PASS')
                    .forEach(t => console.log(`  - ${t.name}: ${t.status}${t.error ? ' - ' + t.error : ''}`));
            }

            // Create visual feedback
            const testButton = MerusCore.ui.createButton({
                text: `Test Results: ${results.passed}/${results.passed + results.failed}`,
                position: 'top-left',
                style: results.failed === 0 ? 'success' : 'warning',
                onClick: () => {
                    alert(`MerusCore Test Complete\n\nPassed: ${results.passed}\nFailed: ${results.failed}\nSuccess Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
                }
            });

            document.body.appendChild(testButton.element);

            // Auto-remove test button after 10 seconds
            setTimeout(() => {
                testButton.remove();
            }, 10000);

        }, 1000);
    };

    // Initialize tests
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTest);
    } else {
        initTest();
    }

})();