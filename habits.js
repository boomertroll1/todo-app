window.HabitsModule = (() => {
  let db = null;
  let user = null;
  let habits = [];
  let habitLogs = [];
  let initializedListeners = false;

  const el = {};

  function cacheElements() {
    el.form = document.getElementById('habits-add-form');
    el.nameInput = document.getElementById('habit-name-input');
    el.iconInput = document.getElementById('habit-icon-input');
    el.xpSelect = document.getElementById('habit-xp-select');
    el.list = document.getElementById('habits-list');
    el.progressText = document.getElementById('habits-progress-text');
    el.progressFill = document.getElementById('habits-progress-fill');
    el.comboBadge = document.getElementById('habits-combo-badge');
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

  function computeHabitStreak(habitId) {
    const dates = new Set(
      habitLogs.filter((l) => l.habit_id === habitId).map((l) => l.log_date)
    );
    let streak = 0;
    const cursor = new Date();
    if (!dates.has(toDateStr(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dates.has(toDateStr(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  async function loadAll() {
    if (!db || !user) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const cutoffStr = toDateStr(cutoff);

    const [hRes, lRes] = await Promise.all([
      db.from('habits').select('*').order('created_at', { ascending: true }),
      db.from('habit_logs').select('*').gte('log_date', cutoffStr).limit(3000),
    ]);

    if (hRes.error) window.appShowError(`Chyba rutin: ${hRes.error.message}`);
    if (lRes.error) window.appShowError(`Chyba logů rutin: ${lRes.error.message}`);

    habits = hRes.data || [];
    habitLogs = lRes.data || [];
    render();
  }

  function render() {
    if (!el.list) return;
    const today = todayStr();
    const doneTodaySet = new Set(
      habitLogs.filter((l) => l.log_date === today).map((l) => l.habit_id)
    );

    const total = habits.length;
    const doneCount = habits.filter((h) => doneTodaySet.has(h.id)).length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;

    if (el.progressText) el.progressText.textContent = `${doneCount} / ${total} dnes`;
    if (el.progressFill) el.progressFill.style.width = `${pct}%`;
    if (el.comboBadge) {
      const hasCombo = total >= 2 && doneCount === total;
      el.comboBadge.textContent = hasCombo ? '⚡ COMBO +20 XP AKTIVNÍ' : '100 % = +20 XP Combo';
      el.comboBadge.classList.toggle('combo-active', hasCombo);
    }

    if (!total) {
      el.list.innerHTML =
        '<p class="muted" style="text-align:center; padding:8px 0;">Přidej si denní rutiny (např. Kreatin, Lean 4 30m, 10k kroků, Čtení).</p>';
      return;
    }

    el.list.innerHTML = habits
      .map((h) => {
        const isDone = doneTodaySet.has(h.id);
        const streak = computeHabitStreak(h.id);
        return `
          <div class="habit-item ${isDone ? 'done' : ''}" data-habit-id="${h.id}">
            <label class="habit-main">
              <input type="checkbox" class="todo-checkbox habit-check" ${isDone ? 'checked' : ''}>
              <span class="habit-icon">${escapeHtml(h.icon || '🔁')}</span>
              <span class="habit-name">${escapeHtml(h.name)}</span>
            </label>
            <div class="habit-right">
              <span class="badge badge-date mono">+${h.xp_value} XP</span>
              <span class="skill-streak mono ${streak > 0 ? 'active' : ''}" title="Streak rutiny">🔥 ${streak}</span>
              <button type="button" class="icon-btn delete" data-del-habit="${h.id}" title="Smazat rutinu">✕</button>
            </div>
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
        const name = el.nameInput.value.trim();
        if (!name) return;

        const { error } = await db.from('habits').insert([
          {
            user_id: user.id,
            name,
            icon: el.iconInput.value.trim() || '🔁',
            xp_value: Number(el.xpSelect.value) || 15,
          },
        ]);

        if (error) {
          window.appShowError(`Chyba přidání rutiny: ${error.message}`);
          return;
        }

        el.nameInput.value = '';
        window.appShowToast(`Rutina „${name}“ přidána.`);
        await loadAll();
      });
    }

    if (el.list) {
      el.list.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-habit]');
        if (delBtn) {
          if (!confirm('Smazat tuto opakovanou činnost?')) return;
          const { error } = await db.from('habits').delete().eq('id', delBtn.dataset.delHabit);
          if (error) {
            window.appShowError(`Chyba mazání rutiny: ${error.message}`);
            return;
          }
          await loadAll();
          window.ProgressModule?.refresh();
          return;
        }

        if (e.target.classList.contains('habit-check')) {
          const item = e.target.closest('.habit-item');
          const habitId = item.dataset.habitId;
          const today = todayStr();
          const checked = e.target.checked;

          if (checked) {
            const { error } = await db
              .from('habit_logs')
              .upsert([{ user_id: user.id, habit_id: habitId, log_date: today }], {
                onConflict: 'habit_id,log_date',
              });
            if (error) {
              window.appShowError(`Chyba uložení rutiny: ${error.message}`);
              e.target.checked = false;
              return;
            }
          } else {
            const { error } = await db
              .from('habit_logs')
              .delete()
              .eq('habit_id', habitId)
              .eq('log_date', today);
            if (error) {
              window.appShowError(`Chyba odškrtnutí rutiny: ${error.message}`);
              e.target.checked = true;
              return;
            }
          }

          await loadAll();
          window.ProgressModule?.refresh();
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
      loadAll();
    },
    refresh() {
      loadAll();
    },
    reset() {
      user = null;
      habits = [];
      habitLogs = [];
    },
  };
})();