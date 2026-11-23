window.CalendarModule = (() => {
  let db = null;
  let user = null;
  let viewDate = new Date();
  let selectedDate = '';
  let initializedListeners = false;

  let cache = {
    todos: [],
    logs: [],
    workouts: [],
    photos: [],
    focusSkills: [],
    focusSessions: [],
    focusPlans: [],
    tutoring: [],
  };

  const MONTH_NAMES = [
    'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
    'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
  ];
  const QUICK_NOTE = 'Odškrtnuto';
  const el = {};

  function cacheElements() {
    el.monthLabel = document.getElementById('cal-month-label');
    el.prevBtn = document.getElementById('cal-prev-btn');
    el.todayBtn = document.getElementById('cal-today-btn');
    el.nextBtn = document.getElementById('cal-next-btn');
    el.grid = document.getElementById('cal-grid');
    el.detailTitle = document.getElementById('cal-detail-title');
    el.detailBody = document.getElementById('cal-detail-body');
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

  function formatDuration(min) {
    const m = Math.round(min || 0);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }

  async function loadAll() {
    if (!db || !user) return;

    const [todosRes, logsRes, woRes, photosRes, skillsRes, sessRes, plansRes, tutorRes] =
      await Promise.all([
        db.from('todos').select('id, title, is_completed, due_date'),
        db.from('daily_logs').select('log_date, day_type, weight_kg, kcal, protein_g, steps, sleep_hours').limit(500),
        db.from('workouts').select('id, workout_date, name, duration_min').limit(500),
        db.from('user_photos').select('id, photo_date, category, caption, image_data').limit(120),
        db.from('focus_skills').select('id, name, color'),
        db.from('focus_sessions').select('skill_id, session_date, minutes, notes').limit(5000),
        db.from('focus_plans').select('id, skill_id, plan_date, target_minutes').limit(1000),
        db.from('tutoring_sessions').select('*').limit(1000),
      ]);

    cache = {
      todos: todosRes.data || [],
      logs: logsRes.data || [],
      workouts: woRes.data || [],
      photos: photosRes.data || [],
      focusSkills: skillsRes.data || [],
      focusSessions: sessRes.data || [],
      focusPlans: plansRes.data || [],
      tutoring: tutorRes.data || [],
    };

    render();
  }

  function render() {
    if (!el.grid) return;

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const today = todayStr();

    if (el.monthLabel) {
      el.monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;
    }

    const byDate = {};
    const ensure = (d) => {
      if (!d) return null;
      if (!byDate[d]) {
        byDate[d] = {
          todos: [],
          log: null,
          workouts: [],
          photos: [],
          focusSessions: [],
          focusPlans: [],
          tutoring: [],
        };
      }
      return byDate[d];
    };

    cache.todos.forEach((t) => {
      if (t.due_date) ensure(t.due_date).todos.push(t);
    });
    cache.logs.forEach((l) => {
      if (l.log_date) ensure(l.log_date).log = l;
    });
    cache.workouts.forEach((w) => {
      if (w.workout_date) ensure(w.workout_date).workouts.push(w);
    });
    cache.photos.forEach((p) => {
      if (p.photo_date) ensure(p.photo_date).photos.push(p);
    });
    cache.focusSessions.forEach((s) => {
      if (s.session_date) ensure(s.session_date).focusSessions.push(s);
    });
    cache.focusPlans.forEach((p) => {
      if (p.plan_date) ensure(p.plan_date).focusPlans.push(p);
    });
    cache.tutoring.forEach((t) => {
      if (t.lesson_date) ensure(t.lesson_date).tutoring.push(t);
    });

    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push('<div class="cal-cell cal-empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${year}-${pad(month + 1)}-${pad(day)}`;
      const info = byDate[dStr];
      const dots = [];

      if (info) {
        if (info.todos.length) dots.push('<i class="cal-dot dot-todo" title="Úkoly"></i>');
        if (info.focusPlans.length || info.focusSessions.length) {
          dots.push('<i class="cal-dot dot-focus" title="Fokus / Plán"></i>');
        }
        if (info.tutoring.length) dots.push('<i class="cal-dot dot-tutor" title="Doučování"></i>');
        if (info.log) {
          const logCls = info.log.day_type === 'rest' ? 'dot-rest' : 'dot-gym';
          dots.push(`<i class="cal-dot ${logCls}" title="Denní zápis"></i>`);
        }
        if (info.workouts.length) dots.push('<i class="cal-dot dot-wo" title="Trénink"></i>');
        if (info.photos.length) dots.push('<i class="cal-dot dot-photo" title="Fotky"></i>');
      }

      const isToday = dStr === today;
      const isSelected = dStr === selectedDate;

      cells.push(`
        <button type="button" class="cal-cell ${isToday ? 'cal-today' : ''} ${isSelected ? 'cal-selected' : ''}" data-cal-date="${dStr}">
          <span class="cal-day-num mono">${day}</span>
          <span class="cal-dots">${dots.join('')}</span>
        </button>
      `);
    }

    el.grid.innerHTML = cells.join('');
    renderDetail(selectedDate || today, byDate[selectedDate || today]);
  }

  function renderDetail(dateStr, info) {
    if (!el.detailTitle || !el.detailBody) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    el.detailTitle.textContent = `Detail dne · ${d}. ${m}. ${y}`;

    if (!info) {
      el.detailBody.innerHTML = '<p class="muted">Pro tento den zatím nejsou žádné záznamy ani plány.</p>';
      return;
    }

    const skillMap = new Map(cache.focusSkills.map((s) => [s.id, s]));
    const blocks = [];

    // 1. Doučování
    if (info.tutoring.length) {
      const items = info.tutoring
        .map((t) => {
          const time = t.start_time ? `${escapeHtml(t.start_time)} · ` : '';
          const price = t.price_czk ? ` · ${t.price_czk} Kč` : '';
          return `<li>${t.is_completed ? '✅' : '🎓'} <strong>${escapeHtml(t.student_name)}</strong> — ${escapeHtml(t.subject)} <span class="mono muted">(${time}${formatDuration(t.duration_min)}${price})</span>${t.notes ? ` · <span class="muted">${escapeHtml(t.notes)}</span>` : ''}</li>`;
        })
        .join('');
      blocks.push(`<div class="cal-detail-block"><h4>Doučování</h4><ul>${items}</ul></div>`);
    }

    // 2. Fokus plán & odpracovaný čas
    if (info.focusPlans.length || info.focusSessions.length) {
      const loggedBySkill = {};
      info.focusSessions.forEach((s) => {
        if (!loggedBySkill[s.skill_id]) loggedBySkill[s.skill_id] = { min: 0, quick: false };
        if (s.notes === QUICK_NOTE) loggedBySkill[s.skill_id].quick = true;
        else loggedBySkill[s.skill_id].min += Number(s.minutes) || 0;
      });

      const lines = [];
      const shownSkills = new Set();

      info.focusPlans.forEach((p) => {
        shownSkills.add(p.skill_id);
        const sk = skillMap.get(p.skill_id);
        const logged = loggedBySkill[p.skill_id]?.min || 0;
        const done = logged >= p.target_minutes;
        lines.push(
          `<li>${done ? '✅' : '⏱️'} <strong>${escapeHtml(sk?.name || 'Aktivita')}</strong> — plán <span class="mono">${logged} / ${p.target_minutes} min</span></li>`
        );
      });

      Object.entries(loggedBySkill).forEach(([sid, val]) => {
        if (shownSkills.has(sid)) return;
        const sk = skillMap.get(sid);
        const txt = val.min > 0 ? formatDuration(val.min) : 'Odškrtnuto ✓';
        lines.push(`<li>✅ <strong>${escapeHtml(sk?.name || 'Aktivita')}</strong> — <span class="mono">${txt}</span></li>`);
      });

      blocks.push(`<div class="cal-detail-block"><h4>Fokus & Plán učení</h4><ul>${lines.join('')}</ul></div>`);
    }

    // 3. Úkoly
    if (info.todos.length) {
      const items = info.todos
        .map((t) => `<li>${t.is_completed ? '✅' : '⬜'} ${escapeHtml(t.title)}</li>`)
        .join('');
      blocks.push(`<div class="cal-detail-block"><h4>Úkoly</h4><ul>${items}</ul></div>`);
    }

    // 4. Tréninky
    if (info.workouts.length) {
      const items = info.workouts
        .map((w) => `<li>🏋️ <strong>${escapeHtml(w.name)}</strong>${w.duration_min ? ` <span class="mono muted">(${w.duration_min} min)</span>` : ''}</li>`)
        .join('');
      blocks.push(`<div class="cal-detail-block"><h4>Tréninky</h4><ul>${items}</ul></div>`);
    }

    // 5. Denní log (váha, kalorie, kroky)
    if (info.log) {
      const l = info.log;
      const parts = [];
      if (l.weight_kg != null) parts.push(`Váha: <strong>${l.weight_kg} kg</strong>`);
      if (l.kcal != null) parts.push(`Kalorie: <strong>${l.kcal} kcal</strong>`);
      if (l.protein_g != null) parts.push(`Bílkoviny: <strong>${l.protein_g} g</strong>`);
      if (l.steps != null) parts.push(`Kroky: <strong>${Number(l.steps).toLocaleString('cs-CZ')}</strong>`);
      if (l.sleep_hours != null) parts.push(`Spánek: <strong>${l.sleep_hours} h</strong>`);
      blocks.push(
        `<div class="cal-detail-block"><h4>Tělo & Strava (${escapeHtml(l.day_type || 'gym')})</h4><p class="mono" style="font-size:0.84rem;">${parts.join(' · ') || 'Zapsáno'}</p></div>`
      );
    }

    // 6. Fotky
    if (info.photos.length) {
      const imgs = info.photos
        .map(
          (p) =>
            `<img src="${p.image_data}" alt="${escapeHtml(p.caption || 'Fotka')}" class="todo-att-thumb" data-cal-photo="${p.id}">`
        )
        .join('');
      blocks.push(`<div class="cal-detail-block"><h4>Fotky (${info.photos.length})</h4><div class="todo-attachments">${imgs}</div></div>`);
    }

    el.detailBody.innerHTML = blocks.join('');
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    el.prevBtn?.addEventListener('click', () => {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      render();
    });
    el.nextBtn?.addEventListener('click', () => {
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      render();
    });
    el.todayBtn?.addEventListener('click', () => {
      viewDate = new Date();
      selectedDate = todayStr();
      render();
    });

    el.grid?.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-cal-date]');
      if (!cell) return;
      selectedDate = cell.dataset.calDate;
      render();
    });

    el.detailBody?.addEventListener('click', (e) => {
      const img = e.target.closest('[data-cal-photo]');
      if (!img) return;
      const photo = cache.photos.find((p) => p.id === img.dataset.calPhoto);
      if (photo && window.openPhotoLightbox) {
        window.openPhotoLightbox(photo.image_data, `${photo.photo_date}${photo.caption ? ' — ' + photo.caption : ''}`);
      }
    });
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      selectedDate = todayStr();
      cacheElements();
      bindEvents();
      loadAll();
    },
    refresh() {
      loadAll();
    },
    onShow() {
      loadAll();
    },
    reset() {
      user = null;
      cache = {
        todos: [],
        logs: [],
        workouts: [],
        photos: [],
        focusSkills: [],
        focusSessions: [],
        focusPlans: [],
        tutoring: [],
      };
    },
  };
})();