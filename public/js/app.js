// Komfort-Funktionen. Alles funktioniert auch ohne JavaScript.
(function () {
  'use strict';

  const MINUS = '−';

  function hm(min) {
    const sign = min < 0 ? MINUS : '';
    const abs = Math.abs(min);
    return sign + Math.floor(abs / 60) + ':' + String(abs % 60).padStart(2, '0');
  }
  function dec(min) {
    const sign = min < 0 ? MINUS : '';
    return sign + (Math.round((Math.abs(min) / 60) * 100) / 100).toFixed(2).replace('.', ',');
  }
  function signed(min, f) {
    if (min === 0) return '±' + f(0);
    return (min > 0 ? '+' : '') + f(min);
  }

  function durationEl(min, isSigned) {
    const span = document.createElement('span');
    span.className = 'dur' + (isSigned ? (min > 0 ? ' plus' : min < 0 ? ' minus' : ' zero') : '');
    const a = document.createElement('span');
    a.className = 'hm';
    a.textContent = (isSigned ? signed(min, hm) : hm(min)) + ' h';
    const b = document.createElement('span');
    b.className = 'dec';
    b.textContent = (isSigned ? signed(min, dec) : dec(min)) + ' h';
    span.append(a, ' ', b);
    return span;
  }

  // Wie parseClock auf dem Server.
  function parseClock(s, allow24) {
    s = String(s || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
    let h;
    let mi;
    if (m) {
      h = Number(m[1]);
      mi = m[2] === undefined ? 0 : Number(m[2]);
    } else if ((m = s.match(/^(\d{1,2})(\d{2})$/))) {
      h = Number(m[1]);
      mi = Number(m[2]);
    } else return null;
    if (mi > 59) return null;
    if (h === 24 && mi === 0 && allow24) return 1440;
    if (h > 23) return null;
    return h * 60 + mi;
  }

  function autoBreak(blockMin) {
    if (blockMin > 540) return 45;
    if (blockMin > 360) return 30;
    return 0;
  }

  // --- Tag erfassen: Live-Berechnung und weitere Blöcke ---
  const form = document.getElementById('day-form');
  if (form) {
    const rowsEl = document.getElementById('block-rows');
    const addBtn = document.getElementById('add-block');
    const breakInput = document.getElementById('manual-break');
    const absenceSel = document.getElementById('absence-type');
    const fractionRow = document.getElementById('fraction-row');
    const summary = document.getElementById('day-summary');
    const modelTarget = Number(form.dataset.modelTarget);
    const holiday = form.dataset.holiday === '1';
    const tracked = form.dataset.tracked === '1';
    const weekly = form.dataset.weekly === '1';

    addBtn.hidden = false;
    addBtn.addEventListener('click', () => {
      const rows = rowsEl.querySelectorAll('.block-row');
      const clone = rows[rows.length - 1].cloneNode(true);
      clone.querySelectorAll('input').forEach((i) => {
        i.value = '';
      });
      rowsEl.appendChild(clone);
      clone.querySelector('input').focus();
      update();
    });

    function update() {
      const blocks = [];
      let invalid = false;
      rowsEl.querySelectorAll('.block-row').forEach((row) => {
        const [s, e] = row.querySelectorAll('input');
        if (!s.value.trim() && !e.value.trim()) return;
        const start = parseClock(s.value, false);
        const end = parseClock(e.value, true);
        if (start === null || end === null || end <= start) {
          invalid = true;
          return;
        }
        blocks.push([start, end]);
      });
      blocks.sort((a, b) => a[0] - b[0]);

      breakInput.disabled = blocks.length > 1;
      if (absenceSel) {
        const opt = absenceSel.selectedOptions[0];
        const halfAllowed = opt && opt.value && opt.dataset.half === '1';
        fractionRow.hidden = !opt || !opt.value;
        const half = fractionRow.querySelector('input[value="0.5"]');
        half.disabled = !halfAllowed;
        if (!halfAllowed) fractionRow.querySelector('input[value="1"]').checked = true;
      }
      if (invalid) return;

      const blockMin = blocks.reduce((sum, b) => sum + b[1] - b[0], 0);
      let breakMin = 0;
      let deduct = 0;
      let source = '';
      if (blocks.length > 1) {
        for (let i = 1; i < blocks.length; i++) breakMin += blocks[i][0] - blocks[i - 1][1];
        source = 'Lücken';
      } else if (blocks.length === 1) {
        const manual = breakInput.value.trim();
        if (/^\d{1,3}$/.test(manual)) {
          breakMin = deduct = Number(manual);
          source = 'manuell';
        } else {
          breakMin = deduct = autoBreak(blockMin);
          source = 'automatisch';
        }
      }
      const ist = Math.max(0, blockMin - deduct);

      let share = 0;
      if (absenceSel && absenceSel.value) {
        const opt = absenceSel.selectedOptions[0];
        if (opt.dataset.reduces === '1') {
          const checked = fractionRow.querySelector('input:checked');
          share = checked && checked.value === '0.5' ? 0.5 : 1;
        }
      }
      const soll = !tracked || holiday ? 0 : Math.round(modelTarget * (1 - share));
      const saldo = tracked ? ist - soll : 0;

      const set = (key, node) => {
        const el = summary.querySelector('[data-live="' + key + '"]');
        el.replaceChildren(node);
      };
      set('block', durationEl(blockMin));
      const br = document.createElement('span');
      br.textContent = breakMin + ' min' + (source ? ' (' + source + ')' : '');
      set('break', br);
      set('ist', durationEl(ist));
      if (!weekly) {
        set('soll', durationEl(soll));
        set('saldo', durationEl(saldo, true));
      }
    }

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  }

  // --- Bestätigung vor dem Löschen ---
  document.querySelectorAll('form[data-confirm]').forEach((f) => {
    f.addEventListener('submit', (ev) => {
      if (!window.confirm(f.dataset.confirm)) ev.preventDefault();
    });
  });

  // --- Jahr wählen ohne extra Knopf ---
  document.querySelectorAll('select[data-autosubmit]').forEach((sel) => {
    sel.addEventListener('change', () => sel.form.submit());
  });

  // --- Theme-Umschalter ohne Neuladen ---
  const themeForm = document.querySelector('.theme-form');
  if (themeForm) {
    const LABELS = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
    const ICONS = { auto: 'Auto', light: '☀', dark: '☾' };
    const NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
    themeForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const data = new URLSearchParams(new FormData(themeForm));
      const theme = data.get('theme');
      try {
        const res = await fetch(themeForm.action, {
          method: 'POST',
          body: data,
          headers: { 'X-Requested-With': 'fetch' },
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch (e) {
        themeForm.submit();
        return;
      }
      if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
      const btn = themeForm.querySelector('button');
      btn.textContent = ICONS[theme];
      btn.title = 'Darstellung: ' + LABELS[theme] + ' (klicken zum Wechseln)';
      themeForm.querySelector('input[name="theme"]').value = NEXT[theme];
    });
  }
})();
