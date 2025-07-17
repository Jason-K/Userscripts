# 🧠 Userscripts Repository

This repository contains custom Violentmonkey userscripts designed for:

- Copying Wikipedia text with automatically appended citations
- Extracting, normalizing, and appending Consensus.app citations with sorted references
- Appending footnote citations when copying from Sullivan on Comp
- Other browser automations or enhancements using JavaScript and DOM APIs

## 🌍 Public Repository

This repository is public. Anyone can access its contents and contribute to its development.

## 📁 Structure

```plaintext
Userscripts/
├── consensus-copy-citations.user.js
├── wikipedia-copy-citations.user.js
├── sullivan_copy-citations.user.js
├── merus_tab-send4spaces.user.js
├── pdrater_copy-rating.user.js
├── pubmed_copy-citations.user.js
├── .github/
│   └── workflows/
│       └── validate-scripts.yml
├── .gitignore
└── README.md
```

## 🚀 Installation

To install any userscript:

1. Install [Violentmonkey](https://violentmonkey.github.io/get-it/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Visit the raw URL for a script, e.g.:

   ```plaintext
   https://raw.githubusercontent.com/Jason-K/Userscripts/main/consensus-copy-citations.user.js
   ```

3. Click "Install" when prompted.

## 📦 Auto-updates

Each userscript includes the following headers:

```javascript
// @downloadURL  https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
// @updateURL    https://raw.githubusercontent.com/Jason-K/Userscripts/main/script-name.user.js
```

Violentmonkey will automatically check these URLs for updates.

## 🧪 Testing

This repo includes a GitHub Actions workflow to ensure that each `.user.js` file:

- Contains required metadata fields
- Has valid JavaScript syntax (via `eslint`)

### ✅ `.github/workflows/validate-scripts.yml`

```yaml
name: Validate Userscripts

on:
  push:
    paths: ["**.user.js"]
  pull_request:
    paths: ["**.user.js"]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install ESLint
        run: npm install eslint

      - name: Run ESLint
        run: npx eslint . --ext .js --ignore-path .gitignore
```

## 📋 Scripts

| Script | Description |
|--------|-------------|
| `consensus-copy-citations.user.js` | Adds sorted citation links when copying from Consensus.app |
| `wikipedia-copy-citations.user.js` | Appends Wikipedia references when copying selected text |
| `sullivan_copy-citations.user.js`  | Appends footnote citations when copying from Sullivan on Comp |
| `merus_tab-send4spaces.user.js`    | Send 4 spaces instead of tab when editing a "Description" in Merus |
| `pdrater_copy-rating.user.js`      | Reformat rating strings |
| `pubmed_copy-citations.user.js`    | Appends citation links when copying from PubMed Central |

---

## 📄 .gitignore

```plaintext
node_modules/
.DS_Store
*.log
```

## ✅ License

MIT unless otherwise noted.
