# 🧠 Userscripts Repository

This repository contains custom Violentmonkey userscripts designed for browser automation, productivity enhancement, and data extraction across various websites.

## 🌍 Public Repository

This repository is public. Anyone can access its contents and contribute to its development.

## 📁 Structure

```plaintext
Userscripts/
├── bootstrap.user.js                    # Auto-installer for all userscripts
├── consensus_copy-citations.user.js     # Consensus.app citation extraction
├── merus_core.js                        # MerusCase shared library (v1.0.0)
├── merus_default-assignee.user.js       # MerusCase Default Assignee & Due Date
├── merus_document-renamer.user.js       # MerusCase Smart Renamer v1.0.0
├── merus_downloadPDF.user.js            # MerusCase Quick PDF Download v2.0.0
├── merus_email-renamer.user.js          # MerusCase Email Renamer v2.0.0
├── merus_search-booleans.user.js        # MerusCase Enhanced Boolean Search v3.0.0
├── merus_tab-send4spaces.user.js        # MerusCase Smart Tab v3.0
├── merus_tag-calls.user.js              # MerusCase Auto-Tagger v1.0
├── pdrater_copy-rating.user.js          # PDRater Rating Formatter
├── pubmed_copy-citations.user.js        # PubMed Central citation extraction
├── sullivan_copy-citations.user.js      # Sullivan on Comp citation extraction
├── uptodate_copy-citations.user.js      # UpToDate citation extraction
├── wikipedia_copy-citations.user.js     # Wikipedia citation extraction
├── scripts-index.json                   # Index of all scripts for bootstrap
├── .gitignore
└── README.md
```

## 🚀 Installation

### Option 1: Individual Scripts
1. Install [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/)
2. **Install MerusCore first (required for all MerusCase scripts)**:
   ```
   https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_core.js
   ```
3. Install individual scripts, e.g.:
   ```
   https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_document-renamer.user.js
   ```
4. Click "Install" when prompted

### Option 2: Bootstrap Installer (All Scripts)
1. Install the bootstrap loader:
   ```
   https://raw.githubusercontent.com/Jason-K/Userscripts/main/bootstrap.user.js
   ```
2. Visit any GitHub page and activate the bootstrap script
3. Confirm installation of all scripts when prompted

### Option 3: Individual MerusCase Scripts
For MerusCase users, install individual scripts based on your needs. See the Scripts Overview below for available options.

## 📦 Auto-updates

Each userscript includes auto-update headers:

```javascript
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
```

Violentmonkey will automatically check these URLs for updates.

## 📋 Scripts Overview

### 🏢 MerusCase Automation Suite

| Script | Version | Description | Key Features |
|--------|---------|-------------|-------------|
| **merus_default-assignee.user.js** | v1.0 | Default Assignee & Due Date | Auto-sets Sommer Murray as assignee and today's date for new tasks |
| **merus_document-renamer.user.js** | v1.0.0 | Smart Document Renamer | **Refactored:** Uses MerusCore for unified UI and enhanced date processing |
| **merus_downloadPDF.user.js** | v2.0.0 | Quick PDF Download | **Refactored:** Uses MerusCore for consistent UI and improved title processing |
| **merus_email-renamer.user.js** | v2.0.0 | Email Renamer | **Refactored:** Uses MerusCore for async operations and better error handling |
| **merus_search-booleans.user.js** | v3.0.0 | Enhanced Boolean Search | **Refactored:** Complete rewrite with MerusCore for better parsing and Cloudflare-safe observers |
| **merus_tag-calls.user.js** | v1.0 | Auto Activity Tagger | Automatically applies tags based on note content, handles telephone calls |
| **merus_tab-send4spaces.user.js** | v3.0 | Smart Tab Handler | Converts tabs to 4-space indents in note editor, supports Shift+Tab unindent |

#### MerusCase Features:
- **Default Assignee**: Automatically sets Sommer Murray as assignee and today's date for all new tasks
- **Smart Renaming**: Transforms filenames like `Letter from Dr Smith 01-15-2025` → `2025.01.15 - letter - Dr. Smith`
- **Email Renaming**: Generates standardized email names from sender, recipient, subject, and date information
- **Boolean Search**: Support for queries like `telephone -email OR fax` with real-time filtering and Cloudflare-safe observers
- **Auto-Tagging**: Detects patterns like "telephone call with John Doe" and auto-applies tags
- **Tab Management**: Intelligent indentation with toggle for spaces vs non-breaking spaces
- **PDF Processing**: Extracts case names, dates, and generates standardized filenames
- **Unified UI**: All refactored scripts use consistent buttons, toasts, and visual feedback through MerusCore

### 📚 Citation & Reference Tools

