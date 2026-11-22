window.GymModule = (() => {
  let db = null;
  let user = null;
  let profile = null;
  let logs = [];
  let charts = { weight: null, nutrition: null, activity: null };
  let initializedListeners = false;

  const DAY_TYPE_LABEL = { gym: 'Gym', rest: 'Rest', cardio: 'Kardio' };

  const el = {};

  function cacheElements() {
    el.profileSummary = document.getElementById('profile-summary');
    el.openProfileBtn = document.getElementById('open-profile-btn');
    el.profileDialog = document.getElementById('profile-dialog');
    el.profileForm = document.getElementById('profile-form');
    el.cancelProfileBtn = document.getElementById('cancel-profile-btn');
    el.profHeight = document.getElementById('prof-height');
    el.profTargetWeight = document.getElementById('prof-target-weight');
    el.profTargetKcal = document.getElementById('prof-target-kcal');
    el.profTargetProtein = document.getElementById('prof-target-protein');
    el.profTargetSteps = document.getElementById('prof-target-steps');
    el.profTargetWorkouts = document.getElementById('prof-target-workouts');

    el.logForm = document.getElementById('daily-log-form');
    el.logDate = document.getElementById('log-date');
    el.logDayType = document.getElementById('log-day-type');
    el.logWeight = document.getElementById('log-weight');
    el.logKcal = document.getElementById('log-kcal');
    el.logProtein = document.getElementById('log-protein');
    el.logCarbs = document.getElementById('log-carbs');
    el.logFat = document.getElementById('log-fat');
    el.logSteps = document.getElementById('log-steps');
    el.logSleep = document.getElementById('log-sleep');
    el.logNotes = document.getElementById('log-notes');
    el.logEditHint = document.getElementById('log-edit-hint');
    el.saveLogBtn = document.getElementById('save-log-btn');

    el.statsSampleInfo = document.getElementById('stats-sample-info');
    el.statsBodyGrid = document.getElementById('stats-body-grid');
    el.statsNutritionGrid = document.getElementById('stats-nutrition-grid');
    el.statsConsistencyGrid = document.getElementById('stats-consistency-grid');
    el.logsHistory = document.getElementById('logs-history');
  }

  function fmt(val, decimals = 1, suffix = '') {
    if (val == null || Number.isNaN(val)) return '—';
    return `${Number(val).toFixed(decimals)}${suffix}`;
  }

  function fmtInt(val, suffix = '') {
    if (val == null || Number.isNaN(val)) return '—';
    return `${Math.round(val).toLocaleString('cs-CZ')}${suffix}`;
  }

  function fmtSigned(val, decimals = 2, suffix = '') {
    if (val == null || Number.isNaN(val)) return '—';
    const sign = val > 0 ? '+' : '';
    return `${sign}${Number(val).toFixed(decimals)}${suffix}`;
  }

  function numOrNull(input) {
    const v = input.value.trim();
    return v === '' ? null : Number(v);
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

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function fillFormForDate(dateStr) {
    el.logDate.value = dateStr;
    const existing = logs.find((l) => l.log_date === dateStr);
    if (existing) {
      el.logDayType.value = existing.day_type || 'gym';
      el.logWeight.value = existing.weight_kg ?? '';
      el.logKcal.value = existing.calories ?? '';
      el.logProtein.value = existing.protein_g ?? '';
      el.logCarbs.value = existing.carbs_g ?? '';
      el.logFat.value = existing.fat_g ?? '';
      el.logSteps.value = existing.steps ?? '';
      el.logSleep.value = existing.sleep_hours ?? '';
      el.logNotes.value = existing.notes ?? '';
      el.logEditHint.textContent = `Upravuješ uložený záznam z ${dateStr}`;
      el.saveLogBtn.textContent = 'Aktualizovat den';
    } else {
      el.logDayType.value = 'gym';
      el.logWeight.value = '';
      el.logKcal.value = '';
      el.logProtein.value = '';
      el.logCarbs.value = '';
      el.logFat.value = '';
      el.logSteps.value = '';
      el.logSleep.value = '';
      el.logNotes.value = '';
      el.logEditHint.textContent = `Nový záznam pro ${dateStr}`;
      el.saveLogBtn.textContent = 'Uložit den';
    }
  }

  async function loadAll() {
    if (!db || !user) return;

    const [profRes, logsRes] = await Promise.all([
      db.from('fitness_profile').select('*').eq('user_id', user.id).maybeSingle(),
      db.from('daily_logs').select('*').order('log_date', { ascending: false }).limit(180),
    ]);

    if (profRes.error) window.appShowError(`Chyba profilu: ${profRes.error.message}`);
    if (logsRes.error) window.appShowError(`Chyba záznamů: ${logsRes.error.message}`);

    profile = profRes.data || null;
    logs = logsRes.data || [];

    renderProfileSummary();
    fillFormForDate(el.logDate.value || window.GymStats.toDateStr(new Date()));
    renderAll();
  }

  function renderProfileSummary() {
    if (!profile) {
      el.profileSummary.textContent = 'Nastav si výšku a denní cíle pro výpočet BMI a úspěšnosti.';
      return;
    }
    const parts = [];
    if (profile.height_cm) parts.push(`${profile.height_cm} cm`);
    if (profile.target_weight_kg) parts.push(`cíl ${profile.target_weight_kg} kg`);
    if (profile.target_kcal) parts.push(`${profile.target_kcal} kcal`);
    if (profile.target_protein_g) parts.push(`${profile.target_protein_g} g B`);
    if (profile.target_steps) parts.push(`${Number(profile.target_steps).toLocaleString('cs-CZ')} kroků`);
    el.profileSummary.textContent = parts.length ? parts.join(' · ') : 'Profil připraven';
  }

  function renderAll() {
    const s = window.GymStats.compute(logs, profile);
    el.statsSampleInfo.textContent = `${s.totalDays} zapsaných dnů`;

    // Sekce 1: Tělo a trend váhy (Metriky 1–7)
    const bmiNote =
      s.bmi == null
        ? 'Doplň výšku v profilu'
        : s.bmi < 18.5
        ? 'Podváha'
        : s.bmi < 25
        ? 'Normální pásmo'
        : s.bmi < 30
        ? 'Nadváha (nebo svaly)'
        : 'Obezita';

    el.statsBodyGrid.innerHTML = [
      kpiCard(
        'Aktuální váha',
        fmt(s.currentWeight, 1, ' kg'),
        s.weightDeltaPrev != null ? `${fmtSigned(s.weightDeltaPrev, 1, ' kg')} vs. minule` : 'Poslední zápis'
      ),
      kpiCard(
        '7denní průměr',
        fmt(s.avgWeight7, 2, ' kg'),
        'Vyhlazená váha',
        'kpi-accent'
      ),
      kpiCard(
        '14d / 30d průměr',
        `${fmt(s.avgWeight14, 1)} / ${fmt(s.avgWeight30, 1)}`,
        'kg (14 dní / 30 dní)'
      ),
      kpiCard(
        'Kolísání váhy (SD)',
        fmt(s.stdWeight7, 2, ' kg'),
        `30d SD: ${fmt(s.stdWeight30, 2, ' kg')}`
      ),
      kpiCard(
        'Lineární trend',
        fmtSigned(s.trendKgPerWeek, 2, ' kg/týd'),
        'Regrese (posledních 30d)',
        s.trendKgPerWeek == null ? '' : s.trendKgPerWeek < 0 ? 'kpi-good' : 'kpi-warn'
      ),
      kpiCard(
        'Predikce za 30 dní',
        fmt(s.predictedWeight30d, 1, ' kg'),
        profile?.target_weight_kg ? `Cíl: ${profile.target_weight_kg} kg` : 'Při aktuálním tempu'
      ),
      kpiCard('BMI', fmt(s.bmi, 1), bmiNote),
    ].join('');

    // Sekce 2: Strava a energetická bilance (Metriky 8–12)
    el.statsNutritionGrid.innerHTML = [
      kpiCard(
        'Průměr kcal (7d)',
        fmtInt(s.avgKcal7, ' kcal'),
        `30d průměr: ${fmtInt(s.avgKcal30, ' kcal')}`
      ),
      kpiCard(
        'Bílkoviny (7d)',
        fmtInt(s.avgProtein7, ' g'),
        s.proteinPerKg != null ? `${fmt(s.proteinPerKg, 2)} g / kg váhy` : '30d: ' + fmtInt(s.avgProtein30, ' g'),
        s.proteinPerKg != null && s.proteinPerKg >= 1.8 ? 'kpi-good' : ''
      ),
      kpiCard(
        'Odhad reálného TDEE',
        fmtInt(s.estimatedTdee, ' kcal'),
        s.estimatedTdee ? 'Z trendu váhy a příjmu' : 'Potřeba min. 7 dní dat',
        'kpi-accent'
      ),
      kpiCard(
        'Reálná bilance / den',
        s.realDailyBalance != null ? `${s.realDailyBalance > 0 ? '+' : ''}${fmtInt(s.realDailyBalance, ' kcal')}` : '—',
        s.realDailyBalance == null ? 'Potřeba delší řada' : s.realDailyBalance < 0 ? 'Kalorický deficit' : 'Kalorický přebytek',
        s.realDailyBalance == null ? '' : s.realDailyBalance < 0 ? 'kpi-good' : 'kpi-warn'
      ),
      kpiCard(
        'Úspěšnost bílkovin',
        fmt(s.proteinHitPct, 0, ' %'),
        profile?.target_protein_g ? `Cíl ≥ ${profile.target_protein_g} g (30d)` : 'Nastav cíl v profilu',
        s.proteinHitPct >= 80 ? 'kpi-good' : s.proteinHitPct != null ? 'kpi-warn' : ''
      ),
      kpiCard(
        'Úspěšnost kalorií',
        fmt(s.kcalHitPct, 0, ' %'),
        profile?.target_kcal ? `Limit ≤ ${profile.target_kcal} kcal (30d)` : 'Nastav cíl v profilu',
        s.kcalHitPct >= 80 ? 'kpi-good' : s.kcalHitPct != null ? 'kpi-warn' : ''
      ),
    ].join('');

    // Sekce 3: Konzistence, Streak a Regenerace (Metriky 13–18)
    el.statsConsistencyGrid.innerHTML = [
      kpiCard(
        'Logging streak',
        `${s.currentStreak} dní`,
        `Nejdelší řada: ${s.longestStreak} dní`,
        s.currentStreak >= 3 ? 'kpi-good' : ''
      ),
      kpiCard(
        'Tréninkový streak',
        `${s.trainingWeekStreak} týdnů`,
        `Tento týden: ${s.gymThisWeek} / ${s.targetWorkouts} gym`,
        s.gymThisWeek >= s.targetWorkouts ? 'kpi-good' : 'kpi-accent'
      ),
      kpiCard(
        'Gym / Rest / Kardio',
        `${s.gymDays30} / ${s.restDays30} / ${s.cardioDays30}`,
        'Poměr dnů za 30 dní'
      ),
      kpiCard(
        'Od posledního restu',
        s.daysSinceRest != null ? `${s.daysSinceRest} dní` : '—',
        s.daysSinceRest >= 6 ? 'Zvaž regenerační den' : 'Hlídání regenerace',
        s.daysSinceRest >= 6 ? 'kpi-warn' : ''
      ),
      kpiCard(
        'Kroky průměr (30d)',
        fmtInt(s.avgSteps30),
        `Gym: ${fmtInt(s.avgStepsGym30)} · Rest: ${fmtInt(s.avgStepsRest30)}`
      ),
      kpiCard(
        'Spánek (7d / 30d)',
        `${fmt(s.avgSleep7, 1)} / ${fmt(s.avgSleep30, 1)} h`,
        s.sleepStepsCorr != null ? `Korelace s kroky: r = ${fmt(s.sleepStepsCorr, 2)}` : 'Min. 5 dnů pro korelaci'
      ),
    ].join('');

    renderCharts(s.chartSeries);
    renderHistory();
  }

  function renderCharts(series) {
    if (typeof Chart === 'undefined') return;

    const labels = series.map((d) => d.label);
    const commonOptions = {
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

    // Graf 1: Váha
    if (charts.weight) charts.weight.destroy();
    charts.weight = new Chart(document.getElementById('weight-chart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Denní váha (kg)',
            data: series.map((d) => d.weight),
            borderColor: 'rgba(148, 163, 184, 0.55)',
            backgroundColor: '#94a3b8',
            pointRadius: 3,
            borderWidth: 1.5,
            spanGaps: true,
          },
          {
            label: '7denní průměr',
            data: series.map((d) => d.weightAvg7),
            borderColor: '#3b82f6',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.3,
            spanGaps: true,
          },
          {
            label: 'Lineární trend',
            data: series.map((d) => d.weightTrend),
            borderColor: '#10b981',
            borderDash: [6, 4],
            borderWidth: 1.8,
            pointRadius: 0,
            spanGaps: true,
          },
        ],
      },
      options: commonOptions,
    });

    // Graf 2: Kalorie a Bílkoviny
    if (charts.nutrition) charts.nutrition.destroy();
    charts.nutrition = new Chart(document.getElementById('nutrition-chart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Kalorie (kcal)',
            data: series.map((d) => d.calories),
            backgroundColor: 'rgba(59, 130, 246, 0.55)',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Bílkoviny (g)',
            type: 'line',
            data: series.map((d) => d.protein),
            borderColor: '#f59e0b',
            backgroundColor: '#f59e0b',
            borderWidth: 2,
            pointRadius: 2.5,
            spanGaps: true,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        ...commonOptions,
        scales: {
          x: commonOptions.scales.x,
          y: { ...commonOptions.scales.y, position: 'left' },
          y1: {
            position: 'right',
            ticks: { color: '#fcd34d' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });

    // Graf 3: Kroky & Spánek
    if (charts.activity) charts.activity.destroy();
    charts.activity = new Chart(document.getElementById('activity-chart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Kroky',
            data: series.map((d) => d.steps),
            backgroundColor: series.map((d) =>
              d.dayType === 'rest'
                ? 'rgba(16, 185, 129, 0.65)'
                : d.dayType === 'cardio'
                ? 'rgba(139, 92, 246, 0.65)'
                : 'rgba(59, 130, 246, 0.65)'
            ),
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Spánek (h)',
            type: 'line',
            data: series.map((d) => d.sleep),
            borderColor: '#c4b5fd',
            borderWidth: 2,
            pointRadius: 2.5,
            spanGaps: true,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        ...commonOptions,
        scales: {
          x: commonOptions.scales.x,
          y: { ...commonOptions.scales.y, position: 'left' },
          y1: {
            position: 'right',
            min: 0,
            max: 12,
            ticks: { color: '#c4b5fd' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  function renderHistory() {
    if (!logs.length) {
      el.logsHistory.innerHTML = '<p class="empty-state">Zatím nemáš žádný denní záznam.</p>';
      return;
    }

    el.logsHistory.innerHTML = logs
      .slice(0, 30)
      .map((l) => {
        const metrics = [];
        if (l.weight_kg != null) metrics.push(`⚖️ ${l.weight_kg} kg`);
        if (l.calories != null) metrics.push(`🔥 ${l.calories} kcal`);
        if (l.protein_g != null) metrics.push(`🥩 ${l.protein_g} g B`);
        if (l.steps != null) metrics.push(`👟 ${Number(l.steps).toLocaleString('cs-CZ')}`);
        if (l.sleep_hours != null) metrics.push(`😴 ${l.sleep_hours} h`);

        return `
          <div class="history-row" data-date="${l.log_date}">
            <div class="history-main">
              <div class="history-date-line">
                <span>${l.log_date}</span>
                <span class="badge badge-${l.day_type}">${DAY_TYPE_LABEL[l.day_type] || l.day_type}</span>
              </div>
              <div class="history-metrics">${metrics.join(' · ') || 'Bez hodnot'}</div>
              ${l.notes ? `<div class="muted">${escapeHtml(l.notes)}</div>` : ''}
            </div>
            <button type="button" class="icon-btn delete" data-delete-id="${l.id}" title="Smazat">✕</button>
          </div>
        `;
      })
      .join('');
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    el.logDate.addEventListener('change', () => {
      if (el.logDate.value) fillFormForDate(el.logDate.value);
    });

    el.logForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!user) return;
      el.saveLogBtn.disabled = true;

      const payload = {
        user_id: user.id,
        log_date: el.logDate.value,
        day_type: el.logDayType.value,
        weight_kg: numOrNull(el.logWeight),
        calories: numOrNull(el.logKcal),
        protein_g: numOrNull(el.logProtein),
        carbs_g: numOrNull(el.logCarbs),
        fat_g: numOrNull(el.logFat),
        steps: numOrNull(el.logSteps),
        sleep_hours: numOrNull(el.logSleep),
        notes: el.logNotes.value.trim() || null,
      };

      const { error } = await db
        .from('daily_logs')
        .upsert(payload, { onConflict: 'user_id,log_date' });

      el.saveLogBtn.disabled = false;
      if (error) {
        window.appShowError(`Chyba ukládání dne: ${error.message}`);
        return;
      }

      window.appShowToast('Denní záznam uložen.');
      await loadAll();
    });

    el.logsHistory.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        e.stopPropagation();
        if (!confirm('Smazat tento denní záznam?')) return;
        const { error } = await db.from('daily_logs').delete().eq('id', delBtn.dataset.deleteId);
        if (error) {
          window.appShowError(`Chyba mazání: ${error.message}`);
          return;
        }
        await loadAll();
        return;
      }

      const row = e.target.closest('.history-row');
      if (row) {
        fillFormForDate(row.dataset.date);
        el.logForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    el.openProfileBtn.addEventListener('click', () => {
      el.profHeight.value = profile?.height_cm ?? '';
      el.profTargetWeight.value = profile?.target_weight_kg ?? '';
      el.profTargetKcal.value = profile?.target_kcal ?? '';
      el.profTargetProtein.value = profile?.target_protein_g ?? '';
      el.profTargetSteps.value = profile?.target_steps ?? '';
      el.profTargetWorkouts.value = profile?.target_workouts_per_week ?? 5;
      el.profileDialog.showModal();
    });

    el.cancelProfileBtn.addEventListener('click', () => el.profileDialog.close());

    el.profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!user) return;

      const payload = {
        user_id: user.id,
        height_cm: numOrNull(el.profHeight),
        target_weight_kg: numOrNull(el.profTargetWeight),
        target_kcal: numOrNull(el.profTargetKcal),
        target_protein_g: numOrNull(el.profTargetProtein),
        target_steps: numOrNull(el.profTargetSteps),
        target_workouts_per_week: numOrNull(el.profTargetWorkouts) || 5,
        updated_at: new Date().toISOString(),
      };

      const { error } = await db
        .from('fitness_profile')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) {
        window.appShowError(`Chyba ukládání profilu: ${error.message}`);
        return;
      }

      el.profileDialog.close();
      window.appShowToast('Profil a cíle uloženy.');
      await loadAll();
    });
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
      bindEvents();
      if (!el.logDate.value) {
        el.logDate.value = window.GymStats.toDateStr(new Date());
      }
      loadAll();
    },
    refresh() {
      loadAll();
    },
    reset() {
      user = null;
      profile = null;
      logs = [];
    },
  };
})();