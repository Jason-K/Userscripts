# MerusCase Scripts Migration Guide

## 🎯 Purpose
This guide helps you transition from running multiple individual scripts to a single unified script, dramatically reducing Cloudflare rate limiting issues.

## ⚠️ The Problem
Running multiple userscripts simultaneously causes:
- Multiple MutationObserver instances watching the DOM
- Multiple event listeners on the same elements
- Repeated loading of MerusCore library (7+ times)
- Cumulative activity that triggers Cloudflare 1015 rate limiting

## ✅ The Solution
Use `merus_unified.user.js` which combines all functionality into one lightweight script.

## 📋 Migration Steps

### Step 1: Disable Individual Scripts
Disable these scripts in your userscript manager:
- ❌ `merus_default-assignee.user.js`
- ❌ `merus_downloadPDF.user.js`
- ❌ `merus_document-renamer.user.js`
- ❌ `merus_email-renamer.user.js`
- ❌ `merus_tab-send4spaces.user.js`
- ❌ `merus_prevent-close-warning.user.js`
- ❌ `merus_newAntinote.user.js`

### Step 2: Enable Unified Script
Enable only:
- ✅ `merus_unified.user.js`

### Step 3: Verify Functionality
After enabling, check the browser console for:
```
🚀 MerusCase Unified Utilities v3.0.0 initializing...
✓ Close warning prevention enabled
✓ Default assignee enabled
✓ Smart tab enabled
✓ Quick PDF download enabled
✓ Smart renamer enabled
✓ Email renamer enabled
✓ Antinote integration enabled
✅ All MerusCase utilities initialized successfully
```

## 🔧 What's Included

### 1. Close Warning Prevention
- Automatically removes "Are you sure you want to close?" prompts
- No configuration needed

### 2. Default Assignee
- Sets "Sommer Murray (SEM)" as default assignee for new tasks
- Automatically sets today's date as due date
- Triggers on `/tasks/add` pages and "New Task" link clicks

### 3. Smart Tab (4-Space Indent)
- Press `Tab` in notes to insert 4 spaces
- Press `Shift+Tab` to remove indent
- Press `Backspace` to smart-unindent
- Works in `.note-editable` fields

### 4. Quick PDF Download
- Enhanced PDF filenames with case name, date, and smart formatting
- Copies filename to clipboard automatically
- Format: `{CaseName} - {YYYY.MM.DD} - {Document Title}`

### 5. Smart Renamer (Documents)
- Automatically formats document names
- Preserves medical/legal acronyms (QME, AME, UR, etc.)
- Extracts and formats dates properly
- Triggers on rename button clicks

### 6. Email Renamer
- Auto-generates email names: `{Date} - Email - {Sender} - {Subject}`
- Triggers when editing email activities
- Format: `YYYY.MM.DD - Email - sender - subject`

### 7. Antinote Integration
- **Create Note**: 📝 button (bottom-right)
- **Append Note**: ➕ button (bottom-right)
- **Hotkey**: `Alt+Shift+A` to append
- Includes active document and case info

## 📊 Performance Improvements

### Before (7 Individual Scripts)
- 7 script initializations
- 7 MerusCore library loads (~1000 lines × 7)
- 5+ MutationObservers running continuously
- 20+ event listeners
- High Cloudflare rate limit risk

### After (1 Unified Script)
- 1 script initialization
- No external dependencies
- 1 MutationObserver (only for close warning)
- 7 event listeners (delegated efficiently)
- Minimal Cloudflare activity

## 🐛 Troubleshooting

### Script doesn't load
**Check console for errors:**
```javascript
// Open browser console (F12) and look for errors
// Should see: "🚀 MerusCase Unified Utilities v3.0.0 initializing..."
```

### GM_addStyle error
The script includes a fallback. If you see:
```
ℹ️ GM_addStyle not found; using inline fallback implementation
```
This is normal and the script will work fine.

### Specific feature not working
Enable debug mode by adding this to browser console:
```javascript
// Check what's loaded
console.log(window.merusDefaultAssignee); // Should exist if script loaded
```

### Still getting rate limited
1. **Clear browser cache** and reload
2. **Check other extensions** - disable other automation tools temporarily
3. **Wait 5-10 minutes** if you've been rate limited
4. **Reduce manual page refreshes**

## 🔄 Reverting to Individual Scripts

If you need to revert:
1. Disable `merus_unified.user.js`
2. Re-enable individual scripts
3. **Note**: This will restore the rate limiting risk

## 📝 Configuration

### Change Default Assignee
Edit line 119 in `merus_unified.user.js`:
```javascript
defaultAssignee: 'Your Name (YN)',
```

### Disable Date Auto-Fill
Edit line 120:
```javascript
setDueDate: false,
```

### Change Tab Spaces
Edit line 195:
```javascript
SPACES: "  ",  // Change to 2 spaces
```

### Disable Non-Breaking Spaces
Edit line 196:
```javascript
useNbsp: false,  // Use regular spaces instead
```

## 🚀 Additional Scripts

If you're also using these scripts, they can remain separate:
- `merus_search-booleans.user.js` - Enhanced search filtering
- `merus_tag-calls.user.js` - Auto-tagging based on content

These scripts have different usage patterns and may not cause rate limiting issues.

## 📞 Support

If you encounter issues:
1. Check browser console for errors (F12)
2. Verify script is enabled in userscript manager
3. Try disabling all other scripts temporarily
4. Clear cache and hard reload (Cmd+Shift+R / Ctrl+Shift+F5)

## 🎉 Success Indicators

You'll know it's working when:
- ✅ No more "close tab" warnings
- ✅ Task assignee auto-fills
- ✅ Tab key inserts 4 spaces in notes
- ✅ PDF downloads have smart filenames
- ✅ Antinote buttons appear (bottom-right)
- ✅ No Cloudflare 1015 errors

---

**Version**: 3.0.0
**Last Updated**: November 25, 2025
**Author**: Jason Knox
