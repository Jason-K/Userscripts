// ==UserScript==
// @name         MerusCase → Antinote (Single Launch, Append Trimmed, ES5)
// @namespace    jjk.merus.antinote
// @version      0.9.3
// @description  One-click Antinote (create/append). Single launch to avoid duplicates; append = Date/Time + Active Doc + MD header.
// @match        https://meruscase.com/*
// @match        https://*.meruscase.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // ===== Config =====
  var LAUNCH_METHOD = 'anchor'; // 'anchor' | 'location' | 'open' | 'iframe'
  var USE_TITLE = true; // true => add &title=<client> on "Create"
  var REENTRY_MS = 1500; // ignore repeat clicks within this window

  // ===== Styles =====
  function addStyle(css){ try{ if(typeof GM_addStyle==='function') return GM_addStyle(css);}catch(e){} var s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); }
  addStyle(
    '.jjk-antinote-wrap{position:fixed;right:18px;bottom:18px;z-index:999999;display:flex;gap:10px;flex-wrap:wrap}' +
    '.jjk-antinote-btn{padding:10px 14px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);background:#1f6feb;color:#fff !important;font:600 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:.2px;cursor:pointer;border:none;opacity:.95}' +
    '.jjk-antinote-btn:hover{opacity:1}' +
    '.jjk-antinote-btn.append{background:#6f42c1}' +
    '.jjk-antinote-toast{position:fixed;right:18px;bottom:70px;background:rgba(30,30,30,.95);color:#fff;padding:10px 12px;border-radius:10px;font:12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;z-index:999999;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:380px;word-break:break-word}'
  );

  // ===== Helpers =====
  function toast(msg, ms){ if(ms==null) ms=1200; var d=document.createElement('div'); d.className='jjk-antinote-toast'; d.textContent=msg; document.body.appendChild(d); setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, ms); }
  function pad2(n){ return ('0'+n).slice(-2); }
  function fmtDate(){ var dt=new Date(); return pad2(dt.getMonth()+1)+'/'+pad2(dt.getDate())+'/'+String(dt.getFullYear()).slice(-2); }
  function fmtTime12(){ var dt=new Date(); var h=dt.getHours(), m=pad2(dt.getMinutes()), ap=(h>=12?'PM':'AM'); h=h%12||12; return pad2(h)+':'+m+' '+ap; }
  function trim(s){ return String(s||'').replace(/^\s+|\s+$/g,''); }
  function squish(s){ return trim(String(s||'').replace(/\s+/g,' ')); }

  // Client: "#lpClientName .pretty-name-span" with title/text "Last, First v. Employer"
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

  // ACTIVE DOCUMENT: first .box-view .list-group-item h5 span
  function getActiveDocument(){
    try{
      var span = document.querySelector('.box-view .list-group-item h5 span');
      if (span) return squish(span.textContent);
    }catch(e){}
    return '';
  }

  // MERUS NOTES: second .box-view .list-group-item → div > p
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

  // Create content (full header + ISSUE blank + optional extras)
  function buildCreateContent(client, dateStr, activeDoc, notes){
    var hasExtras = !!(trim(activeDoc) || trim(notes));
    var out = '';
    out += '**CLIENT**:\t\t'+client+'\n';
    out += '**DATE**:\t\t'+dateStr+'\n';
    out += '**ISSUE**:\t\t' + '\n';
    if (hasExtras) {
      out += '\n';
      if (trim(activeDoc)) out += 'ACTIVE DOCUMENT:\t\t'+squish(activeDoc)+'\n';
      if (trim(notes))     out += 'MERUS NOTES:\t\t'+squish(notes)+'\n';
      out += '\n';
    } else {
      out += '\n';
    }
    out += '# ';
    return out;
  }

  // Append content (ONLY Date/Time + Active Document + header)
  function buildAppendContent(activeDoc){
    var dt = fmtDate() + ' ' + fmtTime12();
    var out = '';
    out += '**DATE/TIME**:\t\t' + dt + '\n';
    if (trim(activeDoc)) out += 'ACTIVE DOCUMENT:\t\t' + squish(activeDoc) + '\n';
    out += '\n# ';
    return out;
  }

  function buildAntinoteURL(path, content, title){
    var url = 'antinote://x-callback-url/'+path+'?content='+encodeURIComponent(content);
    if (path === 'createNote' && USE_TITLE && title) url += '&title='+encodeURIComponent(title);
    return url;
  }

  // ===== Single launch (to avoid duplicates) =====
  var launching = false;
  var lastLaunchAt = 0;

  function launch(url){
    var now = Date.now();
    if (launching || (now - lastLaunchAt) < REENTRY_MS) return;
    launching = true; lastLaunchAt = now;

    try {
      if (LAUNCH_METHOD === 'anchor') {
        var a=document.createElement('a'); a.href=url; a.style.display='none'; document.body.appendChild(a); a.click();
        setTimeout(function(){ if(a.parentNode) a.parentNode.removeChild(a); launching=false; }, 600);
        return;
      } else if (LAUNCH_METHOD === 'location') {
        window.location.assign(url); launching=false; return;
      } else if (LAUNCH_METHOD === 'open') {
        window.open(url, '_self'); launching=false; return;
      } else if (LAUNCH_METHOD === 'iframe') {
        var f=document.createElement('iframe'); f.style.display='none'; f.src=url; document.body.appendChild(f);
        setTimeout(function(){ if(f.parentNode) f.parentNode.removeChild(f); launching=false; }, 1200);
        return;
      }
    } catch (e) {
      launching = false;
    }
  }

  // ===== Actions =====
  function createNote(){
    if(String(location.hostname).indexOf('meruscase.com')===-1){ toast('Not a MerusCase page.'); return; }
    var client=getClientFirstLast(); if(!client){ toast('Could not read client name.'); return; }
    var activeDoc=getActiveDocument(); var notes=getMerusNotes();
    var content=buildCreateContent(client, fmtDate(), activeDoc, notes);
    var url=buildAntinoteURL('createNote', content, client);
    launch(url);
    toast('Creating Antinote…');
  }

  function appendToCurrent(){
    if(String(location.hostname).indexOf('meruscase.com')===-1){ toast('Not a MerusCase page.'); return; }
    var activeDoc=getActiveDocument(); // notes intentionally omitted per request
    var content=buildAppendContent(activeDoc);
    var url=buildAntinoteURL('appendToCurrent', content, null);
    launch(url);
    toast('Appending to Antinote…');
  }

  // ===== UI =====
  function ensureButtons(){
    var wrap = document.querySelector('.jjk-antinote-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'jjk-antinote-wrap'; document.body.appendChild(wrap); }

    if (!document.querySelector('.jjk-antinote-btn.create')) {
      var b1=document.createElement('button'); b1.className='jjk-antinote-btn create'; b1.type='button'; b1.textContent='Create Antinote';
      b1.addEventListener('click', createNote, false); wrap.appendChild(b1);
    }
    if (!document.querySelector('.jjk-antinote-btn.append')) {
      var b2=document.createElement('button'); b2.className='jjk-antinote-btn append'; b2.type='button'; b2.textContent='Append to Antinote';
      b2.addEventListener('click', appendToCurrent, false); wrap.appendChild(b2);
    }
  }

  function init(){
    ensureButtons();
    // NO MutationObserver - too risky for rate limiting
    // Buttons are created once on page load and persist
    // If page navigation removes them, user can refresh
  }

  // Hotkey = Alt+Shift+A
  function hotkey(e){ if(e && e.altKey && e.shiftKey && e.code==='KeyA'){ var b=document.querySelector('.jjk-antinote-btn.create'); if(b) b.click(); } }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init, {once:true}); } else { init(); }
  window.addEventListener('keydown', hotkey, false);
})();
