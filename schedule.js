window.ScheduleModule = (() => {
  let db = null;
  let user = null;
  let classes = [];
  let tutoring = [];
  let initializedListeners = false;

  const DAY_NAMES = {
    1: 'Pondělí',
    2: 'Úterý',
    3: 'Středa',
    4: 'Čtvrtek',
    5: 'Pátek',
    6: 'Sobota',
    7: 'Neděle',
  };

  const el = {};

  function cacheElements() {
    el.form = document.getElementById('schedule-form');
    el.subjectInput = document.getElementById('sched-subject');
    el.typeInput = document.getElementById('sched-type');
    el.dayInput = document.getElementById('sched-day');
    el.startInput = document.getElementById('sched-start');
    el.endInput = document.getElementById('sched-end');
    el.roomInput = document.getElementById('sched-room');
    el.notesInput = document.getElementById('sched-notes');
    el.conflictBanner = document.getElementById('schedule-conflict-banner');
    el.list = document.getElementById('schedule-list');
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

  function toMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  function minutesToTime(totalMin) {
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${pad(h)}:${pad(m)}`;
  }

  function getDayOfWeekFromDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay(); // 0 = Ne, 1 = Po...
    return jsDay === 0 ? 7 : jsDay;
  }

  function intervalsOverlap(s1, e1, s2, e2) {
    if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
    return s1 < e2 && s2 < e1;
  }

  function analyzeConflicts() {
    const classConflicts = {}; // classId -> array of conflict messages
    const summaryWarnings = [];
    const seenPairs = new Set();

    // 1. Kolize hodina vs. hodina (stejný den v týdnu)
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const a = classes[i];
        const b = classes[j];
        if (a.day_of_week !== b.day_of_week) continue;

        const sa = toMinutes(a.start_time);
        const ea = toMinutes(a.end_time);
        const sb = toMinutes(b.start_time);
        const eb = toMinutes(b.end_time);

        if (intervalsOverlap(sa, ea, sb, eb)) {
          const msgA = `Překrývá se s: ${b.subject} (${b.start_time}–${b.end_time})`;
          const msgB = `Překrývá se s: ${a.subject} (${a.start_time}–${a.end_time})`;
          if (!classConflicts[a.id]) classConflicts[a.id] = [];
          if (!classConflicts[b.id]) classConflicts[b.id] = [];
          classConflicts[a.id].push(msgA);
          classConflicts[b.id].push(msgB);

          const pairKey = [a.id, b.id].sort().join(':');
          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            summaryWarnings.push(
              `<strong>${DAY_NAMES[a.day_of_week]}:</strong> ${escapeHtml(a.subject)} (${a.start_time}–${a.end_time}) se překrývá s ${escapeHtml(b.subject)} (${b.start_time}–${b.end_time})`
            );
          }
        }
      }
    }

    // 2. Kolize hodina vs. nadcházející doučování s časem
    const today = todayStr();
    const upcomingTutoring = tutoring.filter(
      (t) => !t.is_completed && t.start_time && t.lesson_date >= today
    );

    classes.forEach((cls) => {
      const sc = toMinutes(cls.start_time);
      const ec = toMinutes(cls.end_time);

      upcomingTutoring.forEach((t) => {
        const tDow = getDayOfWeekFromDate(t.lesson_date);
        if (tDow !== cls.day_of_week) return;

        const st = toMinutes(t.start_time);
        const et = st != null ? st + (Number(t.duration_min) || 60) : null;

        if (intervalsOverlap(sc, ec, st, et)) {
          const tEndStr = minutesToTime(et);
          const [y, m, d] = t.lesson_date.split('-').map(Number);
          const dateCz = `${d}. ${m}.`;
          const msg = `Kolize s doučováním: ${t.student_name} (${dateCz} ${t.start_time}–${tEndStr})`;
          if (!classConflicts[cls.id]) classConflicts[cls.id] = [];
          classConflicts[cls.id].push(msg);

          summaryWarnings.push(
            `<strong>Kolize s doučováním (${dateCz}):</strong> ${escapeHtml(cls.subject)} (${cls.start_time}–${cls.end_time}) vs. ${escapeHtml(t.student_name)} (${t.start_time}–${tEndStr})`
          );
        }
      });
    });

    return { classConflicts, summaryWarnings };
  }

  async function loadAll() {
    if (!db || !user) return;

    const [schedRes, tutorRes] = await Promise.all([
      db
        .from('school_schedule')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true }),
      db
        .from('tutoring_sessions')
        .select('id, student_name, subject, lesson_date, start_time, duration_min, is_completed')
        .eq('is_completed', false)
        .limit(500),
    ]);

    if (schedRes.error) window.appShowError(`Chyba rozvrhu: ${schedRes.error.message}`);
    classes = schedRes.data || [];
    tutoring = tutorRes.data || [];
    render();
  }

  function render() {
    if (!el.list) return;

    const { classConflicts, summaryWarnings } = analyzeConflicts();

    if (el.conflictBanner) {
      if (summaryWarnings.length) {
        el.conflictBanner.innerHTML = `
          <div class="conflict-banner-title">Pozor — zjištěno překrývání (${summaryWarnings.length})</div>
          <ul class="conflict-banner-list">
            ${summaryWarnings.map((w) => `<li>${w}</li>`).join('')}
          </ul>
        `;
        el.conflictBanner.classList.remove('hidden');
      } else {
        el.conflictBanner.classList.add('hidden');
        el.conflictBanner.innerHTML = '';
      }
    }

    if (!classes.length) {
      el.list.innerHTML =
        '<p class="empty-state">Rozvrh je zatím prázdný. Přidej si přednášky a cvičení — případné překrývání se samo zvýrazní červeně.</p>';
      return;
    }

    const todayDow = getDayOfWeekFromDate(todayStr());
    const byDay = {};
    classes.forEach((c) => {
      if (!byDay[c.day_of_week]) byDay[c.day_of_week] = [];
      byDay[c.day_of_week].push(c);
    });

    const daysHtml = Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b)
      .map((dow) => {
        const dayClasses = byDay[dow].sort((a, b) => a.start_time.localeCompare(b.start_time));
        const isToday = dow === todayDow;

        const rowsHtml = dayClasses
          .map((c) => {
            const conflicts = classConflicts[c.id] || [];
            const hasConflict = conflicts.length > 0;
            const typeBadgeCls =
              c.lesson_type === 'Přednáška'
                ? 'badge-cardio'
                : c.lesson_type === 'Cvičení'
                ? 'badge-gym'
                : 'badge-date';

            return `
              <div class="sched-row ${hasConflict ? 'sched-conflict' : ''}" data-sched-id="${c.id}">
                <div class="sched-time mono">
                  ${escapeHtml(c.start_time)}–${escapeHtml(c.end_time)}
                </div>
                <div class="sched-content">
                  <div class="sched-title-row">
                    <span class="sched-subject">${escapeHtml(c.subject)}</span>
                    <span class="badge ${typeBadgeCls}">${escapeHtml(c.lesson_type)}</span>
                    ${c.room ? `<span class="badge badge-date mono">${escapeHtml(c.room)}</span>` : ''}
                    ${hasConflict ? '<span class="badge badge-overdue">KOLIZE</span>' : ''}
                  </div>
                  ${c.notes ? `<div class="muted" style="font-size:0.78rem;">${escapeHtml(c.notes)}</div>` : ''}
                  ${
                    hasConflict
                      ? `<div class="sched-conflict-msgs">${conflicts
                          .map((m) => `<span>${escapeHtml(m)}</span>`)
                          .join('')}</div>`
                      : ''
                  }
                </div>
                <button type="button" class="icon-btn delete" data-del-sched="${c.id}" title="Smazat hodinu">✕</button>
              </div>
            `;
          })
          .join('');

        return `
          <section class="card stack-sm sched-day-card ${isToday ? 'sched-today-card' : ''}">
            <div class="sched-day-head">
              <h3>${DAY_NAMES[dow]}</h3>
              ${isToday ? '<span class="badge badge-gym mono">DNES</span>' : ''}
            </div>
            <div class="stack-sm">${rowsHtml}</div>
          </section>
        `;
      })
      .join('');

    el.list.innerHTML = daysHtml;
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    if (el.form) {
      el.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user) return;

        const subject = el.subjectInput.value.trim();
        const start = el.startInput.value;
        const end = el.endInput.value;
        if (!subject || !start || !end) return;

        const sMin = toMinutes(start);
        const eMin = toMinutes(end);
        if (sMin == null || eMin == null || eMin <= sMin) {
          window.appShowError('Čas konce musí být později než čas začátku.');
          return;
        }

        const dayOfWeek = Number(el.dayInput.value);

        // Kontrola okamžitého překryvu před uložením (upozornění, ale dovolí uložit, aby bylo vidět červeně)
        const overlapping = classes.find(
          (c) =>
            c.day_of_week === dayOfWeek &&
            intervalsOverlap(sMin, eMin, toMinutes(c.start_time), toMinutes(c.end_time))
        );

        const payload = {
          user_id: user.id,
          subject,
          lesson_type: el.typeInput.value || 'Přednáška',
          day_of_week: dayOfWeek,
          start_time: start,
          end_time: end,
          room: el.roomInput.value.trim() || null,
          notes: el.notesInput.value.trim() || null,
        };

        const { error } = await db.from('school_schedule').insert([payload]);
        if (error) {
          window.appShowError(`Chyba ukládání rozvrhu: ${error.message}`);
          return;
        }

        el.subjectInput.value = '';
        el.roomInput.value = '';
        el.notesInput.value = '';

        if (overlapping) {
          window.appShowError(
            `Uloženo, ale POZOR: Překrývá se s ${overlapping.subject} (${overlapping.start_time}–${overlapping.end_time})!`
          );
        } else {
          window.appShowToast(`Hodina „${subject}“ přidána do rozvrhu.`);
        }

        await loadAll();
        window.CalendarModule?.refresh();
      });
    }

    if (el.list) {
      el.list.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-sched]');
        if (!delBtn) return;
        if (!confirm('Smazat tuto hodinu z rozvrhu?')) return;

        const { error } = await db
          .from('school_schedule')
          .delete()
          .eq('id', delBtn.dataset.delSched);

        if (error) {
          window.appShowError(`Chyba mazání: ${error.message}`);
          return;
        }

        window.appShowToast('Hodina smazána.');
        await loadAll();
        window.CalendarModule?.refresh();
      });
    }
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      loadAll();
    },
    refresh() {
      loadAll();
    },
    reset() {
      user = null;
      classes = [];
      tutoring = [];
    },
  };
})();