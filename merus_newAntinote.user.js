// ==UserScript==
// @name         MerusCase → Antinote (Client Note Button, Debuggable ES5)
// @namespace    jjk.merus.antinote
// @version      0.3.0
// @description  Floating button to create an Antinote from MerusCase; robust launcher + on-page debug panel.
// @match        https://meruscase.com/*
// @match        https://*.meruscase.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Safe GM wrappers ----------
  function has(fn) { return typeof fn === 'function'; }
  function safeAddStyle(css) {
    if (has(GM_addStyle)) return GM_addStyle(css);
    var el = document.createElement('style'); el.type = 'text/css';
    el.appendChild(document.createTextNode(css)); document.head.appendChild(el);
  }
  function safeSetValue(k, v) { try { if (has(GM_setValue)) return GM_setValue(k, v); } catch (e) {} try { localStorage.setItem('jjk_vm_'+k, String(v)); } catch (e2) {} }
  function safeGetValue(k, d) { try { if (has(GM_getValue)) return GM_getValue(k, d); } catch (e) {} try { var v=localStorage.getItem('jjk_vm_'+k); return v===null?d:v; } catch (e2) { return d; } }
  function safeSetClipboard(text) {
    try { if (has(GM_setClipboard)) return GM_setClipboard(text); } catch (e) {}
    try { var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (e2) {}
  }
  function safeRegisterMenu(title, fn) { try { if (has(GM_registerMenuCommand)) GM_registerMenuCommand(title, fn); } catch (e) {} }

  // ---------- Styles ----------
  safeAddStyle(
    '.jjk-antinote-btn{position:fixed;right:18px;bottom:18px;z-index:999999;padding:10px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);background:#1f6feb;color:#fff !important;font:600 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.2px;cursor:pointer;border:none;opacity:.95}' +
    '.jjk-antinote-btn:hover{opacity:1}' +
    '.jjk-antinote-toast{position:fixed;right:18px;bottom:70px;background:rgba(30,30,30,.95);color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;z-index:999999;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:380px;word-break:break-word}' +
    '.jjk-antinote-debug{position:fixed;right:18px;bottom:120px;z-index:999999;background:#111;color:#eee;border:1px solid #333;border-radius:10px;max-width:460px;width:460px;box-shadow:0 6px 20px rgba(0,0,0,.35);font:12px/1.3 Menlo,Consolas,monospace;}' +
    '.jjk-antinote-debug header{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #333;background:#1f1f1f;border-top-left-radius:10px;border-top-right-radius:10px}' +
    '.jjk-antinote-debug header .t{font-weight:700;font-size:12px}' +
    '.jjk-antinote-debug header .a button{margin-left:6px;font:600 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:4px 8px;border-radius:8px;border:1px solid #444;background:#222;color:#ddd;cursor:pointer}' +
    '.jjk-antinote-debug pre{margin:0;max-height:220px;overflow:auto;padding:8px 10px;white-space:pre-wrap;word-break:break-word}' +
    '.jjk-antinote-debug .row{padding:8px 10px;border-top:1px solid #222}' +
    '.jjk-antinote-debug .row input{width:100%;font:12px/1.2 Menlo,Consolas,monospace;padding:6px;border-radius:6px;border:1px solid #444;background:#121212;color:#ddd}'
  );

  // ---------- Debug panel ----------
  var dbg = (function () {
    var box, logEl, urlInput, visible = false;

    function ensure() {
      if (box) return box;
      box = document.createElement('div'); box.className = 'jjk-antinote-debug'; box.style.display = 'none';
      var header = document.createElement('header');
      var title = document.createElement('div'); title.className = 't'; title.textContent = 'Antinote Debug';
      var actions = document.createElement('div'); actions.className = 'a';

      var btnCopy = document.createElement('button'); btnCopy.textContent = 'Copy URL';
      btnCopy.onclick = function(){ if (urlInput) { safeSetClipboard(urlInput.value||''); log('Copied URL.'); } };

      var btnTryHref = document.createElement('button'); btnTryHref.textContent = 'Open: <a>';
      btnTryHref.onclick = function(){ if (urlInput) launchers.viaAnchor(urlInput.value); };

      var btnTryAssign = document.createElement('button'); btnTryAssign.textContent = 'Open: location';
      btnTryAssign.onclick = function(){ if (urlInput) launchers.viaLocation(urlInput.value); };

      var btnTrySelf = document.createElement('button'); btnTrySelf.textContent = "Open: window.open";
      btnTrySelf.onclick = function(){ if (urlInput) launchers.viaOpenSelf(urlInput.value); };

      var btnTryIframe = document.createElement('button'); btnTryIframe.textContent = 'Open: iframe';
      btnTryIframe.onclick = function(){ if (urlInput) launchers.viaIframe(urlInput.value); };

      var btnClear = document.createElement('button'); btnClear.textContent = 'Clear';
      btnClear.onclick = function(){ if (logEl) logEl.textContent = ''; };

      var btnClose = document.createElement('button'); btnClose.textContent = 'Hide';
      btnClose.onclick = function(){ toggle(false); };

      actions.appendChild(btnCopy);
      actions.appendChild(btnTryHref);
      actions.appendChild(btnTryAssign);
      actions.appendChild(btnTrySelf);
      actions.appendChild(btnTryIframe);
      actions.appendChild(btnClear);
      actions.appendChild(btnClose);

      header.appendChild(title); header.appendChild(actions);
      logEl = document.createElement('pre'); logEl.textContent = '';
      var row = document.createElement('div'); row.className = 'row';
      urlInput = document.createElement('input'); urlInput.placeholder = 'antinote://x-callback-url/createNote?...';
      row.appendChild(urlInput);

      box.appendChild(header); box.appendChild(logEl); box.appendChild(row);
      document.body.appendChild(box);
      return box;
    }

    function log(s) {
      try { console.log('[Antinote]', s); } catch (e) {}
      ensure(); var ts = new Date().toLocaleTimeString();
      logEl.textContent += ts + '  ' + s + '\n'; logEl.scrollTop = logEl.scrollHeight;
    }
    function setURL(u) { ensure(); urlInput.value = u || ''; }
    function toggle(show) { ensure(); visible = (show == null ? !visible : !!show); box.style.display = visible ? 'block' : 'none'; }
    return { log: log, setURL: setURL, toggle: toggle };
  })();

  // Toggle from VM menu
  safeRegisterMenu('Toggle Antinote Debug Panel', function(){ dbg.toggle(); });

  // ---------- Utilities ----------
  function toast(msg, ms) {
    if (ms == null) ms = 2500;
    try {
      var div = document.createElement('div'); div.className='jjk-antinote-toast'; div.textContent=msg;
      document.body.appendChild(div); setTimeout(function(){ if (div.parentNode) div.parentNode.removeChild(div); }, ms);
    } catch (e) {}
  }

  function fmtShortDate() {
    var d = new Date();
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    var yy = String(d.getFullYear()).slice(-2);
    return mm + '/' + dd + '/' + yy;
  }

  function getClientFirstLast() {
    try {
      var el = document.querySelector('#lpClientName span.pretty-name-span');
      if (!el) return '';
      var raw = (el.getAttribute('title') || el.textContent || ''); raw = raw.replace(/^\s+|\s+$/g, '');
      if (!raw) return '';
      var namePart = raw.split(' v. ')[0]; namePart = namePart.replace(/^\s+|\s+$/g, '');
      var parts = namePart.split(',');
      if (parts.length < 2) return namePart;
      var last = parts[0].replace(/^\s+|\s+$/g, '');
      var firstAndMiddles = parts.slice(1).join(' ').replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'');
      return (firstAndMiddles + ' ' + last).replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'');
    } catch (e) { return ''; }
  }

  function buildContent(client, issue, dateStr) {
    return '**CLIENT**:\t\t' + client + '\n' +
           '**DATE**:\t\t' + dateStr + '\n' +
           '**ISSUE**:\t\t' + (issue || '') + '\n\n' +
           '# ';
  }

  // ---------- Launch strategies (require a user gesture) ----------
  var launchers = {
    viaAnchor: function (url) {
      dbg.log('Launch via <a>.href click…');
      try {
        var a = document.createElement('a'); a.href = url; a.style.display='none';
        document.body.appendChild(a); a.click(); setTimeout(function(){ if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
      } catch (e) { dbg.log('viaAnchor exception: ' + e); }
    },
    viaLocation: function (url) {
      dbg.log('Launch via window.location.assign…');
      try { window.location.assign(url); } catch (e) { dbg.log('viaLocation exception: ' + e); }
    },
    viaOpenSelf: function (url) {
      dbg.log('Launch via window.open(…,"_self")…');
      try { window.open(url, '_self'); } catch (e) { dbg.log('viaOpenSelf exception: ' + e); }
    },
    viaIframe: function (url) {
      dbg.log('Launch via hidden <iframe>…');
      try {
        var iframe = document.createElement('iframe'); iframe.style.display='none'; iframe.src=url;
        document.body.appendChild(iframe); setTimeout(function(){ if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 5000);
      } catch (e) { dbg.log('viaIframe exception: ' + e); }
    }
  };

  function tryOpenAntinote(url) {
    dbg.setURL(url);
    // On some shells, only the first user-gesture invocation works. Do them in a tight sequence.
    launchers.viaAnchor(url);
    setTimeout(function(){ launchers.viaLocation(url); }, 50);
    setTimeout(function(){ launchers.viaOpenSelf(url); }, 100);
    setTimeout(function(){ launchers.viaIframe(url); }, 150);
  }

  // ---------- Main flow ----------
  function handleCreate() {
    dbg.toggle(true);
    if (String(location.hostname).indexOf('meruscase.com') === -1) {
      toast('Not a MerusCase page.'); dbg.log('Abort: not meruscase.com'); return;
    }

    var client = getClientFirstLast();
    dbg.log('Parsed client: ' + client);
    if (!client) { toast('Could not read client name from page.'); dbg.log('Abort: no client'); return; }

    var lastIssue = safeGetValue('lastIssue', '');
    var issue = window.prompt('Issue (optional):', lastIssue); if (issue === null) { dbg.log('Canceled at Issue'); return; }
    safeSetValue('lastIssue', issue);

    var suggestedTitle = issue ? (client + ' \u2013 ' + issue) : client; // en dash
    var lastTitle = safeGetValue('lastTitle', suggestedTitle);
    var title = window.prompt('Title (optional):', lastTitle); if (title === null) { dbg.log('Canceled at Title'); return; }
    safeSetValue('lastTitle', title);

    var lastTags = safeGetValue('lastTags', '');
    var tags = window.prompt('Tags (comma-separated, optional):', lastTags); if (tags === null) { dbg.log('Canceled at Tags'); return; }
    safeSetValue('lastTags', tags);

    var dateStr = fmtShortDate();
    var content = buildContent(client, issue, dateStr);
    dbg.log('Content preview:\n' + content);

    var url = 'antinote://x-callback-url/createNote?content=' + encodeURIComponent(content);
    if (title) url += '&title=' + encodeURIComponent(title);
    if (tags)  url += '&tags='  + encodeURIComponent(tags);
    dbg.log('Final URL: ' + url);

    tryOpenAntinote(url);
    toast('Requested Antinote for: ' + client, 1800);
  }

  function ensureButton() {
    if (document.querySelector('.jjk-antinote-btn')) return;
    var btn = document.createElement('button'); btn.className='jjk-antinote-btn'; btn.type='button'; btn.textContent='Create Antinote';
    btn.addEventListener('click', handleCreate, false);
    document.body.appendChild(btn);
  }

  function init() {
    ensureButton();
    // SPA resilience
    try {
      var pending=null;
      var mo = new MutationObserver(function(){ if (pending) return; pending=setTimeout(function(){ pending=null; ensureButton(); }, 300); });
      mo.observe(document.documentElement, { childList:true, subtree:true });
    } catch (e) {}
  }

  function onKeydown(e) { if (e && e.altKey && e.shiftKey && e.code === 'KeyA') { var btn=document.querySelector('.jjk-antinote-btn'); if (btn) btn.click(); } }

  safeRegisterMenu('Create Antinote now', function(){ handleCreate(); });
  safeRegisterMenu('Toggle Debug Panel', function(){ dbg.toggle(); });

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init, { once:true }); } else { init(); }
  window.addEventListener('keydown', onKeydown, false);
})();