# 🧠 Userscripts Repository

This repository contains custom Violentmonkey userscripts designed for browser automation, productivity enhancement, and data extraction across various websites.

## 🌍 Public Repository

This repository is public. Anyone can access its contents and contribute to its development.

## 📁 Structure

```plaintext
Userscripts/
├── bootstrap.user.js                    # Auto-installer for all userscripts
├── consensus_copy-citations.user.js     # Consensus.app citation extraction
├── merus_default-assignee.user.js       # MerusCase Default Assignee & Due Date
├── merus_document-renamer.user.js       # MerusCase Smart Renamer v0.3
├── merus_downloadPDF.user.js            # MerusCase Quick PDF Download v1.1
├── merus_search-booleans.user.js        # MerusCase Enhanced Boolean Search v2.4
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
2. Visit the raw URL for any script, e.g.:
   ```
   https://raw.githubusercontent.com/Jason-K/Userscripts/main/merus_document-renamer.user.js
   ```
3. Click "Install" when prompted

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
| **merus_document-renamer.user.js** | v0.3 | Smart Document Renamer | **New:** Multiple date formats, improved business name handling, better visibility logic |
| **merus_search-booleans.user.js** | v2.4 | Enhanced Boolean Search | **Updated:** Ultra-aggressive filtering, improved persistence, navigation handling |
| **merus_tag-calls.user.js** | v1.0 | Auto Activity Tagger | Automatically applies tags based on note content, handles telephone calls |
| **merus_tab-send4spaces.user.js** | v3.0 | Smart Tab Handler | Converts tabs to 4-space indents in note editor, supports Shift+Tab unindent |
| **merus_downloadPDF.user.js** | v1.1 | Quick PDF Download | **Enhanced:** Improved title processing, better filename generation |

#### MerusCase Features:
- **Default Assignee**: Automatically sets Sommer Murray as assignee and today's date for all new tasks
- **Smart Renaming**: Transforms filenames like `Letter from Dr Smith 01-15-2025` → `2025.01.15 - letter - Dr. Smith`
- **Boolean Search**: Support for queries like `telephone -email OR fax` with real-time filtering
- **Auto-Tagging**: Detects patterns like "telephone call with John Doe" and auto-applies tags
- **Tab Management**: Intelligent indentation with toggle for spaces vs non-breaking spaces
- **PDF Processing**: Extracts case names, dates, and generates standardized filenames

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

### MerusCase Smart Renamer Rules (Enhanced v0.3)
- **📅 Date Extraction**: Now handles multiple formats:
  - `YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY.MM.DD` (ISO formats)
  - `MM-DD-YYYY`, `M-D-YYYY` (US formats)  
  - `MM-DD-YY`, `M-D-YY` (Short year formats)
  - `YYYYMMDD`, `MMDDYYYY`, `MMDDYY` (No separator formats)
- **🏥 Medical Terminology**: Preserves acronyms (QME, AME, UR, EMG, NCS, MRI, PTP, TTD, PPD, etc.)
- **🏢 Business Names**: Auto-detects suffixes (LLC, Inc, PC, Corp, LLP, etc.) and applies title case
- **📄 Document Types**: Categorizes as letter, medical, UR, notice, med-legal, etc.
- **👨‍⚕️ Provider Names**: Normalizes "Dr. John Smith, MD" → "Dr. Smith"
- **👁️ Smart Visibility**: Button only appears when MerusCase rename button is visible

### Enhanced PDF Download Features (v1.1)
- **🎯 Improved Title Processing**: New `processTitle()` function handles:
  - Specific doctor name replacements ("William R. Campbell, D.O., QME" → "Dr. Campbell QME")
  - Medical acronym preservation and case normalization
  - Generic report term handling
  - Better punctuation and spacing cleanup
- **📎 Extension Handling**: Prevents duplicate .pdf extensions in filenames
- **🏷️ Smart Extraction**: Better case name and date extraction from document metadata

### Boolean Search Syntax (Enhanced v2.4)
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

### Recent Updates (January 2025)
- **Document Renamer v0.3**: Multiple date format support, enhanced business handling
- **PDF Download v1.1**: Improved title processing and extension handling
- **Boolean Search v2.4**: Ultra-aggressive filtering and better persistence
- **Auto-Tagger v1.0**: Full contact extraction and tag rule integration
- **Smart Tab v3.0**: Enhanced indentation handling
- **Default Assignee v1.0**: Form observation and SPA navigation support

### Maintenance
- Auto-update mechanism for seamless updates
- Version tracking and changelog management
- Backward compatibility for existing installations
- Debug modes for troubleshooting
- Individual script deployment for targeted functionality

## ✅ License

MIT unless otherwise noted.

---

**Total Scripts**: 13 individual scripts + 1 bootstrap installer
**Status**: All scripts actively maintained and tested.
**Recommendation**: Install individual MerusCase scripts based on your specific needs for optimal performance and functionality.
