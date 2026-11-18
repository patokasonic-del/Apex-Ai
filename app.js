/* ===================== APEX AI : FRONT-END ===================== */
(() => {
  'use strict';

  const FREE_LIMIT = 10;

  const SECTION_TITLES = [
    'Intro & Information Literacy',
    'Information Sources',
    'Search & Retrieval Tools',
    'Academic Writing',
    'Use of AI in Academic Writing',
    'Evaluation of Sources (CRAAP)',
    'Structure of an Academic Paper',
    'Citation & Referencing',
    'Writing Style & Language',
    'Legal & Ethical Issues',
  ];

  const UNITS = [
    {
      id: 'programming', num: '01', glyph: '</>', name: 'Computer Programming',
      tag: 'C language, past-paper debugging and predicted CATs',
      topics: ['C programming', 'Operators', 'Arithmetic', 'Strings', 'Pointers', 'Arrays', 'Memory addresses', 'Structures (struct)', 'Loops', 'Functions', 'Input/Output', 'Engineering examples'],
      welcome: "Ready to crush **Computer Programming**. Paste a past-paper question or a buggy C program and I'll break it down in plain language.",
      chips: ['Explain pointers in simple words', 'Predict 5 CAT questions on arrays with sample input/output', 'Why is my loop never ending? Show an example', 'Real-life engineering program using struct'],
    },
    {
      id: 'drawing', num: '02', glyph: '\u27C1', name: 'Engineering Drawing',
      tag: 'Step-by-step plotting with CAD-style diagrams',
      topics: ['Orthographic projection', 'First & third angle', 'Interpenetrating curves', 'Isometric projection', 'Sectioning', 'Scales', 'Line weights', 'Dimensioning', 'Drawing office practice'],
      welcome: "Welcome to the **Drawing Office**. Ask for any projection, view or section and I'll give you the plotting steps plus a CAD-style diagram.",
      chips: ['Draw a first-angle orthographic projection of a cube resting on the HP', 'Step-by-step isometric view of an L-block', 'How do I set up the XY reference line?', 'Sectioning and hatching rules'],
    },
    {
      id: 'writing', num: '03', glyph: '\u270E', name: 'Academic Writing',
      tag: 'All 10 MUT syllabus sections, taught simply',
      topics: ['Technical reports', 'Citations', 'Essay structures', 'Proposals', 'Formatting', 'Documentation standards', '10 syllabus sections'],
      welcome: "I'm your **Academic Writing** tutor. Tap a section below (or type something like \"Explain Section 6\") and I'll teach that exact module with examples and CAT questions.",
      chips: null,
    },
    {
      id: 'physics', num: '04', glyph: '\u269B', name: 'Engineering Physics',
      tag: 'Concepts and numericals for every engineering branch',
      topics: ['Dimensions', 'Motion 1D & 2D', 'Vectors', 'Thermodynamics', 'Waves', 'Optics', 'Electricity'],
      welcome: "Let's tackle **Engineering Physics**. Send me a concept or a numerical and I'll solve it step by step with units.",
      chips: ['Explain dimensional analysis with an example', 'Projectile motion: worked numerical', 'First law of thermodynamics in simple words', 'Predict 5 exam questions on waves'],
    },
    {
      id: 'chemistry', num: '05', glyph: '\u2697', name: 'Engineering Chemistry',
      tag: 'Built on the MUT first-year course outline',
      topics: ['Atomic structure', 'Chemical bonding', 'Electrochemistry', 'Water treatment', 'Material properties', 'Adsorption', 'Nitrification', 'Corrosion'],
      welcome: "Welcome to **Engineering Chemistry**. Ask about any topic in the MUT outline and I'll connect it to real engineering.",
      chips: ['Explain corrosion and how to prevent it', 'Water treatment steps in simple terms', 'Electrochemical cell: worked example', 'Predict 5 exam questions on chemical bonding'],
    },
    {
      id: 'maths', num: '06', glyph: '\u222B', name: 'Engineering Mathematics',
      tag: 'Full working, exam traps and predicted questions',
      topics: ['Calculus', 'Matrices', 'Differential equations', 'Vectors', 'Complex numbers', 'Trigonometry', 'Hyperbolic functions', 'Algebra'],
      welcome: "Time for **Engineering Mathematics**. Send any problem and I'll show every step and the rule behind it.",
      chips: ['Find the inverse of a 3x3 matrix step by step', 'Solve a first-order differential equation', 'Explain complex numbers simply', 'Predict 5 exam questions on calculus'],
    },
  ];

  /* ---------- state ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  let sb = null;
  let user = null;
  let profile = { questions_used: 0, is_upgraded: false };
  let currentUnit = null;
  const histories = {};
  let sending = false;
  let pendingMessage = null;
  let payPoll = null;
  let authMode = 'login';
  let svgCounter = 0;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 4200);
    setTimeout(() => el.remove(), 4700);
  }

  function showView(name) {
    ['auth', 'dash', 'chat'].forEach((v) => $(`#view-${v}`).classList.toggle('hidden', v !== name));
    window.scrollTo(0, 0);
  }

  function setLoading(btn, on) {
    btn.disabled = on;
    btn.classList.toggle('loading', on);
  }

  /* ---------- markdown + CAD renderer ---------- */
  function inline(text) {
    return text
      .split(/(`[^`]+`)/g)
      .map((part, i) => {
        if (i % 2 === 1) return `<code>${esc(part.slice(1, -1))}</code>`;
        let s = esc(part);
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>');
        return s;
      })
      .join('');
  }

  function renderSvgBlock(code) {
    try {
      const doc = new DOMParser().parseFromString(code.trim(), 'image/svg+xml');
      const svg = doc.documentElement;
      if (doc.querySelector('parsererror') || svg.nodeName.toLowerCase() !== 'svg') throw new Error('invalid svg');

      doc.querySelectorAll('script,foreignObject,iframe,object,embed,image,audio,video,a').forEach((n) => n.remove());

      const uid = `s${++svgCounter}_`;
      const all = [svg, ...svg.querySelectorAll('*')];
      const ids = all.map((e) => e.getAttribute('id')).filter(Boolean);
      const fixRefs = (v) => v.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, (m, id) => (ids.includes(id) ? `url(#${uid}${id})` : m));
      const stripExternal = (v) => v.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, '');

      all.forEach((el) => {
        Array.from(el.attributes).forEach((a) => {
          const name = a.name.toLowerCase();
          if (name.startsWith('on')) { el.removeAttribute(a.name); return; }
          if (name === 'href' || name === 'xlink:href') {
            if (a.value.startsWith('#') && ids.includes(a.value.slice(1))) el.setAttribute(a.name, `#${uid}${a.value.slice(1)}`);
            else el.removeAttribute(a.name);
            return;
          }
          if (name === 'id') { el.setAttribute('id', uid + a.value); return; }
          el.setAttribute(a.name, fixRefs(stripExternal(a.value)));
        });
        if (el.nodeName.toLowerCase() === 'style') el.textContent = fixRefs(stripExternal(el.textContent || ''));
      });

      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 900 560');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      const markup = new XMLSerializer().serializeToString(svg);
      return `<div class="cad-panel"><div class="cad-head"><span class="cad-dots"><i></i><i></i><i></i></span><span>APEX-CAD // DRAWING VIEWPORT</span><button type="button" class="copy-btn" data-svg-download>DOWNLOAD SVG</button></div><div class="cad-canvas">${markup}</div></div>`;
    } catch (e) {
      return codeBlockHtml('svg', code);
    }
  }

  function codeBlockHtml(lang, code) {
    return `<div class="code-block"><div class="code-head"><span>${esc(lang || 'code')}</span><button type="button" class="copy-btn" data-copy>COPY</button></div><pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`;
  }

  function renderMarkdown(src) {
    const blocks = [];
    src = String(src).replace(/```([\w+-]*)[ \t]*\n?([\s\S]*?)```/g, (m, lang, code) => {
      const i = blocks.length;
      blocks.push(lang.toLowerCase() === 'svg' ? renderSvgBlock(code) : codeBlockHtml(lang, code));
      return `\n@@BLOCK${i}@@\n`;
    });

    const lines = src.split('\n');
    const out = [];
    let list = null;
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      let m;
      if (!t) { flushPara(); closeList(); continue; }
      if ((m = t.match(/^@@BLOCK(\d+)@@$/))) { flushPara(); closeList(); out.push(blocks[+m[1]]); continue; }
      if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
        flushPara(); closeList();
        const lv = Math.min(m[1].length + 1, 5);
        out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); out.push('<hr>'); continue; }
      if (t.startsWith('>')) { flushPara(); closeList(); out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }
      if (t.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim())) {
        flushPara(); closeList();
        const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
        const head = cells(t);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i])); i++; }
        i--;
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if ((m = t.match(/^[-*\u2022]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        out.push(`<li>${inline(m[1])}</li>`);
        continue;
      }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
        out.push(`<li>${inline(m[1])}</li>`);
        continue;
      }
      closeList();
      para.push(t);
    }
    flushPara(); closeList();
    return out.join('');
  }

  /* ---------- boot ---------- */
  async function boot() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('missing config');
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    } catch (e) {
      $('.boot-text').textContent = 'CONFIGURATION ERROR: check environment variables';
      return;
    }

    buildUnitCards();
    bindEvents();

    const { data } = await sb.auth.getSession();
    await onSession(data.session);

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { onSession(null); }
      else if (event === 'SIGNED_IN' && session && (!user || user.id !== session.user.id)) {
        setTimeout(() => onSession(session), 0);
      }
    });

    $('#boot').classList.add('done');
    setTimeout(() => $('#boot').remove(), 700);
  }

  async function onSession(session) {
    if (!session) {
      user = null;
      profile = { questions_used: 0, is_upgraded: false };
      currentUnit = null;
      Object.keys(histories).forEach((k) => delete histories[k]);
      closePay(true);
      showView('auth');
      return;
    }
    user = session.user;
    $('#user-email').textContent = user.email || '';
    await loadProfile();
    if (!currentUnit) showView('dash');
  }

  async function loadProfile() {
    if (!user) return;
    const { data } = await sb.from('profiles').select('questions_used,is_upgraded').eq('id', user.id).maybeSingle();
    if (data) profile = data;
    updateCounters();
  }

  function updateCounters() {
    const remaining = Math.max(0, FREE_LIMIT - (profile.questions_used || 0));
    $$('.fq-counter').forEach((el) => {
      el.classList.remove('warn', 'empty', 'pro');
      if (profile.is_upgraded) {
        el.textContent = 'UNLIMITED ACCESS \u221E';
        el.classList.add('pro');
      } else {
        el.textContent = `Free Questions Remaining: ${remaining} / ${FREE_LIMIT}`;
        if (remaining === 0) el.classList.add('empty');
        else if (remaining <= 3) el.classList.add('warn');
      }
    });
  }

  /* ---------- dashboard ---------- */
  function buildUnitCards() {
    $('#units-grid').innerHTML = UNITS.map((u, i) => `
      <button class="unit-card" data-unit="${u.id}" style="animation-delay:${i * 70}ms" aria-label="Open ${esc(u.name)}">
        <div class="unit-top">
          <div class="unit-glyph">${esc(u.glyph)}</div>
          <div class="unit-num">UNIT ${u.num}</div>
        </div>
        <h3>${esc(u.name)}</h3>
        <p class="unit-tag">${esc(u.tag)}</p>
        <div class="topic-list">${u.topics.slice(0, 7).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="unit-cta">LAUNCH TUTOR <span>&rarr;</span></div>
      </button>`).join('');
  }

  /* ---------- chat ---------- */
  function openUnit(id) {
    const unit = UNITS.find((u) => u.id === id);
    if (!unit) return;
    currentUnit = unit;
    $('#unit-badge-text').textContent = `${unit.num} \u00B7 ${unit.name}`;
    $('#messages').innerHTML = '';
    addMessage('ai', unit.welcome);
    // restore prior conversation for this unit in this session
    (histories[unit.id] || []).forEach((h) => addMessage(h.role === 'user' ? 'user' : 'ai', h.text));
    buildChips(unit);
    updateCounters();
    showView('chat');
    scrollDown(true);
    setTimeout(() => $('#chat-input').focus(), 50);
  }

  function buildChips(unit) {
    const box = $('#chips');
    if (unit.id === 'writing') {
      box.innerHTML = SECTION_TITLES.map((t, i) => `<button type="button" class="chip" data-prompt="Explain Section ${i + 1}: ${esc(t)}"><b>S${i + 1}</b>${esc(t)}</button>`).join('');
    } else {
      box.innerHTML = unit.chips.map((c) => `<button type="button" class="chip" data-prompt="${esc(c)}">${esc(c)}</button>`).join('');
    }
  }

  function addMessage(role, text) {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    if (role === 'ai') {
      el.innerHTML = `<img class="msg-avatar" src="avatar.png" alt="" /><div class="bubble">${renderMarkdown(text)}</div>`;
    } else {
      el.innerHTML = `<div class="bubble">${esc(text).replace(/\n/g, '<br>')}</div>`;
    }
    $('#messages').appendChild(el);
    scrollDown();
    return el;
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'msg ai';
    el.innerHTML = '<img class="msg-avatar" src="avatar.png" alt="" /><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
    $('#messages').appendChild(el);
    scrollDown();
    return el;
  }

  function scrollDown(instant) {
    const m = $('#messages');
    requestAnimationFrame(() => m.scrollTo({ top: m.scrollHeight, behavior: instant ? 'auto' : 'smooth' }));
  }

  function outOfFreeQuestions() {
    return !profile.is_upgraded && (profile.questions_used || 0) >= FREE_LIMIT;
  }

  async function send(raw) {
    const text = String(raw || '').trim();
    if (!text || sending || !currentUnit) return;

    if (outOfFreeQuestions()) {
      pendingMessage = text;
      $('#chat-input').value = '';
      resizeInput();
      openPay();
      return;
    }

    sending = true;
    $('#send-btn').disabled = true;
    $('#chat-input').value = '';
    resizeInput();

    const userEl = addMessage('user', text);
    const typingEl = addTyping();
    const history = (histories[currentUnit.id] || []).slice(-12);

    try {
      const { data: s } = await sb.auth.getSession();
      if (!s.session) throw Object.assign(new Error('auth'), { code: 401 });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session.access_token}` },
        body: JSON.stringify({ unit: currentUnit.id, message: text, history }),
      });
      const data = await res.json().catch(() => ({}));
      typingEl.remove();

      if (res.status === 402) {
        userEl.remove();
        pendingMessage = text;
        await loadProfile();
        openPay();
        return;
      }
      if (res.status === 401) {
        userEl.remove();
        toast('Session expired. Please log in again.', 'err');
        await sb.auth.signOut();
        return;
      }
      if (!res.ok || !data.reply) {
        userEl.remove();
        $('#chat-input').value = text;
        resizeInput();
        toast(data.error === 'AI_UNAVAILABLE' ? 'Apex AI is busy. Your question was not counted. Please retry.' : 'Something went wrong. Please try again.', 'err');
        await loadProfile();
        return;
      }

      addMessage('ai', data.reply);
      const h = histories[currentUnit.id] || (histories[currentUnit.id] = []);
      h.push({ role: 'user', text }, { role: 'model', text: data.reply });
      profile.questions_used = data.used;
      profile.is_upgraded = !!data.is_upgraded;
      updateCounters();
    } catch (e) {
      typingEl.remove();
      userEl.remove();
      $('#chat-input').value = text;
      resizeInput();
      toast('Network error. Check your connection and retry.', 'err');
    } finally {
      sending = false;
      $('#send-btn').disabled = false;
      $('#chat-input').focus();
    }
  }

  function resizeInput() {
    const ta = $('#chat-input');
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  /* ---------- payment ---------- */
  function setPayState(state, detail) {
    ['form', 'wait', 'success', 'fail'].forEach((s) => $(`#pay-${s}-state`).classList.toggle('hidden', s !== state));
    if (state === 'fail') $('#pay-fail-text').textContent = detail || 'Please try again.';
  }

  function openPay() {
    $('#pay-msg').textContent = '';
    setPayState('form');
    $('#pay-modal').classList.remove('hidden');
    setTimeout(() => $('#pay-phone').focus(), 80);
  }

  function closePay(force) {
    $('#pay-modal').classList.add('hidden');
    if (force) stopPoll();
  }

  function stopPoll() {
    if (payPoll) { clearInterval(payPoll); payPoll = null; }
  }

  function validPhone(v) {
    return /^(?:\+?254|0)?[17]\d{8}$/.test(v.replace(/[\s-]/g, ''));
  }

  async function submitPay(e) {
    e.preventDefault();
    const phone = $('#pay-phone').value.trim();
    const msg = $('#pay-msg');
    msg.className = 'form-msg';
    if (!validPhone(phone)) { msg.textContent = 'Enter a valid Safaricom number like 07XXXXXXXX.'; return; }

    const btn = $('#pay-submit');
    setLoading(btn, true);
    try {
      const { data: s } = await sb.auth.getSession();
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session.access_token}` },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.already_upgraded) {
        await loadProfile();
        closePay(true);
        toast('Your account is already unlocked.', 'ok');
        resumePending();
        return;
      }
      if (!res.ok) { msg.textContent = data.message || 'Could not start the payment. Try again.'; return; }

      setPayState('wait');
      pollPayment(data.checkout_request_id);
    } catch (err) {
      msg.textContent = 'Network error. Please try again.';
    } finally {
      setLoading(btn, false);
    }
  }

  function pollPayment(checkoutId) {
    stopPoll();
    const started = Date.now();
    payPoll = setInterval(async () => {
      if (Date.now() - started > 120000) {
        stopPoll();
        setPayState('fail', 'We did not receive a confirmation. If money was deducted, it will unlock automatically once confirmed, or contact support.');
        return;
      }
      const { data } = await sb.from('payments').select('status,result_desc').eq('checkout_request_id', checkoutId).maybeSingle();
      if (!data || data.status === 'pending') return;
      stopPoll();
      if (data.status === 'success') {
        await loadProfile();
        setPayState('success');
        setTimeout(() => { closePay(); resumePending(); }, 1800);
      } else {
        setPayState('fail', data.status === 'cancelled' ? 'The request was cancelled on your phone.' : (data.result_desc || 'The payment did not go through.'));
      }
    }, 3000);
  }

  function resumePending() {
    if (pendingMessage && !outOfFreeQuestions()) {
      const m = pendingMessage;
      pendingMessage = null;
      send(m);
    }
  }

  /* ---------- auth ---------- */
  function setAuthMode(mode) {
    authMode = mode;
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    $('#auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('#auth-submit .btn-label').textContent = mode === 'signup' ? 'CREATE MY ACCOUNT' : 'ACCESS APEX AI';
    $('#auth-msg').textContent = '';
  }

  async function submitAuth(e) {
    e.preventDefault();
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const msg = $('#auth-msg');
    msg.className = 'form-msg';

    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
    if (password.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; return; }

    const btn = $('#auth-submit');
    setLoading(btn, true);
    try {
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          msg.className = 'form-msg ok';
          msg.textContent = 'Account created. Check your email to confirm, then log in.';
          setAuthMode('login');
          msg.className = 'form-msg ok';
          msg.textContent = 'Account created. Check your email to confirm, then log in.';
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      msg.textContent = err && err.message ? err.message : 'Authentication failed. Try again.';
    } finally {
      setLoading(btn, false);
    }
  }

  /* ---------- events ---------- */
  function bindEvents() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => setAuthMode(t.dataset.mode)));
    $('#auth-form').addEventListener('submit', submitAuth);
    $('#logout-btn').addEventListener('click', () => sb.auth.signOut());

    $('#units-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-unit]');
      if (card) openUnit(card.dataset.unit);
    });

    $('#change-unit').addEventListener('click', () => {
      currentUnit = null;
      showView('dash');
    });

    $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); send($('#chat-input').value); });
    $('#chat-input').addEventListener('input', resizeInput);
    $('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('#chat-input').value); }
    });
    $('#chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-prompt]');
      if (chip) send(chip.dataset.prompt);
    });

    // delegated: copy code + download svg
    $('#messages').addEventListener('click', async (e) => {
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        const code = copy.closest('.code-block').querySelector('code').textContent;
        try { await navigator.clipboard.writeText(code); copy.textContent = 'COPIED'; } catch { copy.textContent = 'FAILED'; }
        setTimeout(() => (copy.textContent = 'COPY'), 1500);
        return;
      }
      const dl = e.target.closest('[data-svg-download]');
      if (dl) {
        const svg = dl.closest('.cad-panel').querySelector('svg');
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'apex-ai-drawing.svg';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    });

    $('#pay-form').addEventListener('submit', submitPay);
    $('#pay-close').addEventListener('click', () => closePay());
    $('#pay-retry').addEventListener('click', () => setPayState('form'));
    $('#pay-modal').addEventListener('click', (e) => { if (e.target.id === 'pay-modal') closePay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePay(); });
  }

  boot();
})();
