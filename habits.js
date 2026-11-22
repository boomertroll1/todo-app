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
    el.dueInput = document.getElementById('habit-due-input');
    el.list = document.getElementById('habits-list');
    el.completedWrap = document.getElementById('habits-completed-wrap');
    el.completedList = document.getElementById('habits-completed-list');
    el.completedCount = document.getElementById('habits-completed-count');
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

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const now = new Date();
    const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const targetUTC = Date.UTC(y, m - 1, d);
    return Math.round((targetUTC - todayUTC) / 86400000);
  }

  function getUrgencyInfo(dueDate) {
    if (!dueDate) {
      return { cls: '', badge: '∞ Do nekonečna', badgeCls: 'badge-date', rank: 9999 };
    }
    const diff = daysUntil(dueDate);
    if (diff < 0) {
      return {
        cls: 'urgency-overdue',
        badge: `PO TERMÍNU (${Math.abs(diff)}d)`,
        badgeCls: 'badge-overdue',
        rank: diff,
      };
    }
    if (diff === 0) {
      return { cls: 'urgency-today', badge: 'DEADLINE DNES!', badgeCls: 'badge-overdue', rank: 0 };
    }
    if (diff <= 2) {
      return {
        cls: 'urgency-soon',
        badge: diff === 1 ? 'Zbývá 1 den' : 'Zbývají 2 dny',
        badgeCls: 'badge-high',
        rank: diff,
      };
    }
    if (diff <= 5) {
      return { cls: 'urgency-near', badge: `Zbývá ${diff} dní`, badgeCls: 'badge-medium', rank: diff };
    }
    return { cls: '', badge: `Do ${dueDate} (${diff}d)`, badgeCls: 'badge-date', rank: diff };
  }

  function getHabitStats(habitId) {
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
    return { totalDays: dates.size, streak };
  }

  async function loadAll() {
    if (!db || !user) return;

    const [hRes, lRes] = await Promise.all([
      db.from('habits').select('*').order('created_at', { ascending: true }),
      db.from('habit_logs').select('habit_id, log_date').limit(5000),
    ]);

    if (hRes.error) window.appShowError(`Chyba aktivit: ${hRes.error.message}`);
    if (lRes.error) window.appShowError(`Chyba logů aktivit: ${lRes.error.message}`);

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

    const activeHabits = habits.filter((h) => !h.is_completed);
    const completedHabits = habits.filter((h) => h.is_completed);

    // Seřazení: nejdřív dnešní nesplněné podle urgence deadlinu, pak splněné dnes
    const sortedActive = [...activeHabits].sort((a, b) => {
      const aDone = doneTodaySet.has(a.id) ? 1 : 0;
      const bDone = doneTodaySet.has(b.id) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const ua = getUrgencyInfo(a.due_date).rank;
      const ub = getUrgencyInfo(b.due_date).rank;
      if (ua !== ub) return ua - ub;
      return a.created_at.localeCompare(b.created_at);
    });

    const total = activeHabits.length;
    const doneCount = activeHabits.filter((h) => doneTodaySet.has(h.id)).length;
    const pct = total ? Math.round((doneCount / total) * 100) : 0;

    if (el.progressText) el.progressText.textContent = `${doneCount} / ${total} dnes`;
    if (el.progressFill) el.progressFill.style.width = `${pct}%`;
    if (el.comboBadge) {
      const hasCombo = total >= 3 && doneCount === total;
      el.comboBadge.textContent = hasCombo
        ? '⚡ COMBO +15 XP AKTIVNÍ'
        : '100 % (min. 3) = +15 XP Combo';
      el.comboBadge.classList.toggle('combo-active', hasCombo);
    }

    if (!sortedActive.length) {
      el.list.innerHTML =
        '<p class="muted" style="text-align:center; padding:8px 0;">Přidej si dlouhodobý cíl nebo denní rutinu (např. Učit se Lean 4, Kreatin, 10k kroků). Vyskočí ti tu každý den, dokud ho neukončíš.</p>';
    } else {
      el.list.innerHTML = sortedActive
        .map((h) => {
          const isDoneToday = doneTodaySet.has(h.id);
          const { totalDays, streak } = getHabitStats(h.id);
          const urg = isDoneToday
            ? { ...getUrgencyInfo(h.due_date), cls: '' }
            : getUrgencyInfo(h.due_date);

          return `
            <div class="habit-item ${isDoneToday ? 'done' : ''} ${urg.cls}" data-habit-id="${h.id}">
              <label class="habit-main">
                <input type="checkbox" class="todo-checkbox habit-check" ${isDoneToday ? 'checked' : ''} title="Odškrtnout dnešní den (+10 XP)">
                <span class="habit-icon">${escapeHtml(h.icon || '🔁')}</span>
                <div class="habit-text-col">
                  <span class="habit-name">${escapeHtml(h.name)}</span>
                  <div class="habit-sub-badges">
                    <span class="badge ${urg.badgeCls}">${urg.badge}</span>
                    <span class="badge badge-date mono">Odpracováno: ${totalDays}d</span>
                  </div>
                </div>
              </label>
              <div class="habit-right">
                <span class="skill-streak mono ${streak > 0 ? 'active' : ''}" title="Aktuální streak">🔥 ${streak}</span>
                <button type="button" class="btn-finish-habit" data-finish-habit="${h.id}" title="Uzavřít natrvalo jako naučené / dokončené (bonus XP za ≥ 5 dnů)">🎓 Hotovo</button>
                <button type="button" class="icon-btn delete" data-del-habit="${h.id}" title="Smazat">✕</button>
              </div>
            </div>
          `;
        })
        .join('');
    }

    // Archiv dokončených dlouhodobých cílů
    if (el.completedWrap && el.completedList && el.completedCount) {
      el.completedWrap.classList.toggle('hidden', completedHabits.length === 0);
      el.completedCount.textContent = String(completedHabits.length);
      el.completedList.innerHTML = completedHabits
        .map((h) => {
          const { totalDays } = getHabitStats(h.id);
          const bonus = totalDays >= 5 ? Math.min(150, totalDays * 5) : 0;
          const doneDate = (h.completed_at || '').slice(0, 10);
          return `
            <div class="habit-item done" data-habit-id="${h.id}">
              <div class="habit-main">
                <span class="habit-icon">🎓</span>
                <div class="habit-text-col">
                  <span class="habit-name">${escapeHtml(h.name)}</span>
                  <div class="habit-sub-badges">
                    <span class="badge badge-low">Zvládnuto ${doneDate}</span>
                    <span class="badge badge-date mono">${totalDays} dnů (+${bonus} XP bonus)</span>
                  </div>
                </div>
              </div>
              <div class="habit-right">
                <button type="button" class="btn btn-ghost btn-xs" data-reopen-habit="${h.id}" title="Znovu aktivovat">↺ Obnovit</button>
                <button type="button" class="icon-btn delete" data-del-habit="${h.id}" title="Smazat">✕</button>
              </div>
            </div>
          `;
        })
        .join('');
    }
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
            xp_value: 10,
            due_date: el.dueInput?.value || null,
            is_completed: false,
          },
        ]);

        if (error) {
          window.appShowError(`Chyba přidání aktivity: ${error.message}`);
          return;
        }

        el.nameInput.value = '';
        if (el.dueInput) el.dueInput.value = '';
        window.appShowToast(`Aktivita „${name}“ přidána do denního přehledu.`);
        await loadAll();
      });
    }

    const handleHabitClick = async (e) => {
      // Smazat
      const delBtn = e.target.closest('[data-del-habit]');
      if (delBtn) {
        if (!confirm('Smazat tuto aktivitu včetně celé její historie?')) return;
        const { error } = await db.from('habits').delete().eq('id', delBtn.dataset.delHabit);
        if (error) {
          window.appShowError(`Chyba mazání: ${error.message}`);
          return;
        }
        await loadAll();
        window.ProgressModule?.refresh();
        return;
      }

      // Uzavřít navždy jako naučené / dokončené
      const finishBtn = e.target.closest('[data-finish-habit]');
      if (finishBtn) {
        const habitId = finishBtn.dataset.finishHabit;
        const habit = habits.find((h) => h.id === habitId);
        const { totalDays } = getHabitStats(habitId);
        const bonusTxt =
          totalDays >= 5
            ? `Získáš jednorázový bonus +${Math.min(150, totalDays * 5)} XP za ${totalDays} odpracovaných dnů.`
            : `Odpracováno zatím jen ${totalDays} dnů (bonus za dokončení se uděluje od 5 dnů, aby to nešlo abusovat).`;

        if (!confirm(`Označit „${habit?.name}“ jako natrvalo dokončené / naučené?\n\n${bonusTxt}`)) {
          return;
        }

        const { error } = await db
          .from('habits')
          .update({ is_completed: true, completed_at: new Date().toISOString() })
          .eq('id', habitId);

        if (error) {
          window.appShowError(`Chyba dokončení: ${error.message}`);
          return;
        }
        window.appShowToast('Dlouhodobý cíl úspěšně uzavřen!');
        await loadAll();
        window.ProgressModule?.refresh();
        return;
      }

      // Obnovit z archivu
      const reopenBtn = e.target.closest('[data-reopen-habit]');
      if (reopenBtn) {
        const { error } = await db
          .from('habits')
          .update({ is_completed: false, completed_at: null })
          .eq('id', reopenBtn.dataset.reopenHabit);
        if (error) {
          window.appShowError(`Chyba obnovení: ${error.message}`);
          return;
        }
        await loadAll();
        window.ProgressModule?.refresh();
        return;
      }

      // Odškrtnutí dnešního dne
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
            window.appShowError(`Chyba uložení: ${error.message}`);
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
            window.appShowError(`Chyba odškrtnutí: ${error.message}`);
            e.target.checked = true;
            return;
          }
        }

        await loadAll();
        window.ProgressModule?.refresh();
      }
    };

    if (el.list) el.list.addEventListener('click', handleHabitClick);
    if (el.completedList) el.completedList.addEventListener('click', handleHabitClick);
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