| Script | Domain | Description |
|--------|---------|-------------|
| **wikipedia_copy-citations.user.js** | Wikipedia | Extracts and formats references when copying text |
| **consensus_copy-citations.user.js** | Consensus.app | Sorts and deduplicates research paper citations |
| **pubmed_copy-citations.user.js** | PubMed Central | Handles reference formats like `[34-36]` with expansion |
| **sullivan_copy-citations.user.js** | Sullivan on Comp | Extracts footnote citations with full URLs |
| **uptodate_copy-citations.user.js** | UpToDate | Medical reference citation extraction |

#### Citation Features:
- **Smart Selection**: Floating copy button appears when text is selected
- **Format Preservation**: Maintains both plain text and HTML formatting
- **Auto-Sorting**: Citations sorted numerically (`[1], [2], [3]`)
- **Source Attribution**: Automatically appends page title and URL
- **Deduplication**: Removes duplicate references automatically

### ⚡ Utility Scripts

| Script | Domain | Description |
|--------|---------|-------------|
| **pdrater_copy-rating.user.js** | PDRater.com | Formats disability ratings with proper formatting |
| **bootstrap.user.js** | GitHub | Auto-installer for bulk script installation |

#### Utility Features:
- **Rating Formatter**: Converts PDRater output to standardized format
- **Bulk Installation**: One-click installation of all userscripts
- **Error Handling**: Comprehensive error reporting and user feedback

## 🔧 Advanced Features

### 🧩 MerusCore Integration (v1.0.0)
All major MerusCase scripts now use the **MerusCore shared library** for enhanced functionality:
- **🎨 Unified UI System**: Consistent buttons, toasts, and visual feedback across all scripts
- **⚡ Performance Optimized**: Shared utilities reduce code duplication by 60-70%
- **🛡️ Cloudflare-Safe Observers**: Specialized observers prevent rate limiting while maintaining functionality
- **📡 Cross-Script Messaging**: Scripts can communicate and coordinate actions
- **🔧 Debug Capabilities**: Comprehensive debugging tools and error reporting
- **📅 Date Processing**: Unified date parsing with support for multiple formats
- **📝 Text Utilities**: Smart text processing with medical/legal acronym preservation
- **🌐 DOM Helpers**: Common MerusCase selectors and DOM manipulation utilities

### Smart Document Renamer (v1.0.0)
- **📅 Enhanced Date Extraction**: Handles all date formats through MerusCore:
  - `YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD` (ISO formats)
  - `MM-DD-YYYY`, `M-D-YYYY` (US formats)
  - `MM-DD-YY`, `M-D-YY` (Short year formats)
  - `YYYYMMDD`, `MMDDYYYY`, `MMDDYY` (No separator formats)
- **🏥 Medical Terminology**: Preserves acronyms (QME, AME, UR, EMG, NCS, MRI, PTP, TTD, PPD, etc.)
- **🏢 Business Names**: Auto-detects suffixes (LLC, Inc, PC, Corp, LLP, etc.) and applies title case
- **👨‍⚕️ Provider Names**: Normalizes "Dr. John Smith, MD" → "Dr. Smith"
- **↶ Undo Functionality**: Quick undo with dedicated button using MerusCore UI system
- **👁️ Smart Visibility**: Button only appears when MerusCase rename button is visible

### Email Renamer (v2.0.0)
- **📧 Comprehensive Email Data**: Extracts sender, recipients, subject, and send date
- **🔄 Async Processing**: Uses MerusCore async utilities for reliable DOM interaction
- **📅 Smart Date Parsing**: Extracts message dates from multiple source fields
- **📝 Subject Processing**: Truncates long subjects and normalizes whitespace
- **👥 Recipient Handling**: Formats multiple recipients with "and" syntax
- **💾 Auto-Save Integration**: Seamlessly integrates with MerusCase save workflow

### Enhanced PDF Download (v2.0.0)
- **🎯 Improved Title Processing**: Enhanced medical acronym preservation through MerusCore
- **📊 Debug Panel**: Built-in debug tools for filename generation testing
- **🏷️ Smart Extraction**: Better case name and date extraction from document metadata
- **📎 Extension Handling**: Prevents duplicate .pdf extensions in filenames
- **📡 Event Messaging**: Cross-script communication for download tracking

### Enhanced Boolean Search (v3.0.0)
- **🔍 Complete Rewrite**: Full parser rewrite with MerusCore for better query handling
- **🛡️ Cloudflare-Safe**: Specialized observers prevent 429 rate limiting errors
- **📝 Enhanced Syntax**: Better support for complex boolean expressions
- **⚡ Performance**: Optimized query processing and DOM updates
- **🎯 Persistence**: Improved state preservation across page navigation
- **🔧 Debug Mode**: Comprehensive query parsing and filtering debugging

### Boolean Search Syntax (Enhanced v3.0.0)
```
# Basic operators
telephone call          # AND (both terms required)
email OR fax            # OR (either term)
-confidential           # NOT (exclude term) - Enhanced minus operator
+"urgent message"       # Exact phrase (quotes)

# Complex queries
telephone -email        # Telephone but not email
(urgent OR priority) -spam   # Urgent or priority, but not spam
qme OR ame -denial      # QME or AME evaluations, but not denials
```

