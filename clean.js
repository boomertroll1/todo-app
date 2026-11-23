window.CleanModule = (() => {
  let db = null;
  let user = null;
  let trackers = [];
  let relapses = [];
  let selectedYear = new Date().getFullYear();
  let initializedListeners = false;

  const MONTH_SHORT = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];
  const el = {};

  function cacheElements() {
    el.form = document.getElementById('clean-add-form');
    el.nameInput = document.getElementById('clean-name-input');
    el.colorInput = document.getElementById('clean-color-input');
    el.startInput = document.getElementById('clean-start-input');
    el.yearLabel = document.getElementById('clean-year-label');
    el.prevYearBtn = document.getElementById('clean-prev-year');
    el.nextYearBtn = document.getElementById('clean-next-year');
    el.list = document.getElementById('clean-trackers-list');
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

  function parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function computeTrackerStats(tracker, relapseSet) {
    const today = todayStr();
    if (!tracker.start_date || tracker.start_date > today) {
      return { currentStreak: 0, longestStreak: 0, cleanDays: 0, totalDays: 0, pct: 100 };
    }

    let cursor = parseLocalDate(tracker.start_date);
    const end = parseLocalDate(today);

    let currentStreak = 0;
    let longestStreak = 0;
    let cleanDays = 0;
    let totalDays = 0;

    while (cursor <= end) {
      const dStr = toDateStr(cursor);
      totalDays++;
      if (relapseSet.has(dStr)) {
        currentStreak = 0;
      } else {
        cleanDays++;
        currentStreak++;
        if (currentStreak > longestStreak) longestStreak = currentStreak;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const pct = totalDays ? Math.round((cleanDays / totalDays) * 100) : 100;
    return { currentStreak, longestStreak, cleanDays, totalDays, pct };
  }

  function buildCleanHeatmapHtml(tracker, relapseSet, year) {
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

    const weeksHtml = weeks
      .map((days) => {
        const cells = days
          .map((cell) => {
            if (!cell.inYear) return '<span class="hm-cell hm-out"></span>';

            const isTracked = cell.dateStr >= tracker.start_date && cell.dateStr <= today;
            const isRelapse = relapseSet.has(cell.dateStr);

            let bg = 'rgba(255, 255, 255, 0.04)';
            let statusTxt = 'Nesledováno';
            if (isRelapse) {
              bg = '#ff4757';
              statusTxt = 'Selhání (klikni pro zrušení)';
            } else if (isTracked) {
              bg = tracker.color || '#10b981';
              statusTxt = 'Čistý den (klikni pro označení selhání)';
            }

            const clickable = isTracked || isRelapse;
            const title = `${cell.dateStr}: ${statusTxt}`;

            return `<button type="button" class="hm-cell ${cell.isToday ? 'hm-today' : ''} ${clickable ? '' : 'hm-inactive'}" style="background:${bg};" ${
              clickable ? `data-clean-cell="${tracker.id}" data-clean-date="${cell.dateStr}"` : 'disabled'
            } title="${title}" aria-label="${title}"></button>`;
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

  async function loadAll() {
    if (!db || !user) return;

    const [tRes, rRes] = await Promise.all([
      db.from('clean_trackers').select('*').order('created_at', { ascending: true }),
      db.from('clean_relapses').select('*').limit(5000),
    ]);

    if (tRes.error) window.appShowError(`Chyba trackerů: ${tRes.error.message}`);
    if (rRes.error) window.appShowError(`Chyba záznamů: ${rRes.error.message}`);

    trackers = tRes.data || [];
    relapses = rRes.data || [];
    render();
  }

  function render() {
    if (!el.list) return;
    if (el.yearLabel) el.yearLabel.textContent = String(selectedYear);

    if (!trackers.length) {
      el.list.innerHTML =
        '<p class="empty-state">Zatím nic nesleduješ. Přidej si třeba „Bez reels“, „Bez porna“ nebo „Bez cukru“ — každý den se sám barví jako čistý a klikáš jen při selhání.</p>';
      return;
    }

    const today = todayStr();
    const relapsesByTracker = {};
    relapses.forEach((r) => {
      if (!relapsesByTracker[r.tracker_id]) relapsesByTracker[r.tracker_id] = new Set();
      relapsesByTracker[r.tracker_id].add(r.relapse_date);
    });

    el.list.innerHTML = trackers
      .map((t) => {
        const rSet = relapsesByTracker[t.id] || new Set();
        const stats = computeTrackerStats(t, rSet);
        const relapsedToday = rSet.has(today);

        return `
          <article class="card skill-card" style="--skill-color: ${t.color || '#10b981'};">
            <div class="skill-card-head">
              <div class="skill-title-wrap">
                <div>
                  <div class="skill-name-row">
                    <h3>${escapeHtml(t.name)}</h3>
                    <span class="badge badge-low mono">${stats.pct} % čistých</span>
                  </div>
                  <div class="skill-time mono">
                    Od ${t.start_date} · <span class="muted">Rekord: ${stats.longestStreak}d · Čistých: ${stats.cleanDays}/${stats.totalDays}d</span>
                  </div>
                </div>
              </div>

              <div class="skill-head-actions">
                <span class="clean-streak-pill mono ${stats.currentStreak > 0 ? 'active' : ''}" title="Aktuální čistý streak">
                  ${stats.currentStreak}d čistý
                </span>
                <button type="button" class="btn-relapse ${relapsedToday ? 'is-relapsed' : ''}" data-relapse-today="${t.id}" title="Označit nebo zrušit dnešní selhání">
                  ${relapsedToday ? '↺ Zrušit selhání dnes' : 'Selhání dnes'}
                </button>
                <button type="button" class="icon-btn delete" data-del-clean="${t.id}" title="Smazat tracker">✕</button>
              </div>
            </div>

            ${buildCleanHeatmapHtml(t, rSet, selectedYear)}
          </article>
        `;
      })
      .join('');
  }

  async function toggleRelapse(trackerId, dateStr, askConfirm = false) {
    const existing = relapses.find(
      (r) => r.tracker_id === trackerId && r.relapse_date === dateStr
    );

    if (existing) {
      const { error } = await db
        .from('clean_relapses')
        .delete()
        .eq('tracker_id', trackerId)
        .eq('relapse_date', dateStr);
      if (error) {
        window.appShowError(`Chyba zrušení: ${error.message}`);
        return;
      }
      window.appShowToast(`Den ${dateStr} je opět čistý.`);
      await loadAll();
    } else {
      if (askConfirm && !confirm(`Označit den ${dateStr} jako selhání? (Streak se přepočítá)`)) {
        return;
      }
      const { error } = await db
        .from('clean_relapses')
        .upsert([{ user_id: user.id, tracker_id: trackerId, relapse_date: dateStr }], {
          onConflict: 'tracker_id,relapse_date',
        });
      if (error) {
        window.appShowError(`Chyba záznamu: ${error.message}`);
        return;
      }
      window.appShowToast(`Zapsáno selhání (${dateStr}). Zítra jedeme znova.`);
      await loadAll();
    }
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    if (el.prevYearBtn) {
      el.prevYearBtn.addEventListener('click', () => {
        selectedYear--;
        render();
      });
    }
    if (el.nextYearBtn) {
      el.nextYearBtn.addEventListener('click', () => {
        selectedYear++;
        render();
      });
    }

    if (el.form) {
      el.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user || !db) {
          window.appShowError('Nejsi přihlášený.');
          return;
        }
        const name = (el.nameInput?.value || '').trim();
        if (!name) return;

        const submitBtn = el.form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
          const { error } = await db.from('clean_trackers').insert([
            {
              user_id: user.id,
              name,
              icon: '',
              color: el.colorInput?.value || '#10b981',
              start_date: el.startInput?.value || todayStr(),
            },
          ]);

          if (error) {
            window.appShowError(`Chyba přidání: ${error.message}`);
            return;
          }

          if (el.nameInput) el.nameInput.value = '';
          window.appShowToast(`Tracker „${name}“ přidán.`);
          await loadAll();
        } catch (err) {
          window.appShowError(`Chyba: ${err.message}`);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    if (el.list) {
      el.list.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-clean]');
        if (delBtn) {
          if (!confirm('Smazat tento tracker včetně celé roční historie?')) return;
          const { error } = await db.from('clean_trackers').delete().eq('id', delBtn.dataset.delClean);
          if (error) {
            window.appShowError(`Chyba mazání: ${error.message}`);
            return;
          }
          window.appShowToast('Tracker smazán.');
          await loadAll();
          return;
        }

        const todayBtn = e.target.closest('[data-relapse-today]');
        if (todayBtn) {
          await toggleRelapse(todayBtn.dataset.relapseToday, todayStr(), true);
          return;
        }

        const cell = e.target.closest('[data-clean-cell]');
        if (cell) {
          await toggleRelapse(cell.dataset.cleanCell, cell.dataset.cleanDate, true);
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
      if (el.startInput && !el.startInput.value) {
        el.startInput.value = todayStr();
      }
      loadAll();
    },
    refresh() {
      loadAll();
    },
    reset() {
      user = null;
      trackers = [];
      relapses = [];
    },
  };
})();