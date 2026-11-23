window.RestDayModule = (() => {
  let db = null;
  let user = null;
  let initializedListeners = false;

  let currentState = {
    todayLog: null,
    hasWorkoutToday: false,
    prevRestStreak: 0,
    isRestToday: false,
  };

  const el = {};

  function cacheElements() {
    el.bar = document.getElementById('rest-day-bar');
    el.status = document.getElementById('rest-day-status');
    el.btn = document.getElementById('rest-day-btn');
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toDateStr(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function shiftDays(delta) {
    const d = new Date();
    d.setDate(d.getDate() + delta);
    return toDateStr(d);
  }

  async function loadAndRender() {
    if (!db || !user || !el.bar) return;

    const today = shiftDays(0);
    const fromDate = shiftDays(-3);

    const [logsRes, woRes] = await Promise.all([
      db
        .from('daily_logs')
        .select('*')
        .gte('log_date', fromDate)
        .lte('log_date', today),
      db
        .from('workouts')
        .select('id, workout_date')
        .gte('workout_date', fromDate)
        .lte('workout_date', today),
    ]);

    if (logsRes.error) window.appShowError(`Chyba načtení Rest day: ${logsRes.error.message}`);

    const logsByDate = {};
    (logsRes.data || []).forEach((l) => {
      logsByDate[l.log_date] = l;
    });

    const workoutDates = new Set((woRes.data || []).map((w) => w.workout_date));

    let prevRestStreak = 0;
    for (let k = 1; k <= 3; k++) {
      const dStr = shiftDays(-k);
      if (logsByDate[dStr]?.day_type === 'rest' && !workoutDates.has(dStr)) {
        prevRestStreak++;
      } else {
        break;
      }
    }

    const todayLog = logsByDate[today] || null;
    const hasWorkoutToday = workoutDates.has(today);
    const isRestToday = !hasWorkoutToday && todayLog?.day_type === 'rest';

    currentState = { todayLog, hasWorkoutToday, prevRestStreak, isRestToday };
    render();
  }

  function render() {
    if (!el.bar || !el.status || !el.btn) return;
    const { hasWorkoutToday, prevRestStreak, isRestToday } = currentState;

    el.bar.classList.remove('rest-active', 'rest-limit');
    el.btn.disabled = false;

    if (hasWorkoutToday) {
      el.status.textContent = 'Dnes už máš zapsaný trénink — Rest day netřeba.';
      el.btn.textContent = 'Trénink hotov';
      el.btn.disabled = true;
      return;
    }

    if (isRestToday) {
      const totalStreak = prevRestStreak + 1;
      el.bar.classList.add('rest-active');
      el.status.textContent = `Dnes máš Rest day (${totalStreak}/3 po sobě · 0 XP) — Discord tě nebude honit do gymu.`;
      el.btn.textContent = '↺ Zrušit Rest day';
      return;
    }

    if (prevRestStreak >= 3) {
      el.bar.classList.add('rest-limit');
      el.status.textContent = 'Vyčerpal jsi limit (3/3 Rest dny po sobě) — čtvrtý v řadě nejde, dneska na trénink!';
      el.btn.textContent = 'Limit 3/3';
      el.btn.disabled = true;
      return;
    }

    el.status.textContent = `Dnes bez gymu? (${prevRestStreak}/3 Rest dnů v řadě · bez XP za trénink)`;
    el.btn.textContent = 'Nastavit Rest day';
  }

  async function toggleRestDay() {
    if (!db || !user) return;
    const { todayLog, hasWorkoutToday, prevRestStreak, isRestToday } = currentState;
    const today = shiftDays(0);

    if (hasWorkoutToday) return;

    el.btn.disabled = true;

    try {
      if (isRestToday) {
        const hasOtherData =
          todayLog &&
          (todayLog.weight_kg != null ||
            todayLog.kcal != null ||
            todayLog.protein_g != null ||
            todayLog.carbs_g != null ||
            todayLog.fat_g != null ||
            todayLog.steps != null ||
            todayLog.sleep_hours != null ||
            Boolean(todayLog.notes));

        if (hasOtherData) {
          const { error } = await db
            .from('daily_logs')
            .update({ day_type: 'gym' })
            .eq('id', todayLog.id);
          if (error) throw error;
        } else if (todayLog) {
          const { error } = await db.from('daily_logs').delete().eq('id', todayLog.id);
          if (error) throw error;
        }
        window.appShowToast('Rest day pro dnešek zrušen.');
      } else {
        if (prevRestStreak >= 3) {
          window.appShowError('Maximálně 3 Rest dny po sobě — čtvrtý v řadě už nejde!');
          return;
        }

        if (todayLog) {
          const { error } = await db
            .from('daily_logs')
            .update({ day_type: 'rest' })
            .eq('id', todayLog.id);
          if (error) throw error;
        } else {
          const { error } = await db.from('daily_logs').insert([
            {
              user_id: user.id,
              log_date: today,
              day_type: 'rest',
            },
          ]);
          if (error) throw error;
        }
        window.appShowToast(`Dnešek nastaven jako Rest day (${prevRestStreak + 1}/3 · 0 XP).`);
      }

      await loadAndRender();
      window.GymModule?.refresh();
      window.CalendarModule?.refresh();
      window.ProgressModule?.refresh();
    } catch (err) {
      window.appShowError(`Chyba Rest day: ${err.message}`);
    } finally {
      el.btn.disabled = false;
      render();
    }
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;
    el.btn?.addEventListener('click', toggleRestDay);
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      loadAndRender();
    },
    refresh() {
      loadAndRender();
    },
    reset() {
      user = null;
      currentState = {
        todayLog: null,
        hasWorkoutToday: false,
        prevRestStreak: 0,
        isRestToday: false,
      };
    },
  };
})();