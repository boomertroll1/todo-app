window.CalendarModule = (() => {
  let db = null;
  let user = null;
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0..11
  let selectedDate = null;
  let initializedListeners = false;

  let monthData = {
    todos: [],
    logs: [],
    workouts: [],
    photos: [],
  };

  const MONTH_NAMES = [
    'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
    'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
  ];

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

  function toDateStr(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  function todayStr() {
    const now = new Date();
    return toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  }

  async function loadMonth() {
    if (!db || !user) return;

    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startStr = toDateStr(currentYear, currentMonth, 1);
    const endStr = toDateStr(currentYear, currentMonth, lastDay);

    const [todosRes, logsRes, woRes, photosRes] = await Promise.all([
      db.from('todos').select('id, title, is_completed, priority, due_date, subtasks').gte('due_date', startStr).lte('due_date', endStr),
      db.from('daily_logs').select('*').gte('log_date', startStr).lte('log_date', endStr),
      db.from('workouts').select('*').gte('workout_date', startStr).lte('workout_date', endStr),
      db.from('user_photos').select('*').gte('photo_date', startStr).lte('photo_date', endStr),
    ]);

    monthData = {
      todos: todosRes.data || [],
      logs: logsRes.data || [],
      workouts: woRes.data || [],
      photos: photosRes.data || [],
    };

    renderCalendar();
    renderDayDetail();
  }

  function renderCalendar() {
    if (!el.grid) return;
    el.monthLabel.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

    const firstWeekday = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7; // Po=0..Ne=6
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = todayStr();

    const todosByDay = {};
    monthData.todos.forEach((t) => {
      if (!todosByDay[t.due_date]) todosByDay[t.due_date] = [];
      todosByDay[t.due_date].push(t);
    });

    const logByDay = {};
    monthData.logs.forEach((l) => {
      logByDay[l.log_date] = l;
    });

    const woByDay = {};
    monthData.workouts.forEach((w) => {
      if (!woByDay[w.workout_date]) woByDay[w.workout_date] = [];
      woByDay[w.workout_date].push(w);
    });

    const photosByDay = {};
    monthData.photos.forEach((p) => {
      if (!photosByDay[p.photo_date]) photosByDay[p.photo_date] = [];
      photosByDay[p.photo_date].push(p);
    });

    let cellsHtml = '';
    for (let i = 0; i < firstWeekday; i++) {
      cellsHtml += '<div class="cal-cell cal-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(currentYear, currentMonth, day);
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDate;

      const dayTodos = todosByDay[dateStr] || [];
      const dayLog = logByDay[dateStr];
      const dayWo = woByDay[dateStr] || [];
      const dayPhotos = photosByDay[dateStr] || [];

      const dots = [];
      if (dayTodos.length) {
        const hasOpen = dayTodos.some((t) => !t.is_completed);
        dots.push(`<span class="cal-dot ${hasOpen ? 'dot-todo' : 'dot-done'}" title="Úkoly (${dayTodos.length})"></span>`);
      }
      if (dayLog) {
        const cls = dayLog.day_type === 'rest' ? 'dot-rest' : dayLog.day_type === 'cardio' ? 'dot-cardio' : 'dot-gym';
        dots.push(`<span class="cal-dot ${cls}" title="Denní log (${dayLog.day_type})"></span>`);
      }
      if (dayWo.length) {
        dots.push(`<span class="cal-dot dot-wo" title="Trénink (${dayWo.length})"></span>`);
      }
      if (dayPhotos.length) {
        dots.push(`<span class="cal-dot dot-photo" title="Fotky (${dayPhotos.length})"></span>`);
      }

      cellsHtml += `
        <button type="button" class="cal-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-cal-date="${dateStr}">
          <span class="cal-day-num mono">${day}</span>
          <div class="cal-dots">${dots.join('')}</div>
        </button>
      `;
    }

    el.grid.innerHTML = cellsHtml;
  }

  function renderDayDetail() {
    if (!el.detailBody || !selectedDate) return;
    el.detailTitle.textContent = `Detail dne · ${selectedDate}`;

    const dayTodos = monthData.todos.filter((t) => t.due_date === selectedDate);
    const dayLog = monthData.logs.find((l) => l.log_date === selectedDate);
    const dayWo = monthData.workouts.filter((w) => w.workout_date === selectedDate);
    const dayPhotos = monthData.photos.filter((p) => p.photo_date === selectedDate);

    const sections = [];

    if (dayTodos.length) {
      const items = dayTodos
        .map((t) => {
          const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
          const subTxt = subs.length ? ` (${subs.filter((s) => s.done).length}/${subs.length} podúkolů)` : '';
          return `<div class="cal-item ${t.is_completed ? 'cal-done' : ''}">${t.is_completed ? '✅' : '⬜'} ${escapeHtml(t.title)}${subTxt}</div>`;
        })
        .join('');
      sections.push(`<div class="cal-detail-block"><h4>Úkoly s termínem</h4>${items}</div>`);
    }

    if (dayLog) {
      const m = [];
      if (dayLog.weight_kg != null) m.push(`⚖️ ${dayLog.weight_kg} kg`);
      if (dayLog.calories != null) m.push(`🔥 ${dayLog.calories} kcal`);
      if (dayLog.protein_g != null) m.push(`🥩 ${dayLog.protein_g} g B`);
      if (dayLog.steps != null) m.push(`👟 ${Number(dayLog.steps).toLocaleString('cs-CZ')} kroků`);
      if (dayLog.sleep_hours != null) m.push(`😴 ${dayLog.sleep_hours} h`);
      sections.push(`
        <div class="cal-detail-block">
          <h4>Tělo & Strava (${dayLog.day_type})</h4>
          <div class="cal-item">${m.join(' · ') || 'Zapsáno bez hodnot'}</div>
          ${dayLog.notes ? `<div class="muted">${escapeHtml(dayLog.notes)}</div>` : ''}
        </div>
      `);
    }

    if (dayWo.length) {
      const wItems = dayWo
        .map((w) => `<div class="cal-item">🏋️ <strong>${escapeHtml(w.name)}</strong>${w.duration_min ? ` · ${w.duration_min} min` : ''}${w.rpe ? ` · RPE ${w.rpe}` : ''}</div>`)
        .join('');
      sections.push(`<div class="cal-detail-block"><h4>Tréninky</h4>${wItems}</div>`);
    }

    if (dayPhotos.length) {
      const pItems = dayPhotos
        .map(
          (p) => `<img src="${p.image_data}" alt="${escapeHtml(p.caption || 'Fotka')}" class="cal-photo-mini" data-cal-photo="${p.id}">`
        )
        .join('');
      sections.push(`<div class="cal-detail-block"><h4>Fotky</h4><div class="cal-photos-row">${pItems}</div></div>`);
    }

    el.detailBody.innerHTML = sections.length
      ? sections.join('')
      : '<p class="muted">Pro tento den nemáš žádné záznamy ani termíny úkolů.</p>';
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    el.prevBtn.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      loadMonth();
    });

    el.nextBtn.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      loadMonth();
    });

    el.todayBtn.addEventListener('click', () => {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth();
      selectedDate = todayStr();
      loadMonth();
    });

    el.grid.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-cal-date]');
      if (!cell) return;
      selectedDate = cell.dataset.calDate;
      renderCalendar();
      renderDayDetail();
    });

    el.detailBody.addEventListener('click', (e) => {
      const img = e.target.closest('[data-cal-photo]');
      if (!img) return;
      const photo = monthData.photos.find((p) => p.id === img.dataset.calPhoto);
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
      loadMonth();
    },
    refresh() {
      loadMonth();
    },
    onShow() {
      loadMonth();
    },
    reset() {
      user = null;
      monthData = { todos: [], logs: [], workouts: [], photos: [] };
    },
  };
})();