window.FocusModule = (() => {
  let db = null;
  let user = null;
  let skills = [];
  let sessions = [];
  let selectedYear = new Date().getFullYear();
  let openMilestones = new Set();
  let initializedListeners = false;

  let timerInterval = null;
  let timerState = loadTimerState();

  const MONTH_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];
  const el = {};

  function loadTimerState() {
    try {
      const raw = localStorage.getItem('focusTimerState');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      running: false,
      skillId: '',
      mode: 'stopwatch',
      targetMin: 45,
      startedAt: null,
      accumulatedSec: 0,
    };
  }

  function saveTimerState() {
    localStorage.setItem('focusTimerState', JSON.stringify(timerState));
  }

  function cacheElements() {
    el.yearLabel = document.getElementById('focus-year-label');
    el.prevYearBtn = document.getElementById('focus-prev-year');
    el.nextYearBtn = document.getElementById('focus-next-year');
    el.summaryBar = document.getElementById('focus-summary-bar');

    el.timerSkill = document.getElementById('timer-skill-select');
    el.timerModeBtns = document.querySelectorAll('.timer-mode-chip');
    el.timerPresetRow = document.getElementById('timer-preset-row');
    el.timerPresetBtns = document.querySelectorAll('.timer-preset-chip');
    el.timerDisplay = document.getElementById('timer-display');
    el.timerStartBtn = document.getElementById('timer-start-btn');
    el.timerStopSaveBtn = document.getElementById('timer-stop-save-btn');
    el.timerResetBtn = document.getElementById('timer-reset-btn');

    el.addSkillForm = document.getElementById('focus-add-skill-form');
    el.skillName = document.getElementById('focus-skill-name');
    el.skillIcon = document.getElementById('focus-skill-icon');
    el.skillColor = document.getElementById('focus-skill-color');
    el.skillGoal = document.getElementById('focus-skill-goal');

    el.skillsList = document.getElementById('focus-skills-list');

    el.logDialog = document.getElementById('focus-log-dialog');
    el.logForm = document.getElementById('focus-log-form');
    el.logTitle = document.getElementById('focus-log-title');
    el.logSkillId = document.getElementById('focus-log-skill-id');
    el.logDate = document.getElementById('focus-log-date');
    el.logMinutes = document.getElementById('focus-log-minutes');
    el.logNotes = document.getElementById('focus-log-notes');
    el.logCancelBtn = document.getElementById('focus-log-cancel-btn');
    el.logQuickMins = document.querySelectorAll('.focus-quick-min');
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toDateStr(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function formatDuration(totalMin) {
    const m = Math.round(totalMin || 0);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }

  function formatClock(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  }

  function hexToRgba(hex, alpha) {
    const clean = (hex || '#00f0ff').replace('#', '');
    if (clean.length !== 6) return `rgba(0, 240, 255, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (_) {}
  }

  async function loadAll() {
    if (!db || !user) return;

    const [skillsRes, sessionsRes] = await Promise.all([
      db.from('focus_skills').select('*').order('created_at', { ascending: true }),
      db.from('focus_sessions').select('*').order('session_date', { ascending: false }).limit(5000),
    ]);

    if (skillsRes.error) window.appShowError(`Chyba aktivit: ${skillsRes.error.message}`);
    if (sessionsRes.error) window.appShowError(`Chyba fokus záznamů: ${sessionsRes.error.message}`);

    skills = (skillsRes.data || []).map((s) => ({
      ...s,
      milestones: Array.isArray(s.milestones) ? s.milestones : [],
    }));
    sessions = sessionsRes.data || [];

    syncTimerSkillOptions();
    renderAll();
  }

  function syncTimerSkillOptions() {
    if (!el.timerSkill) return;
    if (!skills.length) {
      el.timerSkill.innerHTML = '<option value="">Nejdřív přidej aktivitu dole</option>';
      return;
    }
    if (!timerState.skillId || !skills.some((s) => s.id === timerState.skillId)) {
      timerState.skillId = skills[0].id;
    }
    el.timerSkill.innerHTML = skills
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === timerState.skillId ? 'selected' : ''}>${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`
      )
      .join('');
  }

  function computeSkillStreak(dateMinutesMap) {
    let streak = 0;
    const cursor = new Date();
    if (!dateMinutesMap[toDateStr(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dateMinutesMap[toDateStr(cursor)] > 0) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function buildHeatmapHtml(skill, dateMinutesMap, year) {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const today = todayStr();

    const startWeekday = (jan1.getDay() + 6) % 7;
    const startDate = new Date(year, 0, 1 - startWeekday);

    const endWeekday = (dec31.getDay() + 6) % 7;
    const endDate = new Date(year, 11, 31 + (6 - endWeekday));

    const weeks = [];
    const monthPositions = {};
    let cursor = new Date(startDate);
    let weekIdx = 0;

    while (cursor <= endDate) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const inYear = cursor.getFullYear() === year;
        const dStr = toDateStr(cursor);
        if (inYear && cursor.getDate() === 1) {
          monthPositions[cursor.getMonth()] = weekIdx;
        }
        days.push({
          inYear,
          dateStr: dStr,
          minutes: inYear ? dateMinutesMap[dStr] || 0 : 0,
          isToday: dStr === today,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(days);
      weekIdx++;
    }

    const monthRowHtml = weeks
      .map((_, i) => {
        const foundMonth = Object.entries(monthPositions).find(([, col]) => col === i);
        return `<span class="hm-month-cell">${foundMonth ? MONTH_SHORT[Number(foundMonth[0])] : ''}</span>`;
      })
      .join('');

    const goal = Math.max(10, Number(skill.daily_goal_min) || 30);

    const weeksHtml = weeks
      .map((days) => {
        const cells = days
          .map((cell) => {
            if (!cell.inYear) return '<span class="hm-cell hm-out"></span>';

            let bg = 'rgba(255, 255, 255, 0.05)';
            if (cell.minutes > 0) {
              const ratio = cell.minutes / goal;
              const alpha = ratio >= 1.5 ? 1 : ratio >= 1 ? 0.78 : ratio >= 0.5 ? 0.52 : 0.3;
              bg = hexToRgba(skill.color, alpha);
            }

            const title = `${cell.dateStr}: ${formatDuration(cell.minutes)} (klikni pro zápis)`;
            return `<button type="button" class="hm-cell ${cell.isToday ? 'hm-today' : ''}" style="background:${bg};" data-hm-skill="${skill.id}" data-hm-date="${cell.dateStr}" title="${title}" aria-label="${title}"></button>`;
          })
          .join('');
        return `<div class="hm-col">${cells}</div>`;
      })
      .join('');

    return `
      <div class="hm-scroll">
        <div class="hm-inner">
          <div class="hm-months-row">${monthRowHtml}</div>
          <div class="hm-body">
            <div class="hm-weekdays mono">
              <span>Po</span><span></span><span>St</span><span></span><span>Pá</span><span></span><span></span>
            </div>
            <div class="hm-grid">${weeksHtml}</div>
          </div>
        </div>
      </div>
    `;
  }

  function buildMilestonesHtml(skill) {
    const ms = skill.milestones || [];
    const doneCnt = ms.filter((m) => m.done).length;
    const pct = ms.length ? Math.round((doneCnt / ms.length) * 100) : 0;
    const isOpen = openMilestones.has(skill.id);

    const itemsHtml = ms.length
      ? ms
          .map(
            (m, idx) => `
            <div class="ms-row ${m.done ? 'done' : ''}">
              <label class="ms-label">
                <input type="checkbox" class="subtask-check ms-check" data-ms-skill="${skill.id}" data-ms-idx="${idx}" ${m.done ? 'checked' : ''}>
                <span class="ms-text">${escapeHtml(m.text)}</span>
              </label>
              <div class="ms-right">
                ${m.done && m.done_date ? `<span class="mono muted" style="font-size:0.7rem;">${m.done_date}</span>` : ''}
                <button type="button" class="icon-btn delete ms-del-btn" data-ms-skill="${skill.id}" data-ms-idx="${idx}" title="Smazat milník">✕</button>
              </div>
            </div>
          `
          )
          .join('')
      : '<p class="muted" style="font-size:0.8rem;">Zatím žádné milníky — přidej si kapitoly nebo cíle (např. Lean 4: Taktiky, Indukce...).</p>';

    return `
      <details class="skill-milestones" data-ms-details="${skill.id}" ${isOpen ? 'open' : ''}>
        <summary class="ms-summary">
          <span class="ms-summary-title">Roadmapa / Milníky (${doneCnt}/${ms.length})</span>
          <div class="ms-summary-right">
            ${
              ms.length
                ? `<div class="ms-mini-track"><div class="ms-mini-fill" style="width:${pct}%; background:${skill.color};"></div></div><span class="mono" style="font-size:0.74rem; color:${skill.color};">${pct}%</span>`
                : '<span class="muted" style="font-size:0.76rem;">+50 XP / milník</span>'
            }
          </div>
        </summary>
        <div class="ms-body">
          <div class="ms-list">${itemsHtml}</div>
          <div class="ms-add-row">
            <input type="text" class="ms-input" data-ms-input="${skill.id}" placeholder="+ Přidat kapitolu / milník (+50 XP, max 2/den)..." maxlength="120">
            <button type="button" class="btn btn-ghost ms-add-btn" data-ms-add="${skill.id}">+ Přidat</button>
          </div>
        </div>
      </details>
    `;
  }

  function renderAll() {
    if (!el.skillsList) return;
    if (el.yearLabel) el.yearLabel.textContent = String(selectedYear);

    const today = todayStr();
    const todayTotal = sessions
      .filter((s) => s.session_date === today)
      .reduce((sum, s) => sum + Number(s.minutes), 0);
    const yearTotal = sessions
      .filter((s) => s.session_date.startsWith(`${selectedYear}-`))
      .reduce((sum, s) => sum + Number(s.minutes), 0);
    const allTimeTotal = sessions.reduce((sum, s) => sum + Number(s.minutes), 0);
    const totalMilestonesDone = skills.reduce(
      (sum, sk) => sum + (sk.milestones || []).filter((m) => m.done).length,
      0
    );

    if (el.summaryBar) {
      el.summaryBar.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">Dnes odpracováno</span><span class="kpi-value kpi-accent mono">${formatDuration(todayTotal)}</span><span class="kpi-sub">1 XP/min do 4h (cap 300 XP/d)</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Rok ${selectedYear}</span><span class="kpi-value mono">${formatDuration(yearTotal)}</span><span class="kpi-sub">${skills.length} sledovaných aktivit</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Celkový Deep Work</span><span class="kpi-value mono">${formatDuration(allTimeTotal)}</span><span class="kpi-sub">${totalMilestonesDone} splněných milníků</span></div>`,
      ].join('');
    }

    if (!skills.length) {
      el.skillsList.innerHTML =
        '<p class="empty-state">Zatím nemáš přidanou žádnou aktivitu. Přidej si třeba Lean 4, Matematiku, Kódování nebo Šachy.</p>';
      return;
    }

    const mapBySkill = {};
    const totalBySkill = {};
    const yearTotalBySkill = {};
    sessions.forEach((s) => {
      if (!mapBySkill[s.skill_id]) mapBySkill[s.skill_id] = {};
      mapBySkill[s.skill_id][s.session_date] =
        (mapBySkill[s.skill_id][s.session_date] || 0) + Number(s.minutes);
      totalBySkill[s.skill_id] = (totalBySkill[s.skill_id] || 0) + Number(s.minutes);
      if (s.session_date.startsWith(`${selectedYear}-`)) {
        yearTotalBySkill[s.skill_id] = (yearTotalBySkill[s.skill_id] || 0) + Number(s.minutes);
      }
    });

    el.skillsList.innerHTML = skills
      .map((skill) => {
        const dateMap = mapBySkill[skill.id] || {};
        const totalMin = totalBySkill[skill.id] || 0;
        const yearMin = yearTotalBySkill[skill.id] || 0;
        const todayMin = dateMap[today] || 0;
        const streak = computeSkillStreak(dateMap);
        const skillLvl = Math.floor(totalMin / 300) + 1;

        return `
          <article class="card skill-card" style="--skill-color: ${skill.color};">
            <div class="skill-card-head">
              <div class="skill-title-wrap">
                <span class="skill-icon">${escapeHtml(skill.icon)}</span>
                <div>
                  <div class="skill-name-row">
                    <h3>${escapeHtml(skill.name)}</h3>
                    <span class="skill-lvl mono">LVL ${skillLvl}</span>
                  </div>
                  <div class="skill-time mono">
                    ${formatDuration(yearMin)} <span class="muted">(${selectedYear}) · celkem ${formatDuration(totalMin)} · cíl ${skill.daily_goal_min}m/d</span>
                  </div>
                </div>
              </div>

              <div class="skill-head-actions">
                <button type="button" class="btn-today ${todayMin > 0 ? 'done' : ''}" data-log-today="${skill.id}">
                  ${todayMin > 0 ? `✓ Dnes ${formatDuration(todayMin)}` : '+ Dnes'}
                </button>
                <span class="skill-streak mono ${streak > 0 ? 'active' : ''}" title="Streak aktivity">🔥 ${streak}</span>
                <button type="button" class="icon-btn delete" data-del-skill="${skill.id}" title="Smazat aktivitu">✕</button>
              </div>
            </div>

            ${buildHeatmapHtml(skill, dateMap, selectedYear)}
            ${buildMilestonesHtml(skill)}
          </article>
        `;
      })
      .join('');
  }

  async function updateSkillMilestones(skillId, nextMilestones) {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    const prev = skill.milestones;
    skill.milestones = nextMilestones;
    openMilestones.add(skillId);
    renderAll();

    const { error } = await db
      .from('focus_skills')
      .update({ milestones: nextMilestones })
      .eq('id', skillId);

    if (error) {
      skill.milestones = prev;
      renderAll();
      window.appShowError(`Chyba milníku: ${error.message}`);
      return;
    }

    window.ProgressModule?.refresh();
  }

  async function addMilestoneFromInput(skillId) {
    const input = el.skillsList.querySelector(`[data-ms-input="${skillId}"]`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;

    const next = [
      ...(skill.milestones || []),
      { id: crypto.randomUUID(), text, done: false, done_date: null },
    ];
    await updateSkillMilestones(skillId, next);
  }

  // --- Živý časovač ---
  function getElapsedSeconds() {
    let sec = timerState.accumulatedSec || 0;
    if (timerState.running && timerState.startedAt) {
      sec += Math.floor((Date.now() - timerState.startedAt) / 1000);
    }
    return sec;
  }

  function updateTimerUI() {
    if (!el.timerDisplay) return;
    const elapsed = getElapsedSeconds();

    if (timerState.mode === 'countdown') {
      const targetSec = (timerState.targetMin || 45) * 60;
      const remaining = Math.max(0, targetSec - elapsed);
      el.timerDisplay.textContent = formatClock(remaining);
      if (timerState.running && remaining === 0) {
        timerState.accumulatedSec = targetSec;
        timerState.running = false;
        timerState.startedAt = null;
        saveTimerState();
        stopTimerTick();
        playBeep();
        window.appShowToast('Časovač dokončen! Klikni na „Uložit čas“.');
      }
    } else {
      el.timerDisplay.textContent = formatClock(elapsed);
    }

    el.timerStartBtn.textContent = timerState.running ? '⏸ Pauza' : elapsed > 0 ? '▶ Pokračovat' : '▶ Start';
    el.timerStopSaveBtn.disabled = elapsed < 60;
    el.timerPresetRow.classList.toggle('hidden', timerState.mode !== 'countdown');

    el.timerModeBtns.forEach((b) => b.classList.toggle('active', b.dataset.timerMode === timerState.mode));
    el.timerPresetBtns.forEach((b) =>
      b.classList.toggle('active', Number(b.dataset.timerMin) === Number(timerState.targetMin))
    );
  }

  function startTimerTick() {
    stopTimerTick();
    timerInterval = setInterval(updateTimerUI, 1000);
  }

  function stopTimerTick() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  async function saveSession(skillId, dateStr, minutes, notes = null) {
    const { error } = await db.from('focus_sessions').insert([
      {
        user_id: user.id,
        skill_id: skillId,
        session_date: dateStr,
        minutes: Math.max(1, Math.round(minutes)),
        notes: notes || null,
      },
    ]);

    if (error) {
      window.appShowError(`Chyba ukládání času: ${error.message}`);
      return false;
    }

    window.appShowToast(`Zapsáno ${formatDuration(minutes)} fokusu.`);
    await loadAll();
    window.ProgressModule?.refresh();
    return true;
  }

  function openLogDialog(skillId, dateStr) {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    el.logSkillId.value = skill.id;
    el.logTitle.textContent = `${skill.icon} ${skill.name} · Zapsat čas`;
    el.logDate.value = dateStr || todayStr();
    el.logMinutes.value = skill.daily_goal_min || 30;
    el.logNotes.value = '';
    el.logDialog.showModal();
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    el.prevYearBtn.addEventListener('click', () => {
      selectedYear--;
      renderAll();
    });
    el.nextYearBtn.addEventListener('click', () => {
      selectedYear++;
      renderAll();
    });

    el.timerSkill.addEventListener('change', () => {
      timerState.skillId = el.timerSkill.value;
      saveTimerState();
    });

    el.timerModeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (timerState.running) return;
        timerState.mode = btn.dataset.timerMode;
        saveTimerState();
        updateTimerUI();
      });
    });

    el.timerPresetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (timerState.running) return;
        timerState.targetMin = Number(btn.dataset.timerMin);
        timerState.accumulatedSec = 0;
        saveTimerState();
        updateTimerUI();
      });
    });

    el.timerStartBtn.addEventListener('click', () => {
      if (!skills.length) {
        window.appShowError('Nejdřív vytvoř alespoň jednu aktivitu.');
        return;
      }
      timerState.skillId = el.timerSkill.value || skills[0].id;
      if (timerState.running) {
        timerState.accumulatedSec = getElapsedSeconds();
        timerState.running = false;
        timerState.startedAt = null;
        stopTimerTick();
      } else {
        timerState.running = true;
        timerState.startedAt = Date.now();
        startTimerTick();
      }
      saveTimerState();
      updateTimerUI();
    });

    el.timerResetBtn.addEventListener('click', () => {
      timerState.running = false;
      timerState.startedAt = null;
      timerState.accumulatedSec = 0;
      stopTimerTick();
      saveTimerState();
      updateTimerUI();
    });

    el.timerStopSaveBtn.addEventListener('click', async () => {
      const elapsedSec = getElapsedSeconds();
      const mins = Math.max(1, Math.round(elapsedSec / 60));
      const skillId = el.timerSkill.value || timerState.skillId;
      if (!skillId) return;

      const ok = await saveSession(skillId, todayStr(), mins, 'Časovač');
      if (ok) {
        timerState.running = false;
        timerState.startedAt = null;
        timerState.accumulatedSec = 0;
        stopTimerTick();
        saveTimerState();
        updateTimerUI();
      }
    });

    el.addSkillForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!user) return;
      const name = el.skillName.value.trim();
      if (!name) return;

      const { error } = await db.from('focus_skills').insert([
        {
          user_id: user.id,
          name,
          icon: el.skillIcon.value.trim() || '⚡',
          color: el.skillColor.value || '#00f0ff',
          daily_goal_min: Number(el.skillGoal.value) || 30,
          milestones: [],
        },
      ]);

      if (error) {
        window.appShowError(`Chyba přidání aktivity: ${error.message}`);
        return;
      }

      el.skillName.value = '';
      window.appShowToast(`Aktivita „${name}“ přidána.`);
      await loadAll();
    });

    // Sledování otevření/zavření sekce Milníky
    el.skillsList.addEventListener(
      'toggle',
      (e) => {
        const det = e.target;
        if (det.matches && det.matches('[data-ms-details]')) {
          const sid = det.dataset.msDetails;
          if (det.open) openMilestones.add(sid);
          else openMilestones.delete(sid);
        }
      },
      true
    );

    el.skillsList.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('ms-input')) {
        e.preventDefault();
        addMilestoneFromInput(e.target.dataset.msInput);
      }
    });

    el.skillsList.addEventListener('click', async (e) => {
      // Přidání milníku
      const msAddBtn = e.target.closest('[data-ms-add]');
      if (msAddBtn) {
        await addMilestoneFromInput(msAddBtn.dataset.msAdd);
        return;
      }

      // Smazání milníku
      const msDelBtn = e.target.closest('.ms-del-btn');
      if (msDelBtn) {
        const sid = msDelBtn.dataset.msSkill;
        const idx = Number(msDelBtn.dataset.msIdx);
        const skill = skills.find((s) => s.id === sid);
        if (!skill) return;
        const next = skill.milestones.filter((_, i) => i !== idx);
        await updateSkillMilestones(sid, next);
        return;
      }

      // Odškrtnutí milníku
      if (e.target.classList.contains('ms-check')) {
        const sid = e.target.dataset.msSkill;
        const idx = Number(e.target.dataset.msIdx);
        const skill = skills.find((s) => s.id === sid);
        if (!skill) return;
        const checked = e.target.checked;
        const next = skill.milestones.map((m, i) =>
          i === idx ? { ...m, done: checked, done_date: checked ? todayStr() : null } : m
        );
        await updateSkillMilestones(sid, next);
        return;
      }

      // Smazání celé aktivity
      const delBtn = e.target.closest('[data-del-skill]');
      if (delBtn) {
        if (!confirm('Smazat tuto aktivitu včetně celé její roční historie a milníků?')) return;
        const { error } = await db.from('focus_skills').delete().eq('id', delBtn.dataset.delSkill);
        if (error) {
          window.appShowError(`Chyba mazání: ${error.message}`);
          return;
        }
        window.appShowToast('Aktivita smazána.');
        await loadAll();
        window.ProgressModule?.refresh();
        return;
      }

      const todayBtn = e.target.closest('[data-log-today]');
      if (todayBtn) {
        openLogDialog(todayBtn.dataset.logToday, todayStr());
        return;
      }

      const hmCell = e.target.closest('[data-hm-skill]');
      if (hmCell) {
        openLogDialog(hmCell.dataset.hmSkill, hmCell.dataset.hmDate);
      }
    });

    el.logQuickMins.forEach((btn) => {
      btn.addEventListener('click', () => {
        el.logMinutes.value = btn.dataset.quickMin;
      });
    });

    el.logCancelBtn.addEventListener('click', () => el.logDialog.close());

    el.logForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const skillId = el.logSkillId.value;
      const dateStr = el.logDate.value;
      const mins = Number(el.logMinutes.value);
      const notes = el.logNotes.value.trim();
      if (!skillId || !dateStr || !mins) return;

      const ok = await saveSession(skillId, dateStr, mins, notes);
      if (ok) el.logDialog.close();
    });
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      if (timerState.running) startTimerTick();
      updateTimerUI();
      loadAll();
    },
    refresh() {
      loadAll();
    },
    onShow() {
      updateTimerUI();
      loadAll();
    },
    reset() {
      user = null;
      skills = [];
      sessions = [];
      openMilestones.clear();
      stopTimerTick();
    },
  };
})();