### Auto-Tagger Intelligence (Complete Integration)
- **🤖 Pattern Recognition**: Detects "telephone call with [Contact Name]" patterns
- **📋 Comprehensive Tag Rules**: 100+ keyword-to-tag mappings covering:
  - Communication (email, letter, fax, telephone)
  - Legal proceedings (deposition, trial, mediation, arbitration)
  - Medical evaluations (QME, AME, DME, IMR)
  - Case management (settlement, liens, benefits, costs)
  - Administrative tasks (client forms, authorizations, calendar)
- **👤 Contact Extraction**: Automatically populates contact fields for telephone calls
- **🔄 Dynamic Monitoring**: Observes DOM changes for dynamically loaded forms

### Citation Format Examples
```
# Input text with references
"The study shows significant results [1,2,5-7] in treatment outcomes."

# Output includes
Selected text with [1,2,5,6,7] notation

Source:
"Article Title" (https://example.com/article)

References:
[1] Smith, J. et al. Treatment outcomes study. Journal 2023.
[2] Jones, A. Clinical analysis. Medical Review 2022.
[5] Brown, K. Methodology paper. Science Today 2023.
[6] Davis, L. Follow-up study. Research Quarterly 2023.
[7] Wilson, M. Meta-analysis. Clinical Studies 2024.
```

## 🧪 Testing & Validation

- **Cross-browser Compatibility**: Tested with Violentmonkey and Tampermonkey
- **Error Handling**: Comprehensive error messages and fallback behaviors
- **Performance Optimized**: Debounced search, efficient DOM manipulation
- **Cloudflare Compatible**: Special handling for MerusCase rate limiting to avoid 429 errors
- **User Feedback**: Toast notifications, visual indicators, debug panels
- **Integration Testing**: Individual MerusCase scripts tested for compatibility and performance

## 📄 Development Notes

### Code Quality
- Modern ES6+ JavaScript with async/await
- Comprehensive error handling and logging
- Modular design with reusable components
- Performance-optimized with debouncing and caching
- **Modular Design**: Individual scripts with independent functionality

### MerusCase Performance Constraints
**⚠️ Cloudflare Rate Limiting**: MerusCase uses aggressive Cloudflare protection that requires special attention:

- **MutationObserver Limits**: 5+ second throttles, scoped targeting, auto-disconnect
- **DOM Query Throttling**: Batched queries, cached results, exponential backoff
- **Event Debouncing**: 300-500ms minimum for all input handlers
- **Background Processing**: Use `setTimeout` with delays for non-critical tasks
- **Graceful Degradation**: Scripts continue functioning even when rate limited

All MerusCase scripts are designed to operate within these constraints while maintaining functionality.

### Recent Updates (November 2025)
- **🧩 MerusCore Library v1.0.0**: New shared library for all MerusCase scripts with unified UI and utilities
- **Document Renamer v1.0.0**: Refactored with MerusCore for enhanced performance and UI consistency
- **Email Renamer v2.0.0**: Refactored with async processing and better error handling via MerusCore
- **PDF Download v2.0.0**: Refactored with debug capabilities and improved title processing through MerusCore
- **Boolean Search v3.0.0**: Complete rewrite with MerusCore, Cloudflare-safe observers, and enhanced parsing
- **Auto-Tagger v1.0**: Full contact extraction and tag rule integration
- **Smart Tab v3.0**: Enhanced indentation handling
- **Default Assignee v1.0**: Form observation and SPA navigation support

### MerusCore Benefits
- **60-70% Code Reduction**: Shared utilities eliminate code duplication across scripts
- **Consistent User Experience**: Unified button styles, toast notifications, and visual feedback
- **Enhanced Debugging**: Cross-script messaging and comprehensive error reporting
- **Cloudflare Compatibility**: Specialized observers prevent rate limiting on MerusCase
- **Future-Proof Architecture**: Modular design allows easy addition of new features and scripts

### Maintenance
- Auto-update mechanism for seamless updates
- Version tracking and changelog management
- Backward compatibility for existing installations
- Debug modes for troubleshooting
- Individual script deployment for targeted functionality

## ✅ License

MIT unless otherwise noted.

---

**Total Scripts**: 14 individual scripts + 1 bootstrap installer
**Status**: All scripts actively maintained and tested.
**Recommendation**: Install MerusCore first, then individual MerusCase scripts based on your specific needs for optimal performance and functionality.

## 🎯 Quick Start Guide

1. **Install MerusCore** (required for all MerusCase scripts):
   ```
   https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_core.js
   ```

2. **Install Your Choice of MerusCase Scripts**:
   - 📧 Email Renamer: For email management and naming
   - 🔧 Document Renamer: For file naming standardization
   - 📄 PDF Downloader: For quick PDF downloads with smart naming
   - 🔍 Boolean Search: For advanced search filtering
   - 🏷️ Auto-Tagger: For automatic activity tagging

All refactored scripts now work together seamlessly through MerusCore's unified system!
