# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a userscript repository containing custom Violentmonkey/Tampermonkey scripts for browser automation and productivity enhancement. The repository focuses on two main categories:

1. **MerusCase Automation Suite** - Comprehensive tools for legal case management
2. **Citation & Reference Tools** - Academic and research citation extractors

## Repository Structure

- **Individual Scripts**: 13 specialized `.user.js` files for different platforms/features
- **Bootstrap Installer**: `bootstrap.user.js` for bulk installation
- **Scripts Index**: `scripts-index.json` lists all distributable scripts
- **Documentation**: Comprehensive `README.md` with installation guides

### Key Script Categories

#### MerusCase Suite
- **Individual MerusCase Scripts** - Seven standalone modules for different case management tasks
  - `merus_document-renamer.user.js` (v0.3) - Smart filename standardization
  - `merus_downloadPDF.user.js` (v1.1) - Quick PDF download with title processing
  - `merus_email-renamer.user.js` (v1.0) - Email renaming with sender, recipient, and subject data
  - `merus_search-booleans.user.js` (v2.4) - Enhanced boolean search with filtering
  - `merus_tag-calls.user.js` (v1.0) - Auto-activity tagging with contact extraction
  - `merus_tab-send4spaces.user.js` (v3.0) - Tab-to-space conversion in note editor
  - `merus_default-assignee.user.js` (v1.0) - Auto-assign tasks to Sommer Murray

#### Citation Tools
- **wikipedia_copy-citations.user.js** - Wikipedia reference extraction
- **consensus_copy-citations.user.js** - Research paper citation sorting
- **pubmed_copy-citations.user.js** - PubMed Central citation handling
- **sullivan_copy-citations.user.js** - Sullivan on Comp footnote extraction
- **uptodate_copy-citations.user.js** - UpToDate medical citation extraction

#### Utilities
- **pdrater_copy-rating.user.js** - PDRater disability rating formatting
- **bootstrap.user.js** - Bulk script installer

## Common Development Tasks

### Adding New Userscripts
1. Create `.user.js` file with proper headers:
   ```javascript
   // ==UserScript==
   // @name         Script Name
   // @namespace    https://github.com/Jason-K
   // @version      1.0
   // @author       Jason K.
   // @description  Description
   // @match        https://example.com/*
   // @grant        none
   // @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
   // @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
   // ==/UserScript==
   ```

2. Add script filename to `scripts-index.json`
3. Update `README.md` if it's a major feature

### MerusCase Development Guidelines
- **Modular Design**: Each script is self-contained and independent
  - Individual initialization/cleanup functions
  - No inter-script dependencies or conflicts
  - Proper SPA navigation handling within each script
  - Standalone functionality for targeted use cases

- **DOM Manipulation**:
  - Use debouncing for performance (`debounce()` helper)
  - Check for MerusCase-specific selectors before activation
  - Implement proper cleanup on script unload
  - Use event delegation for dynamic content

- **Data Processing**:
  - Title case conversion with medical acronym preservation
  - Multiple date format support (ISO, US, short year, no separators)
  - Business name detection with suffix handling (LLC, Inc, PC, etc.)

### Citation Script Development
- **Floating Button Pattern**: Create floating UI that appears on text selection
- **Format Preservation**: Maintain both plain text and HTML formatting
- **Reference Sorting**: Sort citations numerically and remove duplicates
- **Source Attribution**: Append page title and URL to copied content

## Testing Strategy

### Local Testing
- Install Violentmonkey/Tampermonkey in development browser
- Load scripts directly from local files for testing
- Use browser developer tools for debugging
- Test cross-browser compatibility

### Script Validation
- Verify GM headers are properly formatted
- Check auto-update URLs point to correct GitHub raw URLs
- Test installation via bootstrap installer
- Validate scripts-index.json includes new scripts

### Integration Testing (MerusCase)
- Test script initialization independently
- Verify no conflicts between different scripts
- Test SPA navigation handling within each script
- Verify cleanup on script unload
- Test combinations of scripts together

## Auto-Update Mechanism

