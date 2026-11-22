window.FocusModule = (() => {
  let db = null;
  let user = null;
  let skills = [];
  let sessions = [];
  let selectedYear = new Date().getFullYear();
  let initializedListeners = false;

  // Stav živého časovače (ukládá se do localStorage, takže běží i po přepnutí záložky/obnovení)
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
      mode: 'stopwatch', // 'stopwatch' | 'countdown'
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

    // Časovač
    el.timerSkill = document.getElementById('timer-skill-select');
    el.timerModeBtns = document.querySelectorAll('.timer-mode-chip');
    el.timerPresetRow = document.getElementById('timer-preset-row');
    el.timerPresetBtns = document.querySelectorAll('.timer-preset-chip');
    el.timerDisplay = document.getElementById('timer-display');
    el.timerStartBtn = document.getElementById('timer-start-btn');
    el.timerStopSaveBtn = document.getElementById('timer-stop-save-btn');
    el.timerResetBtn = document.getElementById('timer-reset-btn');

    // Přidání nové aktivity
    el.addSkillForm = document.getElementById('focus-add-skill-form');
    el.skillName = document.getElementById('focus-skill-name');
    el.skillIcon = document.getElementById('focus-skill-icon');
    el.skillColor = document.getElementById('focus-skill-color');
    el.skillGoal = document.getElementById('focus-skill-goal');

    // Karty s heatmapami
    el.skillsList = document.getElementById('focus-skills-list');

    // Dialog pro ruční zápis času
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

    skills = skillsRes.data || [];
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

    // Začátek na pondělí týdne, ve kterém je 1. leden
    const startWeekday = (jan1.getDay() + 6) % 7; // Po=0..Ne=6
    const startDate = new Date(year, 0, 1 - startWeekday);

    // Konec na neděli týdne, ve kterém je 31. prosinec
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

    // Hlavička měsíců zarovnaná nad sloupce týdnů
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

  function renderAll() {
    if (!el.skillsList) return;
    if (el.yearLabel) el.yearLabel.textContent = String(selectedYear);

    // Souhrn nahoře
    const today = todayStr();
    const todayTotal = sessions
      .filter((s) => s.session_date === today)
      .reduce((sum, s) => sum + Number(s.minutes), 0);
    const yearTotal = sessions
      .filter((s) => s.session_date.startsWith(`${selectedYear}-`))
      .reduce((sum, s) => sum + Number(s.minutes), 0);
    const allTimeTotal = sessions.reduce((sum, s) => sum + Number(s.minutes), 0);

    if (el.summaryBar) {
      el.summaryBar.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">Dnes odpracováno</span><span class="kpi-value kpi-accent mono">${formatDuration(todayTotal)}</span><span class="kpi-sub">+${todayTotal} XP dnes</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Rok ${selectedYear}</span><span class="kpi-value mono">${formatDuration(yearTotal)}</span><span class="kpi-sub">${skills.length} sledovaných aktivit</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Celkový Deep Work</span><span class="kpi-value mono">${formatDuration(allTimeTotal)}</span><span class="kpi-sub">Celkem ${allTimeTotal.toLocaleString('cs-CZ')} XP</span></div>`,
      ].join('');
    }

    if (!skills.length) {
      el.skillsList.innerHTML =
        '<p class="empty-state">Zatím nemáš přidanou žádnou aktivitu. Přidej si třeba Kódování, Matematiku nebo Šachy.</p>';
      return;
    }

    // Seskupení minut podle skillu a data
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
        const skillLvl = Math.floor(totalMin / 300) + 1; // +1 Mastery Level každých 5 hodin

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
          </article>
        `;
      })
      .join('');
  }

  // --- Logika živého časovače ---
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

    window.appShowToast(`Zapsáno ${formatDuration(minutes)} (+${Math.round(minutes)} XP).`);
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

    // Časovač
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

    // Přidání nové aktivity
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

    // Kliknutí na karty aktivit (Dnes, čtvereček heatmapy, smazat)
    el.skillsList.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-del-skill]');
      if (delBtn) {
        if (!confirm('Smazat tuto aktivitu včetně celé její roční historie?')) return;
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

    // Dialog ručního zápisu
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
      stopTimerTick();
    },
  };
})();