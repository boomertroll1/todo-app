window.FocusModule = (() => {
  let db = null;
  let user = null;
  let skills = [];
  let sessions = [];
  let plans = [];
  let selectedYear = new Date().getFullYear();
  let selectedPlanDate = '';
  let openMilestones = new Set();
  let initializedListeners = false;

  let timerInterval = null;
  let timerState = loadTimerState();

  const MONTH_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];
  const QUICK_NOTE = 'Odškrtnuto';
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

    el.progressText = document.getElementById('focus-progress-text');
    el.progressFill = document.getElementById('focus-progress-fill');
    el.comboBadge = document.getElementById('focus-combo-badge');

    // Plánovač dnů
    el.planForm = document.getElementById('focus-plan-form');
    el.planDate = document.getElementById('focus-plan-date');
    el.planSkill = document.getElementById('focus-plan-skill');
    el.planMinutes = document.getElementById('focus-plan-minutes');
    el.planList = document.getElementById('focus-plan-list');
    el.planDateLabel = document.getElementById('focus-plan-date-label');

    // Časovač
    el.timerSkill = document.getElementById('timer-skill-select');
    el.timerModeBtns = document.querySelectorAll('.timer-mode-chip');
    el.timerPresetRow = document.getElementById('timer-preset-row');
    el.timerPresetBtns = document.querySelectorAll('.timer-preset-chip');
    el.timerDisplay = document.getElementById('timer-display');
    el.timerStartBtn = document.getElementById('timer-start-btn');
    el.timerStopSaveBtn = document.getElementById('timer-stop-save-btn');
    el.timerResetBtn = document.getElementById('timer-reset-btn');

    // Přidání aktivity (bez pole pro datum)
    el.addSkillForm = document.getElementById('focus-add-skill-form');
    el.skillName = document.getElementById('focus-skill-name');
    el.skillColor = document.getElementById('focus-skill-color');
    el.skillGoal = document.getElementById('focus-skill-goal');

    // Seznam & archiv
    el.skillsList = document.getElementById('focus-skills-list');
    el.completedWrap = document.getElementById('focus-completed-wrap');
    el.completedList = document.getElementById('focus-completed-list');
    el.completedCount = document.getElementById('focus-completed-count');

    // Dialog ručního zápisu času
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

  function getMondayOfCurrentWeekStr() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7; // Po = 0
    d.setDate(d.getDate() - day);
    return toDateStr(d);
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

    const [skillsRes, sessionsRes, plansRes] = await Promise.all([
      db.from('focus_skills').select('*').order('created_at', { ascending: true }),
      db.from('focus_sessions').select('*').order('session_date', { ascending: false }).limit(5000),
      db.from('focus_plans').select('*').order('plan_date', { ascending: true }).order('created_at', { ascending: true }).limit(1000),
    ]);

    if (skillsRes.error) window.appShowError(`Chyba aktivit: ${skillsRes.error.message}`);
    if (sessionsRes.error) window.appShowError(`Chyba fokus záznamů: ${sessionsRes.error.message}`);
    if (plansRes.error) window.appShowError(`Chyba plánů: ${plansRes.error.message}`);

    skills = (skillsRes.data || []).map((s) => ({
      ...s,
      milestones: Array.isArray(s.milestones) ? s.milestones : [],
    }));
    sessions = sessionsRes.data || [];
    plans = plansRes.data || [];

    syncSkillSelects();
    renderAll();
  }

  function syncSkillSelects() {
    const activeSkills = skills.filter((s) => !s.is_completed);
    const optionsHtml = activeSkills.length
      ? activeSkills.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')
      : '<option value="">Nejdřív přidej aktivitu dole</option>';

    if (el.timerSkill) {
      if (!timerState.skillId || !activeSkills.some((s) => s.id === timerState.skillId)) {
        timerState.skillId = activeSkills[0]?.id || '';
      }
      el.timerSkill.innerHTML = optionsHtml;
      if (timerState.skillId) el.timerSkill.value = timerState.skillId;
    }

    if (el.planSkill) {
      const prev = el.planSkill.value;
      el.planSkill.innerHTML = optionsHtml;
      if (prev && activeSkills.some((s) => s.id === prev)) {
        el.planSkill.value = prev;
      }
    }
  }

  function computeSkillStreak(dateMetaMap) {
    let streak = 0;
    const cursor = new Date();
    if (!dateMetaMap[toDateStr(cursor)]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dateMetaMap[toDateStr(cursor)]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function buildHeatmapHtml(skill, dateMetaMap, year) {
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
          meta: inYear ? dateMetaMap[dStr] || null : null,
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
            let labelTxt = '0m';
            if (cell.meta) {
              if (cell.meta.realMin > 0) {
                const ratio = cell.meta.realMin / goal;
                const alpha = ratio >= 1.5 ? 1 : ratio >= 1 ? 0.78 : ratio >= 0.5 ? 0.52 : 0.32;
                bg = hexToRgba(skill.color, alpha);
                labelTxt = formatDuration(cell.meta.realMin);
              } else if (cell.meta.quickCheck) {
                bg = hexToRgba(skill.color, 0.82);
                labelTxt = 'Splněno ✓';
              }
            }

            const title = `${cell.dateStr}: ${labelTxt} (klikni pro zápis času)`;
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
                : '<span class="muted" style="font-size:0.76rem;">+25 XP / milník</span>'
            }
          </div>
        </summary>
        <div class="ms-body">
          <div class="ms-list">${itemsHtml}</div>
          <div class="ms-add-row">
            <input type="text" class="ms-input" data-ms-input="${skill.id}" placeholder="+ Přidat kapitolu / milník (+25 XP, max 2/den)..." maxlength="120">
            <button type="button" class="btn btn-ghost ms-add-btn" data-ms-add="${skill.id}">+ Přidat</button>
          </div>
        </div>
      </details>
    `;
  }

  function renderPlanSection(metaBySkill) {
    if (!el.planList) return;
    const planDate = selectedPlanDate || todayStr();
    const skillMap = new Map(skills.map((s) => [s.id, s]));

    if (el.planDateLabel) {
      el.planDateLabel.textContent = planDate === todayStr() ? 'Plán na dnešek' : `Plán na ${planDate}`;
    }

    const dayPlans = plans.filter((p) => p.plan_date === planDate);
    if (!dayPlans.length) {
      el.planList.innerHTML =
        '<p class="muted" style="font-size:0.84rem; text-align:center; padding:6px 0;">Na tento den nemáš nic naplánovaného. Přidej si třeba 60 min Šachů nebo Matiky — hned se to propíše i do Kalendáře.</p>';
      return;
    }

    el.planList.innerHTML = dayPlans
      .map((p) => {
        const sk = skillMap.get(p.skill_id);
        const name = sk ? sk.name : 'Smazaná aktivita';
        const color = sk?.color || '#00f0ff';
        const loggedMin = metaBySkill[p.skill_id]?.[planDate]?.realMin || 0;
        const pct = Math.min(100, Math.round((loggedMin / Math.max(1, p.target_minutes)) * 100));
        const isDone = loggedMin >= p.target_minutes;
        const remaining = Math.max(0, p.target_minutes - loggedMin);

        return `
          <div class="plan-row ${isDone ? 'done' : ''}" style="--plan-color:${color};">
            <div class="plan-main">
              <div class="plan-head">
                <span class="plan-dot" style="background:${color};"></span>
                <span class="plan-name">${escapeHtml(name)}</span>
                <span class="badge ${isDone ? 'badge-low' : 'badge-gym'} mono">${loggedMin} / ${p.target_minutes} min</span>
              </div>
              <div class="subtask-progress-track" style="margin-top:6px;">
                <div class="subtask-progress-fill" style="width:${pct}%; background:${color};"></div>
              </div>
            </div>
            <div class="plan-actions">
              ${
                !isDone
                  ? `<button type="button" class="btn btn-xs btn-ghost" data-complete-plan="${p.id}" data-plan-skill="${p.skill_id}" data-plan-date="${planDate}" data-plan-rem="${remaining}" title="Zapsat zbývajících ${remaining} min do fokusu">✓ +${remaining}m</button>`
                  : '<span class="badge badge-low mono">SPLNĚNO</span>'
              }
              <button type="button" class="icon-btn delete" data-del-plan="${p.id}" title="Smazat z plánu">✕</button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderAll() {
    if (!el.skillsList) return;
    if (el.yearLabel) el.yearLabel.textContent = String(selectedYear);

    const today = todayStr();
    const weekStart = getMondayOfCurrentWeekStr();
    const monthPrefix = today.slice(0, 7);

    const metaBySkill = {};
    const totalRealMinBySkill = {};
    const yearRealMinBySkill = {};
    const weekRealMinBySkill = {};
    const monthRealMinBySkill = {};

    let todayRealTotal = 0;
    let weekRealTotal = 0;
    let monthRealTotal = 0;
    let allTimeRealTotal = 0;

    sessions.forEach((s) => {
      const isQuick = s.notes === QUICK_NOTE;
      const mins = isQuick ? 0 : Number(s.minutes) || 0;

      if (!metaBySkill[s.skill_id]) metaBySkill[s.skill_id] = {};
      if (!metaBySkill[s.skill_id][s.session_date]) {
        metaBySkill[s.skill_id][s.session_date] = { realMin: 0, quickCheck: false };
      }
      if (isQuick) {
        metaBySkill[s.skill_id][s.session_date].quickCheck = true;
      } else {
        metaBySkill[s.skill_id][s.session_date].realMin += mins;
        totalRealMinBySkill[s.skill_id] = (totalRealMinBySkill[s.skill_id] || 0) + mins;
        allTimeRealTotal += mins;
        if (s.session_date === today) todayRealTotal += mins;
        if (s.session_date >= weekStart) {
          weekRealMinBySkill[s.skill_id] = (weekRealMinBySkill[s.skill_id] || 0) + mins;
          weekRealTotal += mins;
        }
        if (s.session_date.startsWith(monthPrefix)) {
          monthRealMinBySkill[s.skill_id] = (monthRealMinBySkill[s.skill_id] || 0) + mins;
          monthRealTotal += mins;
        }
        if (s.session_date.startsWith(`${selectedYear}-`)) {
          yearRealMinBySkill[s.skill_id] = (yearRealMinBySkill[s.skill_id] || 0) + mins;
        }
      }
    });

    renderPlanSection(metaBySkill);

    const activeSkills = skills.filter((s) => !s.is_completed);
    const completedSkills = skills.filter((s) => s.is_completed);

    const doneTodayCount = activeSkills.filter((s) => Boolean(metaBySkill[s.id]?.[today])).length;
    const totalActive = activeSkills.length;
    const todayPct = totalActive ? Math.round((doneTodayCount / totalActive) * 100) : 0;

    if (el.progressText) el.progressText.textContent = `${doneTodayCount} / ${totalActive} dnes`;
    if (el.progressFill) el.progressFill.style.width = `${todayPct}%`;
    if (el.comboBadge) {
      const hasCombo = totalActive >= 3 && doneTodayCount === totalActive;
      el.comboBadge.textContent = hasCombo
        ? 'COMBO +15 XP AKTIVNÍ'
        : '100 % (min. 3) = +15 XP Combo';
      el.comboBadge.classList.toggle('combo-active', hasCombo);
    }

    if (el.summaryBar) {
      el.summaryBar.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">Dnes</span><span class="kpi-value kpi-accent mono">${formatDuration(todayRealTotal)}</span><span class="kpi-sub">${todayRealTotal} min (cap 120 XP/d)</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Tento týden</span><span class="kpi-value mono">${formatDuration(weekRealTotal)}</span><span class="kpi-sub">${weekRealTotal} min od pondělí</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Tento měsíc</span><span class="kpi-value mono">${formatDuration(monthRealTotal)}</span><span class="kpi-sub">${monthRealTotal} min</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Celkem</span><span class="kpi-value mono">${formatDuration(allTimeRealTotal)}</span><span class="kpi-sub">${allTimeRealTotal.toLocaleString('cs-CZ')} min celkem</span></div>`,
      ].join('');
    }

    if (!activeSkills.length) {
      el.skillsList.innerHTML =
        '<p class="empty-state">Zatím nemáš přidanou žádnou aktivitu. Přidej si třeba Lean 4, Šachy, Matematiku nebo Kreatin.</p>';
    } else {
      const sortedActive = [...activeSkills].sort((a, b) => {
        const aDone = metaBySkill[a.id]?.[today] ? 1 : 0;
        const bDone = metaBySkill[b.id]?.[today] ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return a.created_at.localeCompare(b.created_at);
      });

      el.skillsList.innerHTML = sortedActive
        .map((skill) => {
          const dateMap = metaBySkill[skill.id] || {};
          const totalMin = totalRealMinBySkill[skill.id] || 0;
          const weekMin = weekRealMinBySkill[skill.id] || 0;
          const monthMin = monthRealMinBySkill[skill.id] || 0;
          const todayMeta = dateMap[today] || null;
          const isDoneToday = Boolean(todayMeta);
          const totalDays = Object.keys(dateMap).length;
          const streak = computeSkillStreak(dateMap);
          const skillLvl = Math.floor(totalMin / 300) + 1;

          const daysBadge =
            totalDays > 0
              ? `<span class="badge badge-date mono">Odpracováno: ${totalDays}d</span>`
              : '';

          return `
            <article class="card skill-card ${isDoneToday ? 'skill-done-today' : ''}" style="--skill-color: ${skill.color};">
              <div class="skill-card-head">
                <div class="skill-title-wrap">
                  <input type="checkbox" class="todo-checkbox skill-quick-check" data-quick-skill="${skill.id}" ${isDoneToday ? 'checked' : ''} title="Rychle odškrtnout dnešní den (+10 XP)">
                  <div>
                    <div class="skill-name-row">
                      <h3>${escapeHtml(skill.name)}</h3>
                      <span class="skill-lvl mono">LVL ${skillLvl}</span>
                      ${daysBadge}
                    </div>
                    <div class="skill-time mono">
                      Cíl ${skill.daily_goal_min}m/d
                    </div>
                  </div>
                </div>

                <div class="skill-head-actions">
                  <button type="button" class="btn-today ${todayMeta?.realMin > 0 ? 'done' : ''}" data-log-today="${skill.id}">
                    ${todayMeta?.realMin > 0 ? formatDuration(todayMeta.realMin) : '+ Čas'}
                  </button>
                  <span class="skill-streak mono ${streak > 0 ? 'active' : ''}" title="Streak aktivity">${streak}d</span>
                  <button type="button" class="btn-finish-habit" data-finish-skill="${skill.id}" title="Uzavřít natrvalo jako naučené / dokončené (bonus XP od 5 dnů)">Hotovo</button>
                  <button type="button" class="icon-btn delete" data-del-skill="${skill.id}" title="Smazat aktivitu">✕</button>
                </div>
              </div>

              <!-- Menší statistika pro konkrétní aktivitu -->
              <div class="skill-stats-strip mono">
                <div class="skill-stat-box">
                  <span class="muted">Týden</span>
                  <strong>${formatDuration(weekMin)} <small class="muted">(${weekMin}m)</small></strong>
                </div>
                <div class="skill-stat-box">
                  <span class="muted">Měsíc</span>
                  <strong>${formatDuration(monthMin)} <small class="muted">(${monthMin}m)</small></strong>
                </div>
                <div class="skill-stat-box">
                  <span class="muted">Celkem</span>
                  <strong>${formatDuration(totalMin)} <small class="muted">(${totalMin} min)</small></strong>
                </div>
              </div>

              ${buildHeatmapHtml(skill, dateMap, selectedYear)}
              ${buildMilestonesHtml(skill)}
            </article>
          `;
        })
        .join('');
    }

    if (el.completedWrap && el.completedList && el.completedCount) {
      el.completedWrap.classList.toggle('hidden', completedSkills.length === 0);
      el.completedCount.textContent = String(completedSkills.length);
      el.completedList.innerHTML = completedSkills
        .map((skill) => {
          const dateMap = metaBySkill[skill.id] || {};
          const totalDays = Object.keys(dateMap).length;
          const totalMin = totalRealMinBySkill[skill.id] || 0;
          const bonus = totalDays >= 5 ? Math.min(150, totalDays * 5) : 0;
          const doneDate = (skill.completed_at || '').slice(0, 10);
          return `
            <div class="habit-item done">
              <div class="habit-main">
                <div class="habit-text-col">
                  <span class="habit-name">${escapeHtml(skill.name)}</span>
                  <div class="habit-sub-badges">
                    <span class="badge badge-low">Zvládnuto ${doneDate}</span>
                    <span class="badge badge-date mono">${totalDays}d · ${formatDuration(totalMin)} (${totalMin}m) · +${bonus} XP</span>
                  </div>
                </div>
              </div>
              <div class="habit-right">
                <button type="button" class="btn btn-ghost btn-xs" data-reopen-skill="${skill.id}" title="Znovu aktivovat">↺ Obnovit</button>
                <button type="button" class="icon-btn delete" data-del-skill="${skill.id}" title="Smazat">✕</button>
              </div>
            </div>
          `;
        })
        .join('');
    }
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

    if (notes !== QUICK_NOTE) {
      window.appShowToast(`Zapsáno ${formatDuration(minutes)} fokusu.`);
    }
    await loadAll();
    window.ProgressModule?.refresh();
    window.CalendarModule?.refresh();
    return true;
  }

  function openLogDialog(skillId, dateStr) {
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return;
    el.logSkillId.value = skill.id;
    el.logTitle.textContent = `${skill.name} · Zapsat čas`;
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

    // Plánovač dnů
    if (el.planDate) {
      el.planDate.addEventListener('change', () => {
        selectedPlanDate = el.planDate.value || todayStr();
        renderAll();
      });
    }

    if (el.planForm) {
      el.planForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user) return;
        const skillId = el.planSkill?.value;
        const planDate = el.planDate?.value || todayStr();
        const mins = Number(el.planMinutes?.value) || 60;
        if (!skillId) {
          window.appShowError('Nejdřív dole přidej alespoň jednu aktivitu.');
          return;
        }

        const { error } = await db.from('focus_plans').insert([
          {
            user_id: user.id,
            skill_id: skillId,
            plan_date: planDate,
            target_minutes: mins,
          },
        ]);

        if (error) {
          window.appShowError(`Chyba plánování: ${error.message}`);
          return;
        }

        selectedPlanDate = planDate;
        window.appShowToast('Přidáno do plánu i do Kalendáře.');
        await loadAll();
        window.CalendarModule?.refresh();
      });
    }

    if (el.planList) {
      el.planList.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-plan]');
        if (delBtn) {
          const { error } = await db.from('focus_plans').delete().eq('id', delBtn.dataset.delPlan);
          if (error) {
            window.appShowError(`Chyba mazání plánu: ${error.message}`);
            return;
          }
          await loadAll();
          window.CalendarModule?.refresh();
          return;
        }

        const compBtn = e.target.closest('[data-complete-plan]');
        if (compBtn) {
          const sid = compBtn.dataset.planSkill;
          const dStr = compBtn.dataset.planDate;
          const rem = Number(compBtn.dataset.planRem) || 30;
          await saveSession(sid, dStr, rem, 'Z plánu');
        }
      });
    }

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
      const activeSkills = skills.filter((s) => !s.is_completed);
      if (!activeSkills.length) {
        window.appShowError('Nejdřív vytvoř alespoň jednu aktivitu.');
        return;
      }
      timerState.skillId = el.timerSkill.value || activeSkills[0].id;
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
          icon: '',
          color: el.skillColor.value || '#00f0ff',
          daily_goal_min: Number(el.skillGoal.value) || 30,
          due_date: null,
          is_completed: false,
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

    const handleSkillAction = async (e) => {
      if (e.target.classList.contains('skill-quick-check')) {
        const skillId = e.target.dataset.quickSkill;
        const checked = e.target.checked;
        const today = todayStr();

        if (checked) {
          await saveSession(skillId, today, 1, QUICK_NOTE);
        } else {
          const { error } = await db
            .from('focus_sessions')
            .delete()
            .eq('skill_id', skillId)
            .eq('session_date', today)
            .eq('notes', QUICK_NOTE);

          if (error) {
            window.appShowError(`Chyba odškrtnutí: ${error.message}`);
            e.target.checked = true;
            return;
          }
          await loadAll();
          window.ProgressModule?.refresh();
          window.CalendarModule?.refresh();
        }
        return;
      }

      const finishBtn = e.target.closest('[data-finish-skill]');
      if (finishBtn) {
        const skillId = finishBtn.dataset.finishSkill;
        const skill = skills.find((s) => s.id === skillId);
        const uniqueDays = new Set(
          sessions.filter((s) => s.skill_id === skillId).map((s) => s.session_date)
        ).size;
        const bonusTxt =
          uniqueDays >= 5
            ? `Získáš jednorázový bonus +${Math.min(150, uniqueDays * 5)} XP za ${uniqueDays} odpracovaných dnů.`
            : `Odpracováno zatím jen ${uniqueDays} dnů (bonus za dokončení se uděluje od 5 dnů).`;

        if (!confirm(`Označit „${skill?.name}“ jako natrvalo dokončené / naučené?\n\n${bonusTxt}`)) {
          return;
        }

        const { error } = await db
          .from('focus_skills')
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq('id', skillId);

        if (error) {
          window.appShowError(`Chyba dokončení: ${error.message}`);
          return;
        }
        window.appShowToast('Aktivita uzavřena jako naučená!');
        await loadAll();
        window.ProgressModule?.refresh();
        return;
      }

      const reopenBtn = e.target.closest('[data-reopen-skill]');
      if (reopenBtn) {
        const { error } = await db
          .from('focus_skills')
          .update({ is_completed: false, completed_at: null })
          .eq('id', reopenBtn.dataset.reopenSkill);
        if (error) {
          window.appShowError(`Chyba obnovení: ${error.message}`);
          return;
        }
        await loadAll();
        window.ProgressModule?.refresh();
        return;
      }

      const msAddBtn = e.target.closest('[data-ms-add]');
      if (msAddBtn) {
        await addMilestoneFromInput(msAddBtn.dataset.msAdd);
        return;
      }

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
        window.CalendarModule?.refresh();
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
    };

    el.skillsList.addEventListener('click', handleSkillAction);
    if (el.completedList) el.completedList.addEventListener('click', handleSkillAction);

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
      selectedPlanDate = todayStr();
      if (el.planDate && !el.planDate.value) el.planDate.value = selectedPlanDate;
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
      plans = [];
      openMilestones.clear();
      stopTimerTick();
    },
  };
})();