// ==UserScript==
// @name         MerusCase Refactored Scripts Test
// @namespace    https://github.com/Jason-K
// @version      1.0.0
// @description  Test suite to verify refactored MerusCase scripts work correctly with MerusCore
// @author       Jason K.
// @match        *://*/*
// @grant        none
// @require      https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-core.js
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-refactored-test.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus-refactored-test.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Initialize test suite
    const testScript = MerusCore.createScript({
        name: 'RefactoredTest',
        version: '1.0.0'
    });

    testScript.init(() => {
        if (!MerusCore.utils.isMerusCase()) {
            console.log('🧪 Not on MerusCase, skipping refactored script tests');
            return;
        }

        console.log('🧪 Starting MerusCase Refactored Scripts Test Suite...');

        const testResults = {
            merusCore: { passed: 0, failed: 0, tests: [] },
            tabScript: { passed: 0, failed: 0, tests: [] },
            tagScript: { passed: 0, failed: 0, tests: [] },
            assigneeScript: { passed: 0, failed: 0, tests: [] }
        };

        function runTest(category, name, testFn) {
            try {
                const result = testFn();
                if (result) {
                    console.log(`✅ [${category}] ${name}`);
                    testResults[category].passed++;
                    testResults[category].tests.push({ name, status: 'PASS' });
                } else {
                    console.log(`❌ [${category}] ${name}`);
                    testResults[category].failed++;
                    testResults[category].tests.push({ name, status: 'FAIL' });
                }
            } catch (error) {
                console.error(`❌ [${category}] ${name} - Error: ${error.message}`);
                testResults[category].failed++;
                testResults[category].tests.push({ name, status: 'ERROR', error: error.message });
            }
        }

        // Test MerusCore functionality
        runTest('merusCore', 'Library Loaded', () => typeof window.MerusCore === 'object');
        runTest('merusCore', 'Version Check', () => window.MerusCore.version === '1.0.0');
        runTest('merusCore', 'UI System Available', () => typeof window.MerusCore.ui === 'object');
        runTest('merusCore', 'DOM Utilities Available', () => typeof window.MerusCore.dom === 'object');
        runTest('merusCore', 'Date Utilities Available', () => typeof window.MerusCore.date === 'object');
        runTest('merusCore', 'Text Utilities Available', () => typeof window.MerusCore.text === 'object');
        runTest('merusCore', 'Observer System Available', () => typeof window.MerusCore.observer === 'object');
        runTest('merusCore', 'Messaging System Available', () => typeof window.MerusCore.messaging === 'object');

        // Test UI Components
        runTest('merusCore', 'Button Creation', () => {
            const button = MerusCore.ui.createButton({ text: 'Test' });
            const result = button.element && button.element.classList.contains('merus-core-btn');
            button.remove();
            return result;
        });

        runTest('merusCore', 'Toast System', () => {
            const toast = MerusCore.ui.showToast('Test', 'info', 1000);
            const result = toast.element && toast.element.classList.contains('merus-toast');
            toast.remove();
            return result;
        });

        // Test Date Utilities
        runTest('merusCore', 'Date Format - MM/DD/YYYY', () => {
            const date = new Date('2025-01-15');
            return MerusCore.date.format(date, 'MM/DD/YYYY') === '01/15/2025';
        });

        runTest('merusCore', 'Date Format - YYYY.MM.DD', () => {
            const date = new Date('2025-01-15');
            return MerusCore.date.format(date, 'YYYY.MM.DD') === '2025.01.15';
        });

        runTest('merusCore', 'Date Parse - ISO', () => {
            const date = MerusCore.date.parse('2025-01-15');
            return date && date.getFullYear() === 2025 && date.getMonth() === 0 && date.getDate() === 15;
        });

        runTest('merusCore', 'Date Parse - US', () => {
            const date = MerusCore.date.parse('01/15/2025');
            return date && date.getFullYear() === 2025 && date.getMonth() === 0 && date.getDate() === 15;
        });

        // Test Text Utilities
        runTest('merusCore', 'Title Case - Basic', () => {
            return MerusCore.text.titleCase('hello world') === 'Hello World';
        });

        runTest('merusCore', 'Title Case - Acronyms', () => {
            return MerusCore.text.titleCase('john smith md qme') === 'John Smith MD QME';
        });

        runTest('merusCore', 'Text Normalization', () => {
            return MerusCore.text.normalizeWhitespace('  hello   world  ') === 'hello world';
        });

        runTest('merusCore', 'HTML Stripping', () => {
            return MerusCore.text.stripHTML('<p>Hello <b>World</b></p>') === 'Hello World';
        });

        runTest('merusCore', 'Text Truncation', () => {
            return MerusCore.text.truncate('This is a very long text', 10) === 'This is...';
        });

        // Test Messaging System
        runTest('merusCore', 'Messaging Emit/On', (done) => {
            let received = false;
            const unsubscribe = MerusCore.messaging.on('test-event', () => {
                received = true;
                unsubscribe();
            });
            MerusCore.messaging.emit('test-event', {});
            setTimeout(() => received, 100);
        });

        // Test Tab Script Integration
        runTest('tabScript', 'Tab Script Loaded', () => typeof window.merusSmartTab !== 'undefined');
        runTest('tabScript', 'Tab Script Instance', () => {
            if (window.merusSmartTab) {
                return typeof window.merusSmartTab === 'object';
            }
            return false;
        });

        // Test Tag Script Integration
        runTest('tagScript', 'Tag Script Loaded', () => typeof window.merusAutoTagger !== 'undefined');
        runTest('tagScript', 'Tag Script Functions', () => {
            if (window.merusAutoTagger) {
                return typeof window.merusAutoTagger.analyzeContent === 'function' &&
                       typeof window.merusAutoTagger.applyTags === 'function' &&
                       typeof window.merusAutoTagger.testTelephonePattern === 'function';
            }
            return false;
        });

        runTest('tagScript', 'Telephone Pattern Detection', () => {
            if (window.merusAutoTagger && window.merusAutoTagger.testTelephonePattern) {
                const result = window.merusAutoTagger.testTelephonePattern('Telephone call with John Doe');
                return result === 'John Doe';
            }
            return false;
        });

        // Test Default Assignee Script Integration
        runTest('assigneeScript', 'Assignee Script Loaded', () => typeof window.merusDefaultAssignee !== 'undefined');
        runTest('assigneeScript', 'Assignee Script Functions', () => {
            if (window.merusDefaultAssignee) {
                return typeof window.merusDefaultAssignee.setAssignee === 'function' &&
                       typeof window.merusDefaultAssignee.setDate === 'function' &&
                       typeof window.merusDefaultAssignee.applyDefaults === 'function';
            }
            return false;
        });

        runTest('assigneeScript', 'Assignee Config Available', () => {
            if (window.merusDefaultAssignee) {
                return window.merusDefaultAssignee.CONFIG &&
                       typeof window.merusDefaultAssignee.CONFIG.defaultAssignee === 'string';
            }
            return false;
        });

        // Test MerusCase Specific Elements
        runTest('merusCore', 'Case Name Extraction', () => {
            const caseName = MerusCore.dom.extractCaseName();
            return typeof caseName === 'string';
        });

        runTest('merusCore', 'Document Title Extraction', () => {
            const docTitle = MerusCore.dom.extractActiveDocument();
            return typeof docTitle === 'string';
        });

        runTest('merusCore', 'Note Editable Detection', () => {
            const noteEditable = MerusCore.dom.findNoteEditable();
            return noteEditable === null || noteEditable.classList.contains('note-editable');
        });

        // Test Cloudflare-safe Observer
        runTest('merusCore', 'Observer Creation', () => {
            let callbackTriggered = false;
            const observer = MerusCore.observer.createSafeObserver(() => {
                callbackTriggered = true;
            }, {
                delay: 100,
                maxRetries: 1,
                autoDisconnect: 200
            });
            return observer && typeof observer.disconnect === 'function';
        });

        runTest('merusCore', 'Observer State Management', () => {
            const initialState = MerusCore.observer.isRateLimited();
            const backoffLevel = MerusCore.observer.getBackoffLevel();
            return typeof initialState === 'boolean' && typeof backoffLevel === 'number';
        });

        // Wait for async tests and generate report
        setTimeout(() => {
            console.log('\n📊 TEST RESULTS:');
            console.log('==================');

            let totalPassed = 0;
            let totalFailed = 0;

            Object.entries(testResults).forEach(([category, results]) => {
                console.log(`\n🏷️  ${category.toUpperCase()}:`);
                console.log(`   ✅ Passed: ${results.passed}`);
                console.log(`   ❌ Failed: ${results.failed}`);

                totalPassed += results.passed;
                totalFailed += results.failed;

                if (results.failed > 0) {
                    console.log('   Failed tests:');
                    results.tests
                        .filter(t => t.status !== 'PASS')
                        .forEach(t => console.log(`     - ${t.name}: ${t.status}${t.error ? ' - ' + t.error : ''}`));
                }
            });

            console.log(`\n📈 OVERALL RESULTS:`);
            console.log(`   Total Tests: ${totalPassed + totalFailed}`);
            console.log(`   Passed: ${totalPassed} (${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%)`);
            console.log(`   Failed: ${totalFailed}`);

            // Create visual feedback button
            const testButton = MerusCore.ui.createButton({
                text: `🧪 Tests: ${totalPassed}/${totalPassed + totalFailed}`,
                position: 'top-left',
                style: totalFailed === 0 ? 'success' : 'warning',
                onClick: () => {
                    let details = `MerusCase Refactored Scripts Test Results\n\n`;
                    Object.entries(testResults).forEach(([category, results]) => {
                        details += `${category.toUpperCase()}: ${results.passed}/${results.passed + results.failed}\n`;
                    });
                    details += `\nOverall: ${totalPassed}/${totalPassed + totalFailed} passed\n`;
                    details += `Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`;
                    alert(details);
                }
            });

            document.body.appendChild(testButton.element);

            // Auto-remove test button after 15 seconds
            setTimeout(() => {
                testButton.remove();
            }, 15000);

            console.log('\n🎯 Integration tests completed successfully!');
            console.log('💡 Check the browser console for detailed results and any issues.');

        }, 2000);
    });

})();