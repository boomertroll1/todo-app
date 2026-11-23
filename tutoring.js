window.TutoringModule = (() => {
  let db = null;
  let user = null;
  let lessons = [];
  let filter = 'upcoming';
  let initializedListeners = false;

  const el = {};

  function cacheElements() {
    el.kpiGrid = document.getElementById('tutoring-kpi-grid');
    el.form = document.getElementById('tutoring-form');
    el.studentInput = document.getElementById('tutor-student');
    el.subjectInput = document.getElementById('tutor-subject');
    el.dateInput = document.getElementById('tutor-date');
    el.timeInput = document.getElementById('tutor-time');
    el.durationInput = document.getElementById('tutor-duration');
    el.priceInput = document.getElementById('tutor-price');
    el.notesInput = document.getElementById('tutor-notes');
    el.filterBtns = document.querySelectorAll('.tutor-filter-chip');
    el.list = document.getElementById('tutoring-list');
    el.studentDatalist = document.getElementById('tutor-student-datalist');
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDuration(min) {
    const m = Math.round(min || 0);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }

  function formatDateCz(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${d}. ${m}. ${y}`;
  }

  async function loadAll() {
    if (!db || !user) return;
    const { data, error } = await db
      .from('tutoring_sessions')
      .select('*')
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(1000);

    if (error) {
      window.appShowError(`Chyba doučování: ${error.message}`);
      return;
    }

    lessons = data || [];
    updateStudentDatalist();
    render();
  }

  function updateStudentDatalist() {
    if (!el.studentDatalist) return;
    const unique = [...new Set(lessons.map((l) => l.student_name).filter(Boolean))].sort();
    el.studentDatalist.innerHTML = unique.map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
  }

  function render() {
    if (!el.list) return;
    const today = todayStr();
    const monthPrefix = today.slice(0, 7);

    const monthLessons = lessons.filter((l) => l.lesson_date.startsWith(monthPrefix));
    const monthMin = monthLessons.reduce((s, l) => s + (Number(l.duration_min) || 0), 0);
    const monthDoneMin = monthLessons
      .filter((l) => l.is_completed)
      .reduce((s, l) => s + (Number(l.duration_min) || 0), 0);
    const monthEarned = monthLessons
      .filter((l) => l.is_completed && l.price_czk)
      .reduce((s, l) => s + Number(l.price_czk), 0);
    const totalMin = lessons.reduce((s, l) => s + (Number(l.duration_min) || 0), 0);
    const upcomingCount = lessons.filter((l) => !l.is_completed && l.lesson_date >= today).length;

    if (el.kpiGrid) {
      el.kpiGrid.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">Nadcházející</span><span class="kpi-value kpi-accent mono">${upcomingCount}</span><span class="kpi-sub">naplánovaných lekcí</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Tento měsíc</span><span class="kpi-value mono">${formatDuration(monthMin)}</span><span class="kpi-sub">odpracováno ${formatDuration(monthDoneMin)} (${monthLessons.length} lekcí)</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Celkem odučeno</span><span class="kpi-value mono">${formatDuration(totalMin)}</span><span class="kpi-sub">${totalMin} min · ${lessons.length} lekcí</span></div>`,
        monthEarned > 0
          ? `<div class="kpi-card"><span class="kpi-label">Výdělek (měsíc)</span><span class="kpi-value mono">${monthEarned.toLocaleString('cs-CZ')} Kč</span><span class="kpi-sub">ze splněných lekcí</span></div>`
          : '',
      ].join('');
    }

    const filtered = lessons.filter((l) => {
      if (filter === 'upcoming') return !l.is_completed;
      if (filter === 'done') return l.is_completed;
      return true;
    });

    if (filter === 'done') {
      filtered.sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
    }

    if (!filtered.length) {
      el.list.innerHTML = '<p class="empty-state">Žádné lekce doučování v tomto filtru.</p>';
      return;
    }

    el.list.innerHTML = filtered
      .map((l) => {
        const isToday = !l.is_completed && l.lesson_date === today;
        const isOverdue = !l.is_completed && l.lesson_date < today;
        const urgCls = isOverdue ? 'urgency-overdue' : isToday ? 'urgency-today' : '';
        const timeStr = l.start_time ? ` · ${escapeHtml(l.start_time)}` : '';
        const priceBadge = l.price_czk
          ? `<span class="badge badge-low mono">${Number(l.price_czk).toLocaleString('cs-CZ')} Kč</span>`
          : '';

        return `
          <div class="tutor-item ${l.is_completed ? 'done' : ''} ${urgCls}" data-tutor-id="${l.id}">
            <input type="checkbox" class="todo-checkbox tutor-check" ${l.is_completed ? 'checked' : ''} title="Označit lekci jako odučenou">
            <div class="tutor-content">
              <div class="tutor-title-row">
                <span class="tutor-student">${escapeHtml(l.student_name)}</span>
                <span class="badge badge-cardio">${escapeHtml(l.subject)}</span>
                <span class="badge badge-gym mono">${formatDuration(l.duration_min)}</span>
                ${priceBadge}
              </div>
              <div class="tutor-meta mono">
                <span class="${isToday || isOverdue ? 'badge badge-overdue' : 'muted'}">${isToday ? 'DNES' : formatDateCz(l.lesson_date)}${timeStr}</span>
                ${l.notes ? `<span class="muted">· ${escapeHtml(l.notes)}</span>` : ''}
              </div>
            </div>
            <button type="button" class="icon-btn delete" data-del-tutor="${l.id}" title="Smazat lekci">✕</button>
          </div>
        `;
      })
      .join('');
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    if (el.form) {
      el.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user) return;

        const student = el.studentInput.value.trim();
        const subject = el.subjectInput.value.trim();
        const date = el.dateInput.value || todayStr();
        const duration = Number(el.durationInput.value) || 60;
        if (!student || !subject) return;

        const payload = {
          user_id: user.id,
          student_name: student,
          subject,
          lesson_date: date,
          start_time: el.timeInput.value || null,
          duration_min: duration,
          price_czk: el.priceInput.value ? Number(el.priceInput.value) : null,
          notes: el.notesInput.value.trim() || null,
          is_completed: false,
        };

        const { error } = await db.from('tutoring_sessions').insert([payload]);
        if (error) {
          window.appShowError(`Chyba ukládání doučování: ${error.message}`);
          return;
        }

        el.notesInput.value = '';
        window.appShowToast(`Doučování (${student} · ${subject}) uloženo.`);
        await loadAll();
        window.CalendarModule?.refresh();
      });
    }

    el.filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.tutorFilter;
        el.filterBtns.forEach((b) => b.classList.toggle('active', b === btn));
        render();
      });
    });

    if (el.list) {
      el.list.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-tutor]');
        if (delBtn) {
          if (!confirm('Smazat tuto lekci doučování?')) return;
          const { error } = await db.from('tutoring_sessions').delete().eq('id', delBtn.dataset.delTutor);
          if (error) {
            window.appShowError(`Chyba mazání: ${error.message}`);
            return;
          }
          await loadAll();
          window.CalendarModule?.refresh();
          return;
        }

        if (e.target.classList.contains('tutor-check')) {
          const item = e.target.closest('.tutor-item');
          const id = item.dataset.tutorId;
          const checked = e.target.checked;
          const { error } = await db
            .from('tutoring_sessions')
            .update({ is_completed: checked })
            .eq('id', id);

          if (error) {
            window.appShowError(`Chyba aktualizace: ${error.message}`);
            e.target.checked = !checked;
            return;
          }
          await loadAll();
          window.CalendarModule?.refresh();
        }
      });
    }
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      if (el.dateInput && !el.dateInput.value) el.dateInput.value = todayStr();
      loadAll();
    },
    refresh() {
      loadAll();
    },
    reset() {
      user = null;
      lessons = [];
    },
  };
})();