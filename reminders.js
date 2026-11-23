window.RemindersModule = (() => {
  let db = null;
  let user = null;
  let reminders = [];
  let logs = [];
  let initializedListeners = false;

  const FREQ_LABEL = {
    daily: 'Každý den',
    weekdays: 'Po–Pá',
    weekends: 'Víkend',
  };

  const el = {};

  function cacheElements() {
    el.progressText = document.getElementById('reminders-progress-text');
    el.progressFill = document.getElementById('reminders-progress-fill');
    el.list = document.getElementById('reminders-list');
    el.form = document.getElementById('reminders-add-form');
    el.titleInput = document.getElementById('reminder-title-input');
    el.freqInput = document.getElementById('reminder-freq-input');
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

  function appliesToDate(frequency, dateObj) {
    const jsDay = dateObj.getDay(); // 0 = Ne, 6 = So
    if (frequency === 'weekdays') return jsDay >= 1 && jsDay <= 5;
    if (frequency === 'weekends') return jsDay === 0 || jsDay === 6;
    return true;
  }

  function computeStreak(reminder, logDateSet) {
    let streak = 0;
    const cursor = new Date();
    const today = toDateStr(cursor);

    if (!logDateSet.has(today)) {
      cursor.setDate(cursor.getDate() - 1);
    }

    for (let i = 0; i < 730; i++) {
      if (!appliesToDate(reminder.frequency, cursor)) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      const dStr = toDateStr(cursor);
      if (logDateSet.has(dStr)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  async function loadAll() {
    if (!db || !user) return;

    const [remRes, logsRes] = await Promise.all([
      db
        .from('daily_reminders')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      db
        .from('daily_reminder_logs')
        .select('reminder_id, log_date')
        .order('log_date', { ascending: false })
        .limit(5000),
    ]);

    if (remRes.error) window.appShowError(`Chyba připomínek: ${remRes.error.message}`);
    if (logsRes.error) window.appShowError(`Chyba záznamů připomínek: ${logsRes.error.message}`);

    reminders = remRes.data || [];
    logs = logsRes.data || [];
    render();
  }

  function render() {
    if (!el.list) return;

    const now = new Date();
    const today = toDateStr(now);

    const logsByReminder = {};
    logs.forEach((l) => {
      if (!logsByReminder[l.reminder_id]) logsByReminder[l.reminder_id] = new Set();
      logsByReminder[l.reminder_id].add(l.log_date);
    });

    const todaysReminders = reminders.filter((r) => appliesToDate(r.frequency, now));
    const doneToday = todaysReminders.filter((r) => logsByReminder[r.id]?.has(today)).length;
    const totalToday = todaysReminders.length;
    const pct = totalToday ? Math.round((doneToday / totalToday) * 100) : 0;

    if (el.progressText) el.progressText.textContent = `${doneToday} / ${totalToday} dnes`;
    if (el.progressFill) el.progressFill.style.width = `${pct}%`;

    if (!todaysReminders.length) {
      el.list.innerHTML =
        '<p class="muted" style="font-size:0.84rem; text-align:center; padding:6px 0;">Zatím žádné každodenní připomínky. Přidej si třeba „Vzít kreatin (10 g)“ nebo „10 000 kroků“ — zítra se objeví samy znovu.</p>';
      return;
    }

    const sorted = [...todaysReminders].sort((a, b) => {
      const aDone = logsByReminder[a.id]?.has(today) ? 1 : 0;
      const bDone = logsByReminder[b.id]?.has(today) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.created_at.localeCompare(b.created_at);
    });

    el.list.innerHTML = sorted
      .map((r) => {
        const logSet = logsByReminder[r.id] || new Set();
        const isDone = logSet.has(today);
        const streak = computeStreak(r, logSet);
        const freqBadge =
          r.frequency !== 'daily'
            ? `<span class="badge badge-date">${FREQ_LABEL[r.frequency] || r.frequency}</span>`
            : '';
        const streakBadge =
          streak > 0
            ? `<span class="clean-streak-pill mono active" title="Dní v řadě">${streak}d</span>`
            : '';

        return `
          <div class="reminder-row ${isDone ? 'done' : ''}" data-rem-id="${r.id}">
            <input type="checkbox" class="todo-checkbox rem-check" ${isDone ? 'checked' : ''} aria-label="Splněno dnes">
            <div class="reminder-row-main">
              <span class="reminder-row-title">${escapeHtml(r.title)}</span>
              ${freqBadge}
            </div>
            <div class="reminder-row-actions">
              ${streakBadge}
              <button type="button" class="icon-btn delete" data-del-rem="${r.id}" title="Zrušit opakování navždy">✕</button>
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
        const title = (el.titleInput?.value || '').trim();
        if (!title) return;

        const { error } = await db.from('daily_reminders').insert([
          {
            user_id: user.id,
            title,
            frequency: el.freqInput?.value || 'daily',
            is_active: true,
          },
        ]);

        if (error) {
          window.appShowError(`Chyba přidání připomínky: ${error.message}`);
          return;
        }

        if (el.titleInput) el.titleInput.value = '';
        window.appShowToast(`Přidáno: „${title}“ se bude připomínat každý den.`);
        await loadAll();
      });
    }

    if (el.list) {
      el.list.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-rem]');
        if (delBtn) {
          if (!confirm('Zrušit tuto opakovanou připomínku natrvalo?')) return;
          const { error } = await db
            .from('daily_reminders')
            .delete()
            .eq('id', delBtn.dataset.delRem);

          if (error) {
            window.appShowError(`Chyba mazání: ${error.message}`);
            return;
          }
          window.appShowToast('Připomínka odstraněna.');
          await loadAll();
          window.ProgressModule?.refresh();
          window.CalendarModule?.refresh();
          return;
        }

        if (e.target.classList.contains('rem-check')) {
          const row = e.target.closest('.reminder-row');
          const id = row.dataset.remId;
          const checked = e.target.checked;
          const today = todayStr();

          if (checked) {
            const { error } = await db
              .from('daily_reminder_logs')
              .upsert([{ user_id: user.id, reminder_id: id, log_date: today }], {
                onConflict: 'reminder_id,log_date',
              });

            if (error) {
              window.appShowError(`Chyba zápisu: ${error.message}`);
              e.target.checked = false;
              return;
            }
          } else {
            const { error } = await db
              .from('daily_reminder_logs')
              .delete()
              .eq('reminder_id', id)
              .eq('log_date', today);

            if (error) {
              window.appShowError(`Chyba zrušení: ${error.message}`);
              e.target.checked = true;
              return;
            }
          }

          await loadAll();
          window.ProgressModule?.refresh();
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
      loadAll();
    },
    refresh() {
      loadAll();
    },
    reset() {
      user = null;
      reminders = [];
      logs = [];
    },
  };
})();