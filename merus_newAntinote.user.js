// ==UserScript==
// @name         MerusCase → Antinote (Zero Prompt + Doc/Notes, Append, ES5)
// @namespace    jjk.merus.antinote
// @version      0.8.0
// @description  One-click Antinote note (create or append). ISSUE blank; Active Doc / Merus Notes included when present; no extra blank lines.
// @match        https://meruscase.com/*
// @match        https://*.meruscase.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // --- Config ---
  var USE_TITLE = true; // true => title param = client on "Create" calls

  // --- Styles ---
  function addStyle(css){ try{ if(typeof GM_addStyle==='function') return GM_addStyle(css);}catch(e){} var s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); }
  addStyle(
    '.jjk-antinote-wrap{position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;gap:10px;flex-wrap:wrap}' +
    '.jjk-antinote-btn{padding:10px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);background:#1f6feb;color:#fff !important;font:600 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.2px;cursor:pointer;border:none;opacity:.95}' +
    '.jjk-antinote-btn:hover{opacity:1}' +
    '.jjk-antinote-btn.append{background:#6f42c1}' + /* purple for append */
    '.jjk-antinote-toast{position:fixed;right:18px;bottom:70px;background:rgba(30,30,30,.95);color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;z-index:999999;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:380px;word-break:break-word}'
  );

  // --- Helpers ---
  function toast(msg, ms){ if(ms==null) ms=1400; var d=document.createElement('div'); d.className='jjk-antinote-toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, ms); }
  function fmtDate(){ var dt=new Date(); var mm=('0'+(dt.getMonth()+1)).slice(-2), dd=('0'+dt.getDate()).slice(-2), yy=String(dt.getFullYear()).slice(-2); return mm+'/'+dd+'/'+yy; }
  function trim(s){ return String(s||'').replace(/^\s+|\s+$/g,''); }
  function squish(s){ return trim(String(s||'').replace(/\s+/g,' ')); }

  // Client: from "#lpClientName .pretty-name-span" title/text like "Last, First v. Employer"
  function getClientFirstLast(){
    var el=document.querySelector('#lpClientName span.pretty-name-span');
    if(!el) return '';
    var raw=trim(el.getAttribute('title')||el.textContent||'');
    if(!raw) return '';
    var namePart=trim(raw.split(' v. ')[0]);
    var parts=namePart.split(',');
    if(parts.length<2) return namePart;
    var last=trim(parts[0]);
    var firstM=trim(parts.slice(1).join(' ')).replace(/\s+/g,' ');
    return trim((firstM+' '+last).replace(/\s+/g,' '));
  }

  // ACTIVE DOCUMENT: first .box-view .list-group-item h5 span text (filename)
  function getActiveDocument(){
    try{
      var span = document.querySelector('.box-view .list-group-item h5 span');
      if (span) return squish(span.textContent);
    }catch(e){}
    return '';
  }

  // MERUS NOTES: second .box-view .list-group-item → div > p text (activity details block)
  function getMerusNotes(){
    try{
      var items = document.querySelectorAll('.box-view .list-group-item');
      if (items && items.length >= 2) {
        var noteP = items[1].querySelector('div p');
        if (noteP) return squish(noteP.textContent);
      }
    }catch(e){}
    return '';
  }

  // Build content:
  // CLIENT
  // DATE
  // ISSUE (blank)
  // [if either section present → add two line breaks, then one/both sections, then one blank line]
  // # 
  function buildContent(client, dateStr, activeDoc, notes){
    var hasExtras = !!(trim(activeDoc) || trim(notes));
    var content = '';
    content += '**CLIENT**:\t\t'+client+'\n';
    content += '**DATE**:\t\t'+dateStr+'\n';
    content += '**ISSUE**:\t\t' + '\n'; // issue line (blank value)

    if (hasExtras) {
      content += '\n'; // second blank line only when extras exist
      if (trim(activeDoc)) content += 'ACTIVE DOCUMENT:\t\t'+squish(activeDoc)+'\n';
      if (trim(notes))     content += 'MERUS NOTES:\t\t'+squish(notes)+'\n';
      content += '\n'; // one trailing blank line after sections
    } else {
      // no extras → do NOT add extra blank lines; keep exactly one blank before '#'
      content += '\n';
    }

    content += '# ';
    return content;
  }

  // Direct launch strategies (use on a user click)
  var launchers = {
    viaAnchor: function (url) {
      try { var a=document.createElement('a'); a.href=url; a.style.display='none'; document.body.appendChild(a); a.click(); setTimeout(function(){ if(a.parentNode) a.parentNode.removeChild(a); }, 1000); } catch(e){}
    },
    viaLocation: function (url) {
      try { window.location.assign(url); } catch(e){}
    },
    viaOpenSelf: function (url) {
      try { window.open(url, '_self'); } catch(e){}
    },
    viaIframe: function (url) {
      try { var f=document.createElement('iframe'); f.style.display='none'; f.src=url; document.body.appendChild(f); setTimeout(function(){ if(f.parentNode) f.parentNode.removeChild(f); }, 5000); } catch(e){}
    }
  };

  function tryOpenAntinote(url){
    launchers.viaAnchor(url);
    setTimeout(function(){ launchers.viaLocation(url); }, 40);
    setTimeout(function(){ launchers.viaOpenSelf(url); }, 80);
    setTimeout(function(){ launchers.viaIframe(url); }, 120);
  }

  function buildAntinoteURL(path, content, title){
    var url = 'antinote://x-callback-url/'+path+'?content='+encodeURIComponent(content);
    if (path === 'createNote' && USE_TITLE && title) {
      url += '&title='+encodeURIComponent(title);
    }
    return url;
  }

  // --- Actions ---
  function createNote(){
    if(String(location.hostname).indexOf('meruscase.com')===-1){ toast('Not a MerusCase page.'); return; }

    var client=getClientFirstLast();
    if(!client){ toast('Could not read client name.'); return; }

    var activeDoc = getActiveDocument();
    var notes     = getMerusNotes();
    var content   = buildContent(client, fmtDate(), activeDoc, notes);
    var antUrl    = buildAntinoteURL('createNote', content, client);

    tryOpenAntinote(antUrl);
    toast('Creating Antinote…');
  }

  function appendToCurrent(){
    if(String(location.hostname).indexOf('meruscase.com')===-1){ toast('Not a MerusCase page.'); return; }

    // For append, we typically just include the extras block (no header), but per your format
    // we’ll reuse the full block so the context is preserved when appending.
    var client=getClientFirstLast();
    if(!client){ toast('Could not read client name.'); return; }

    var activeDoc = getActiveDocument();
    var notes     = getMerusNotes();
    var content   = buildContent(client, fmtDate(), activeDoc, notes);
    var antUrl    = buildAntinoteURL('appendToCurrent', content, null);

    tryOpenAntinote(antUrl);
    toast('Appending to Antinote…');
  }

  // --- UI (two buttons) ---
  function ensureButtons(){
    var wrap = document.querySelector('.jjk-antinote-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'jjk-antinote-wrap';
      document.body.appendChild(wrap);
    }
    // Create
    if (!document.querySelector('.jjk-antinote-btn.create')) {
      var b1=document.createElement('button');
      b1.className='jjk-antinote-btn create';
      b1.type='button';
      b1.textContent='Create Antinote';
      b1.addEventListener('click', createNote, false);
      wrap.appendChild(b1);
    }
    // Append
    if (!document.querySelector('.jjk-antinote-btn.append')) {
      var b2=document.createElement('button');
      b2.className='jjk-antinote-btn append';
      b2.type='button';
      b2.textContent='Append to Antinote';
      b2.addEventListener('click', appendToCurrent, false);
      wrap.appendChild(b2);
    }
  }

  function init(){
    ensureButtons();
    try{
      var pending=null;
      var mo=new MutationObserver(function(){ if(pending) return; pending=setTimeout(function(){ pending=null; ensureButtons(); }, 300); });
      mo.observe(document.documentElement, { childList:true, subtree:true });
    }catch(e){}
  }

  // Hotkey keeps mapping to “Create” (Alt+Shift+A). If you want a second hotkey for Append, say the word.
  function hotkey(e){ if(e && e.altKey && e.shiftKey && e.code==='KeyA'){ var b=document.querySelector('.jjk-antinote-btn.create'); if(b) b.click(); } }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init, {once:true}); } else { init(); }
  window.addEventListener('keydown', hotkey, false);
})();