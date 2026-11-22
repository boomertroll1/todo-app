window.WorkoutsModule = (() => {
  let db = null;
  let user = null;
  let workouts = [];
  let sets = [];
  let latestBodyWeight = null;
  let selectedExercise = '';
  let charts = { exercise: null, volume: null };
  let initializedListeners = false;

  const DEFAULT_EXERCISES = [
    'Bench Press',
    'Incline Bench Press',
    'Squat',
    'Deadlift',
    'Pull-ups',
    'Overhead Press',
    'Leg Press',
    'Cable Row',
    'Lateral Raises',
    'Preacher Curl',
  ];

  const el = {};

  function cacheElements() {
    el.form = document.getElementById('workout-form');
    el.date = document.getElementById('wo-date');
    el.name = document.getElementById('wo-name');
    el.duration = document.getElementById('wo-duration');
    el.rpe = document.getElementById('wo-rpe');
    el.notes = document.getElementById('wo-notes');
    el.setsContainer = document.getElementById('wo-sets-container');
    el.addSetBtn = document.getElementById('wo-add-set-btn');
    el.saveBtn = document.getElementById('wo-save-btn');
    el.presetBtns = document.querySelectorAll('.wo-preset');
    el.exerciseDatalist = document.getElementById('exercise-datalist');

    el.exerciseSelect = document.getElementById('wo-exercise-select');
    el.statsGrid = document.getElementById('wo-stats-grid');
    el.historyList = document.getElementById('wo-history-list');
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function todayStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function calcE1RM(weight, reps) {
    const w = Number(weight);
    const r = Number(reps);
    if (!w || !r) return 0;
    return r === 1 ? w : w * (1 + r / 30);
  }

  function kpiCard(label, value, sub = '', tone = '') {
    return `
      <div class="kpi-card">
        <span class="kpi-label">${label}</span>
        <span class="kpi-value ${tone}">${value}</span>
        <span class="kpi-sub">${sub}</span>
      </div>
    `;
  }

  function addSetRow(prefill = {}) {
    const rows = el.setsContainer.querySelectorAll('.set-row');
    const lastRow = rows[rows.length - 1];

    const exercise =
      prefill.exercise ?? (lastRow ? lastRow.querySelector('.set-exercise').value : '');
    const weight =
      prefill.weight ?? (lastRow ? lastRow.querySelector('.set-weight').value : '');
    const reps = prefill.reps ?? '';
    const isWarmup = prefill.isWarmup ?? false;

    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <input type="text" class="set-exercise" list="exercise-datalist" placeholder="Cvik (např. Bench Press)" value="${escapeHtml(exercise)}" required>
      <input type="number" class="set-weight" step="0.5" min="0" max="600" placeholder="Váha (kg)" value="${weight}" required>
      <input type="number" class="set-reps" step="1" min="1" max="100" placeholder="Opak." value="${reps}" required>
      <label class="warmup-toggle" title="Zahřívací série (nepočítá se do PR a pracovní tonáže)">
        <input type="checkbox" class="set-warmup" ${isWarmup ? 'checked' : ''}>
        <span>W</span>
      </label>
      <button type="button" class="icon-btn delete remove-set-btn" title="Odebrat sérii">✕</button>
    `;
    el.setsContainer.appendChild(row);
  }

  function resetForm() {
    el.date.value = todayStr();
    el.name.value = '';
    el.duration.value = '';
    el.rpe.value = '';
    el.notes.value = '';
    el.setsContainer.innerHTML = '';
    addSetRow();
  }

  async function loadAll() {
    if (!db || !user) return;

    const [woRes, setsRes, bwRes] = await Promise.all([
      db.from('workouts').select('*').order('workout_date', { ascending: false }).limit(120),
      db.from('workout_sets').select('*').order('created_at', { ascending: true }).limit(2000),
      db
        .from('daily_logs')
        .select('weight_kg')
        .not('weight_kg', 'is', null)
        .order('log_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (woRes.error) window.appShowError(`Chyba tréninků: ${woRes.error.message}`);
    if (setsRes.error) window.appShowError(`Chyba sérií: ${setsRes.error.message}`);

    workouts = woRes.data || [];
    sets = setsRes.data || [];
    latestBodyWeight = bwRes.data?.weight_kg ? Number(bwRes.data.weight_kg) : null;

    updateExerciseLists();
    renderAll();
  }

  function updateExerciseLists() {
    const loggedExercises = [...new Set(sets.map((s) => s.exercise_name.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, 'cs')
    );

    const allSuggestions = [...new Set([...loggedExercises, ...DEFAULT_EXERCISES])];
    el.exerciseDatalist.innerHTML = allSuggestions
      .map((name) => `<option value="${escapeHtml(name)}">`)
      .join('');

    if (!loggedExercises.length) {
      el.exerciseSelect.innerHTML = '<option value="">Zatím bez zapsaných cviků</option>';
      selectedExercise = '';
      return;
    }

    if (!selectedExercise || !loggedExercises.includes(selectedExercise)) {
      selectedExercise = loggedExercises[0];
    }

    el.exerciseSelect.innerHTML = loggedExercises
      .map(
        (name) =>
          `<option value="${escapeHtml(name)}" ${name === selectedExercise ? 'selected' : ''}>${escapeHtml(name)}</option>`
      )
      .join('');
  }

  function computeMetrics() {
    const workoutMap = new Map(workouts.map((w) => [w.id, w]));
    const now = new Date();
    const cutoff7 = new Date(now.getTime() - 7 * 86400000);
    const cutoff30 = new Date(now.getTime() - 30 * 86400000);

    let tonnage7 = 0;
    let tonnage30 = 0;
    let workingSets7 = 0;
    let workingSets30 = 0;

    const volumeByWorkout = new Map();
    const setsByWorkout = new Map();

    sets.forEach((s) => {
      const w = workoutMap.get(s.workout_id);
      if (!w) return;

      if (!setsByWorkout.has(w.id)) setsByWorkout.set(w.id, []);
      setsByWorkout.get(w.id).push(s);

      if (s.is_warmup) return;

      const vol = Number(s.weight_kg) * Number(s.reps);
      volumeByWorkout.set(w.id, (volumeByWorkout.get(w.id) || 0) + vol);

      const d = new Date(w.workout_date + 'T12:00:00');
      if (d >= cutoff7) {
        tonnage7 += vol;
        workingSets7++;
      }
      if (d >= cutoff30) {
        tonnage30 += vol;
        workingSets30++;
      }
    });

    // Metriky pro vybraný cvik
    let bestE1RM = null;
    let bestWeight = null;
    let bestWeightReps = null;
    let progress30Pct = null;
    let exerciseTimeline = [];

    if (selectedExercise) {
      const exSets = sets
        .filter((s) => !s.is_warmup && s.exercise_name.trim() === selectedExercise)
        .map((s) => {
          const w = workoutMap.get(s.workout_id);
          return w ? { ...s, workout_date: w.workout_date } : null;
        })
        .filter(Boolean);

      const byDate = new Map();
      exSets.forEach((s) => {
        const wKg = Number(s.weight_kg);
        const reps = Number(s.reps);
        const e1rm = calcE1RM(wKg, reps);

        if (bestE1RM == null || e1rm > bestE1RM) bestE1RM = e1rm;
        if (bestWeight == null || wKg > bestWeight || (wKg === bestWeight && reps > bestWeightReps)) {
          bestWeight = wKg;
          bestWeightReps = reps;
        }

        const curr = byDate.get(s.workout_date);
        if (!curr) {
          byDate.set(s.workout_date, { date: s.workout_date, maxE1RM: e1rm, maxWeight: wKg });
        } else {
          if (e1rm > curr.maxE1RM) curr.maxE1RM = e1rm;
          if (wKg > curr.maxWeight) curr.maxWeight = wKg;
        }
      });

      exerciseTimeline = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

      if (exerciseTimeline.length >= 2) {
        const latest = exerciseTimeline[exerciseTimeline.length - 1];
        const refCutoff = new Date(new Date(latest.date + 'T12:00:00').getTime() - 30 * 86400000);
        const inWindow = exerciseTimeline.filter((p) => new Date(p.date + 'T12:00:00') >= refCutoff);
        const baseline = inWindow.length >= 2 ? inWindow[0] : exerciseTimeline[0];
        if (baseline.maxE1RM > 0) {
          progress30Pct = ((latest.maxE1RM - baseline.maxE1RM) / baseline.maxE1RM) * 100;
        }
      }
    }

    const relativeStrength =
      bestE1RM && latestBodyWeight ? bestE1RM / latestBodyWeight : null;

    const volumeTimeline = [...workouts]
      .sort((a, b) => a.workout_date.localeCompare(b.workout_date))
      .slice(-20)
      .map((w) => ({
        label: `${w.workout_date.slice(5).split('-').reverse().join('.')} (${w.name})`,
        volume: Math.round(volumeByWorkout.get(w.id) || 0),
      }));

    return {
      tonnage7,
      tonnage30,
      workingSets7,
      workingSets30,
      bestE1RM,
      bestWeight,
      bestWeightReps,
      relativeStrength,
      progress30Pct,
      exerciseTimeline,
      volumeTimeline,
      volumeByWorkout,
      setsByWorkout,
    };
  }

  function renderAll() {
    const m = computeMetrics();

    el.statsGrid.innerHTML = [
      kpiCard(
        'Odhad 1RM (e1RM)',
        m.bestE1RM ? `${m.bestE1RM.toFixed(1)} kg` : '—',
        selectedExercise || 'Vyber cvik',
        'kpi-accent'
      ),
      kpiCard(
        'Osobní rekord (PR)',
        m.bestWeight ? `${m.bestWeight} kg × ${m.bestWeightReps}` : '—',
        'Max pracovní série',
        m.bestWeight ? 'kpi-good' : ''
      ),
      kpiCard(
        'Relativní síla',
        m.relativeStrength ? `${m.relativeStrength.toFixed(2)}× BW` : '—',
        latestBodyWeight ? `K váze ${latestBodyWeight} kg` : 'Zapiš váhu v sekci Tělo'
      ),
      kpiCard(
        'Progres cviku (30d)',
        m.progress30Pct != null
          ? `${m.progress30Pct > 0 ? '+' : ''}${m.progress30Pct.toFixed(1)} %`
          : '—',
        'Změna e1RM v okně 30 dní',
        m.progress30Pct == null ? '' : m.progress30Pct >= 0 ? 'kpi-good' : 'kpi-bad'
      ),
      kpiCard(
        'Tonáž (7d / 30d)',
        `${Math.round(m.tonnage7).toLocaleString('cs-CZ')} kg`,
        `30d: ${Math.round(m.tonnage30).toLocaleString('cs-CZ')} kg`
      ),
      kpiCard(
        'Pracovní série',
        `${m.workingSets7} (7d)`,
        `30d: ${m.workingSets30} sérií (bez zahřívacích)`
      ),
    ].join('');

    renderCharts(m);
    renderHistory(m);
  }

  function renderCharts(m) {
    if (typeof Chart === 'undefined') return;
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
      },
    };

    if (charts.exercise) charts.exercise.destroy();
    charts.exercise = new Chart(document.getElementById('exercise-chart'), {
      type: 'line',
      data: {
        labels: m.exerciseTimeline.map((p) => p.date.slice(5).split('-').reverse().join('.')),
        datasets: [
          {
            label: `e1RM – ${selectedExercise || 'Cvik'} (kg)`,
            data: m.exerciseTimeline.map((p) => Number(p.maxE1RM.toFixed(1))),
            borderColor: '#3b82f6',
            backgroundColor: '#3b82f6',
            borderWidth: 2.5,
            tension: 0.25,
          },
          {
            label: 'Max zvednutá váha (kg)',
            data: m.exerciseTimeline.map((p) => p.maxWeight),
            borderColor: '#10b981',
            borderDash: [5, 4],
            borderWidth: 1.8,
            tension: 0.25,
          },
        ],
      },
      options: baseOptions,
    });

    if (charts.volume) charts.volume.destroy();
    charts.volume = new Chart(document.getElementById('volume-chart'), {
      type: 'bar',
      data: {
        labels: m.volumeTimeline.map((p) => p.label),
        datasets: [
          {
            label: 'Pracovní tonáž (kg)',
            data: m.volumeTimeline.map((p) => p.volume),
            backgroundColor: 'rgba(139, 92, 246, 0.65)',
            borderRadius: 4,
          },
        ],
      },
      options: baseOptions,
    });
  }

  function renderHistory(m) {
    if (!workouts.length) {
      el.historyList.innerHTML = '<p class="empty-state">Zatím nemáš zapsaný žádný trénink.</p>';
      return;
    }

    el.historyList.innerHTML = workouts
      .slice(0, 25)
      .map((w) => {
        const wSets = m.setsByWorkout.get(w.id) || [];
        const vol = Math.round(m.volumeByWorkout.get(w.id) || 0);
        const workingCount = wSets.filter((s) => !s.is_warmup).length;

        // Seskupení sérií podle cviku pro přehledný výpis
        const grouped = new Map();
        wSets.forEach((s) => {
          if (!grouped.has(s.exercise_name)) grouped.set(s.exercise_name, []);
          grouped.get(s.exercise_name).push(s);
        });

        const exercisesHtml = [...grouped.entries()]
          .map(([exName, list]) => {
            const summary = list
              .map((s) => `${s.weight_kg}×${s.reps}${s.is_warmup ? ' (W)' : ''}`)
              .join(', ');
            return `<div class="wo-ex-line"><strong>${escapeHtml(exName)}:</strong> ${summary}</div>`;
          })
          .join('');

        const metaParts = [`${workingCount} prac. sérií`, `${vol.toLocaleString('cs-CZ')} kg`];
        if (w.duration_min) metaParts.push(`${w.duration_min} min`);
        if (w.rpe) metaParts.push(`RPE ${w.rpe}`);

        return `
          <details class="wo-card">
            <summary class="wo-summary">
              <div class="history-main">
                <div class="history-date-line">
                  <span>${escapeHtml(w.name)}</span>
                  <span class="badge badge-gym">${w.workout_date}</span>
                </div>
                <div class="history-metrics">${metaParts.join(' · ')}</div>
              </div>
              <button type="button" class="icon-btn delete" data-del-wo="${w.id}" title="Smazat trénink">✕</button>
            </summary>
            <div class="wo-details-body">
              ${exercisesHtml || '<span class="muted">Bez zapsaných sérií</span>'}
              ${w.notes ? `<div class="muted" style="margin-top:6px;">Poznámka: ${escapeHtml(w.notes)}</div>` : ''}
            </div>
          </details>
        `;
      })
      .join('');
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    el.presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        el.name.value = btn.dataset.preset;
      });
    });

    el.addSetBtn.addEventListener('click', () => addSetRow());

    el.setsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-set-btn');
      if (!btn) return;
      if (el.setsContainer.querySelectorAll('.set-row').length > 1) {
        btn.closest('.set-row').remove();
      }
    });

    el.exerciseSelect.addEventListener('change', () => {
      selectedExercise = el.exerciseSelect.value;
      renderAll();
    });

    el.form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!user) return;

      const rows = [...el.setsContainer.querySelectorAll('.set-row')];
      const parsedSets = [];
      const setCounters = {};

      for (const row of rows) {
        const ex = row.querySelector('.set-exercise').value.trim();
        const w = Number(row.querySelector('.set-weight').value);
        const r = Number(row.querySelector('.set-reps').value);
        const warmup = row.querySelector('.set-warmup').checked;
        if (!ex || Number.isNaN(w) || !r) continue;
        setCounters[ex] = (setCounters[ex] || 0) + 1;
        parsedSets.push({
          exercise_name: ex,
          set_number: setCounters[ex],
          weight_kg: w,
          reps: r,
          is_warmup: warmup,
        });
      }

      if (!parsedSets.length) {
        window.appShowError('Přidej alespoň jednu sérii.');
        return;
      }

      el.saveBtn.disabled = true;

      const { data: wo, error: woErr } = await db
        .from('workouts')
        .insert([
          {
            user_id: user.id,
            workout_date: el.date.value,
            name: el.name.value.trim(),
            duration_min: el.duration.value ? Number(el.duration.value) : null,
            rpe: el.rpe.value ? Number(el.rpe.value) : null,
            notes: el.notes.value.trim() || null,
          },
        ])
        .select()
        .single();

      if (woErr) {
        el.saveBtn.disabled = false;
        window.appShowError(`Chyba ukládání tréninku: ${woErr.message}`);
        return;
      }

      const setsPayload = parsedSets.map((s) => ({
        ...s,
        workout_id: wo.id,
        user_id: user.id,
      }));

      const { error: setsErr } = await db.from('workout_sets').insert(setsPayload);
      el.saveBtn.disabled = false;

      if (setsErr) {
        window.appShowError(`Trénink uložen, ale série selhaly: ${setsErr.message}`);
        return;
      }

      window.appShowToast(`Trénink uložen (${parsedSets.length} sérií).`);
      resetForm();
      await loadAll();
    });

    el.historyList.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-del-wo]');
      if (!delBtn) return;
      e.preventDefault();
      e.stopPropagation();
      if (!confirm('Smazat celý trénink včetně všech sérií?')) return;

      const { error } = await db.from('workouts').delete().eq('id', delBtn.dataset.delWo);
      if (error) {
        window.appShowError(`Chyba mazání tréninku: ${error.message}`);
        return;
      }
      window.appShowToast('Trénink smazán.');
      await loadAll();
    });
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      resetForm();
      loadAll();
    },
    refresh() {
      loadAll();
    },
    onShow() {
      renderAll();
    },
    reset() {
      user = null;
      workouts = [];
      sets = [];
    },
  };
})();