All scripts include automatic update headers:
```javascript
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
```

Violentmonkey/Tampermonkey automatically check these URLs for updates based on their configured update intervals.

## Deployment Process

### Individual Script Updates
1. Commit changes to main branch
2. Scripts update automatically via userscript managers
3. Update version numbers in script headers

### Bootstrap Installer
- Reads `scripts-index.json` for current script list
- Opens each script in new tab for bulk installation
- Scripts can be added/removed by updating the index file

### Individual Script Updates
- Each script can be versioned independently
- Test script-specific functionality
- Update documentation with new features
- Maintain backward compatibility when possible

## Code Architecture Patterns

### MerusCase Script Pattern
```javascript
// ==UserScript==
// @name         MerusCase Script Name
// @match        https://meruscase.com/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  function init() {
    // Check if MerusCase environment
    if (!isMerusCase()) return;

    // Script-specific initialization
    // Set up observers, event listeners, UI elements
  }

  function cleanup() {
    // Remove observers, event listeners, UI elements
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
})();
```

### Citation Script Pattern
```javascript
function createCopyButton() {
  // Create floating UI button
  // Position near selected text
  // Add click handlers for citation processing
}

function processCitations(selectedText) {
  // Extract citations from text
  // Sort and deduplicate
  // Format with proper attribution
}
```

## Performance Considerations

- **Debouncing**: Use for search/filter operations to prevent excessive DOM manipulation
- **Event Delegation**: Handle dynamic content efficiently with delegated event listeners
- **Cleanup**: Properly remove observers and listeners to prevent memory leaks
- **MutationObserver Throttling**: Use 5-second throttles to avoid rate limiting
- **SPA Navigation**: Detect and handle single-page app navigation properly

## Cloudflare Rate Limiting (MerusCase)

**Critical Constraint**: MerusCase uses Cloudflare protection which aggressively rate limits browser activity to prevent automated access. This requires special handling in userscripts:

### Rate Limiting Prevention
- **MutationObserver Limitations**:
  - Use minimum frequency (5+ second throttles)
  - Limit observers to specific DOM regions rather than entire document
  - Implement auto-disconnect after a few checks
  - Avoid nested or cascading mutation observers
- **DOM Query Throttling**:
  - Batch DOM queries and cache results
  - Use `requestAnimationFrame` for non-critical updates
  - Implement exponential backoff for repeated queries
- **Event Handler Debouncing**:
  - Debounce all input event handlers (300-500ms minimum)
  - Use passive event listeners where possible
  - Avoid rapid successive DOM modifications

### Detection and Recovery
- **429 Error Handling**: Watch for Cloudflare 429 responses and implement backoff
- **Graceful Degradation**: Scripts should continue functioning even if some features are rate limited
- **User Feedback**: Provide clear indicators when rate limiting affects functionality

### Best Practices
- **Observer Scoping**: Target specific elements (`#case-notes`, `.document-list`) rather than `document.body`
- **Minimum Updates**: Only trigger updates when absolutely necessary
- **Background Processing**: Use `setTimeout` with delays for non-critical background tasks
- **Connection Pooling**: Reuse existing connections and avoid parallel requests

### Example Pattern
```javascript
// Safe mutation observer for MerusCase
const observer = new MutationObserver(debounce((mutations) => {
  // Process mutations conservatively
  if (isRateLimited()) return;

  // Minimal DOM queries only
  processChanges();
}, 5000)); // 5-second minimum throttle

// Auto-disconnect after reasonable time
setTimeout(() => observer.disconnect(), 30000);
```

## Security Notes

- All scripts use `@grant none` - no special permissions required
- Scripts operate only on their intended domains via `@match` directives
- No external API calls except for fetching script content from GitHub
- User data processing is limited to local browser operations

## Recent Development Focus

The repository focuses on maintaining individual MerusCase scripts as standalone modules for targeted functionality. Future development should focus on:

1. Individual script enhancements and bug fixes
2. Additional citation platform support
3. Performance optimizations for each script
4. Cross-browser compatibility improvements
5. Improved inter-script compatibility when multiple scripts are installed together