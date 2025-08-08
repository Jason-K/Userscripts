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
├── merus_document-renamer.user.js       # MerusCase Smart Renamer
├── merus_downloadPDF.user.js            # MerusCase Quick PDF Download
├── merus_QoLscript.user.js              # MerusCase Super Suite (All-in-One)
├── merus_search-booleans.user.js        # MerusCase Enhanced Boolean Search
├── merus_tab-send4spaces.user.js        # MerusCase Smart Tab (4-space indent)
├── merus_tag-calls.user.js              # MerusCase Auto-Tagger
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

## 📦 Auto-updates

Each userscript includes auto-update headers:

```javascript
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
```

Violentmonkey will automatically check these URLs for updates.

## 📋 Scripts Overview

### 🏢 MerusCase Automation Suite

| Script | Description | Key Features |
|--------|-------------|-------------|
| **merus_QoLscript.user.js** | All-in-One Super Suite | Combines all MerusCase tools in one script |
| **merus_default-assignee.user.js** | Default Assignee & Due Date | Auto-sets Sommer Murray as assignee and today's date for new tasks |
| **merus_document-renamer.user.js** | Smart Document Renamer | Auto-renames files with date formatting, medical terminology handling, business name normalization |
| **merus_search-booleans.user.js** | Enhanced Boolean Search | Advanced search with AND, OR, NOT operators, exclusions with `-` prefix |
| **merus_tag-calls.user.js** | Auto Activity Tagger | Automatically applies tags based on note content, handles telephone calls |
| **merus_tab-send4spaces.user.js** | Smart Tab Handler | Converts tabs to 4-space indents in note editor, supports Shift+Tab unindent |
| **merus_downloadPDF.user.js** | Quick PDF Download | One-click download with smart filename generation and clipboard copy |

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

### MerusCase Smart Renamer Rules
- **Date Extraction**: Handles formats like `01-15-2025`, `1-15-25`
- **Medical Terminology**: Preserves acronyms (QME, AME, UR, EMG, NCS, MRI)
- **Business Names**: Auto-detects suffixes (LLC, Inc, PC) and applies title case
- **Document Types**: Categorizes as letter, medical, UR, notice, etc.
- **Provider Names**: Normalizes "Dr. John Smith, MD" → "Dr. Smith"

### Boolean Search Syntax
```
# Basic operators
telephone call          # AND (both terms required)
email OR fax            # OR (either term)
-confidential           # NOT (exclude term)
+"urgent message"       # Exact phrase (quotes)

# Complex queries
telephone -email        # Telephone but not email
(urgent OR priority) -spam   # Urgent or priority, but not spam
```

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
- **User Feedback**: Toast notifications, visual indicators, debug panels

## 📄 Development Notes

### Code Quality
- Modern ES6+ JavaScript with async/await
- Comprehensive error handling and logging
- Modular design with reusable components
- Performance-optimized with debouncing and caching

### Maintenance
- Auto-update mechanism for seamless updates
- Version tracking and changelog management
- Backward compatibility for existing installations
- Debug modes for troubleshooting

## ✅ License

MIT unless otherwise noted.

---

**Total Scripts**: 14 individual scripts + 1 bootstrap installer  
**Last Updated**: January 2025  
**Status**: All scripts actively maintained and tested
