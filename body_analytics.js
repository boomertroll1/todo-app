window.BodyAnalyticsModule = (() => {
  let db = null;
  let user = null;
  let logs = [];
  let profile = null;
  let initializedListeners = false;

  const charts = {
    regression: null,
    macrosStack: null,
    macroPie: null,
    weekly: null,
  };

  const el = {};

  function cacheElements() {
    el.statsGrid = document.getElementById('body-adv-stats-grid');
    el.regCanvas = document.getElementById('adv-regression-chart');
    el.macrosCanvas = document.getElementById('adv-macros-stack-chart');
    el.pieCanvas = document.getElementById('adv-macro-pie-chart');
    el.weeklyCanvas = document.getElementById('adv-weekly-chart');
  }

  function getKcal(l) {
    const v = l?.calories ?? l?.kcal;
    return v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  }

  function getTargetKcal(p) {
    const v = p?.target_calories ?? p?.target_kcal;
    return v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
  }

  function num(v) {
    return v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
  }

  function mean(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdDev(arr) {
    if (arr.length < 2) return null;
    const m = mean(arr);
    const variance = arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }

  function dayIndexFromDateStr(str) {
    const [y, m, d] = str.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  function linearRegression(points) {
    // points: [{ x, y }]
    const n = points.length;
    if (n < 2) return null;
    const meanX = mean(points.map((p) => p.x));
    const meanY = mean(points.map((p) => p.y));
    let numSum = 0;
    let denSum = 0;
    points.forEach((p) => {
      numSum += (p.x - meanX) * (p.y - meanY);
      denSum += Math.pow(p.x - meanX, 2);
    });
    if (denSum === 0) return null;
    const slope = numSum / denSum;
    const intercept = meanY - slope * meanX;

    let ssTot = 0;
    let ssRes = 0;
    points.forEach((p) => {
      const pred = intercept + slope * p.x;
      ssTot += Math.pow(p.y - meanY, 2);
      ssRes += Math.pow(p.y - pred, 2);
    });
    const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    return { slope, intercept, r2 };
  }

  function getISOWeekLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const tmp = new Date(Date.UTC(y, m - 1, d));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
    return `${tmp.getUTCFullYear()}-T${String(weekNo).padStart(2, '0')}`;
  }

  function shortDate(dateStr) {
    return dateStr.slice(5).split('-').reverse().join('.');
  }

  async function loadAll() {
    if (!db || !user) return;
    const [logsRes, profRes] = await Promise.all([
      db.from('daily_logs').select('*').order('log_date', { ascending: true }).limit(500),
      db.from('fitness_profile').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    if (logsRes.error) return;
    logs = logsRes.data || [];
    profile = profRes.data || null;
    renderAll();
  }

  function renderStats() {
    if (!el.statsGrid) return;

    const last30 = logs.slice(-30);
    const last14 = logs.slice(-14);
    const last7 = logs.slice(-7);

    // 1. Váha & lineární regrese (posledních 30 záznamů s váhou)
    const weightLogs = logs
      .filter((l) => num(l.weight_kg) != null)
      .slice(-30);

    const wPoints = weightLogs.map((l) => ({
      x: dayIndexFromDateStr(l.log_date),
      y: num(l.weight_kg),
    }));
    const reg = linearRegression(wPoints);
    const slopeWeek = reg ? reg.slope * 7 : null;

    const wVals14 = last14.map((l) => num(l.weight_kg)).filter((v) => v != null);
    const wVals30 = weightLogs.map((l) => num(l.weight_kg));
    const wStd = stdDev(wVals14.length >= 3 ? wVals14 : wVals30);
    const wMin = wVals30.length ? Math.min(...wVals30) : null;
    const wMax = wVals30.length ? Math.max(...wVals30) : null;
    const avgWeight7 = mean(last7.map((l) => num(l.weight_kg)).filter((v) => v != null)) ??
      (wVals30.length ? wVals30[wVals30.length - 1] : null);

    // 2. Odhad reálného TDEE (průměrný příjem − denní změna váhy × 7700 kcal/kg)
    const kcal30 = last30.map(getKcal).filter((v) => v != null);
    const avgKcal30 = mean(kcal30);
    let estTdee = null;
    if (avgKcal30 != null && reg && wPoints.length >= 5) {
      const spanDays = wPoints[wPoints.length - 1].x - wPoints[0].x;
      if (spanDays >= 5) {
        const rawTdee = avgKcal30 - reg.slope * 7700;
        if (rawTdee > 1000 && rawTdee < 6000) estTdee = Math.round(rawTdee);
      }
    }

    // 3. BMI & ETA k cílové váze
    const heightCm = num(profile?.height_cm);
    const targetWeight = num(profile?.target_weight_kg);
    const bmi =
      avgWeight7 != null && heightCm && heightCm > 100
        ? avgWeight7 / Math.pow(heightCm / 100, 2)
        : null;

    let etaText = 'Nastav cíl v profilu';
    if (targetWeight != null && avgWeight7 != null) {
      const diff = targetWeight - avgWeight7;
      if (Math.abs(diff) < 0.25) {
        etaText = 'Cílová váha splněna!';
      } else if (slopeWeek != null && Math.abs(slopeWeek) >= 0.05 && Math.sign(diff) === Math.sign(slopeWeek)) {
        const weeks = Math.round(Math.abs(diff / slopeWeek));
        etaText = `≈ ${weeks} týdnů (${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg)`;
      } else {
        etaText = `Zbývá ${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg`;
      }
    }

    // 4. Bílkoviny na kg váhy
    const prot30 = last30.map((l) => num(l.protein_g)).filter((v) => v != null);
    const avgProt = mean(prot30);
    const protPerKg = avgProt != null && avgWeight7 ? avgProt / avgWeight7 : null;

    // 5. Makro poměr (% kalorií)
    const macroDays = last30.filter(
      (l) => num(l.protein_g) != null || num(l.carbs_g) != null || num(l.fat_g) != null
    );
    const avgP = mean(macroDays.map((l) => num(l.protein_g) || 0)) || 0;
    const avgC = mean(macroDays.map((l) => num(l.carbs_g) || 0)) || 0;
    const avgF = mean(macroDays.map((l) => num(l.fat_g) || 0)) || 0;
    const macroKcalSum = avgP * 4 + avgC * 4 + avgF * 9;
    const pctP = macroKcalSum ? Math.round(((avgP * 4) / macroKcalSum) * 100) : 0;
    const pctC = macroKcalSum ? Math.round(((avgC * 4) / macroKcalSum) * 100) : 0;
    const pctF = macroKcalSum ? Math.max(0, 100 - pctP - pctC) : 0;

    // 6. Gym den vs. Rest den (kroky a kalorie)
    const gymDays = last30.filter((l) => (l.day_type || 'gym') === 'gym');
    const restDays = last30.filter((l) => l.day_type === 'rest');
    const gymSteps = mean(gymDays.map((l) => num(l.steps)).filter((v) => v != null));
    const restSteps = mean(restDays.map((l) => num(l.steps)).filter((v) => v != null));
    const gymKcal = mean(gymDays.map(getKcal).filter((v) => v != null));
    const restKcal = mean(restDays.map(getKcal).filter((v) => v != null));

    // 7. Spánková kvalita
    const sleep30 = last30.map((l) => num(l.sleep_hours)).filter((v) => v != null);
    const sleep7 = last7.map((l) => num(l.sleep_hours)).filter((v) => v != null);
    const avgSleep30 = mean(sleep30);
    const avgSleep7 = mean(sleep7);
    const goodSleepPct = sleep30.length
      ? Math.round((sleep30.filter((s) => s >= 7.5).length / sleep30.length) * 100)
      : null;

    // 8. Průměrný kalorický rozdíl oproti TDEE / cíli
    const targetKcal = getTargetKcal(profile);
    const dailyBalance =
      avgKcal30 != null && estTdee != null
        ? Math.round(avgKcal30 - estTdee)
        : avgKcal30 != null && targetKcal != null
        ? Math.round(avgKcal30 - targetKcal)
        : null;

    el.statsGrid.innerHTML = [
      `<div class="kpi-card kpi-glow">
        <span class="kpi-label">Lineární trend (OLS)</span>
        <span class="kpi-value kpi-accent mono">${slopeWeek != null ? `${slopeWeek >= 0 ? '+' : ''}${slopeWeek.toFixed(2)} kg/t` : '—'}</span>
        <span class="kpi-sub">${reg ? `R² = ${reg.r2.toFixed(2)} · 30d: ${slopeWeek >= 0 ? '+' : ''}${(reg.slope * 30).toFixed(2)} kg` : 'Potřeba min. 2 měření'}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">Odhad reálného TDEE</span>
        <span class="kpi-value mono">${estTdee != null ? `${estTdee.toLocaleString('cs-CZ')} kcal` : '—'}</span>
        <span class="kpi-sub">${dailyBalance != null ? `Bilance: ${dailyBalance > 0 ? '+' : ''}${dailyBalance} kcal/d` : 'Potřeba 5+ dnů váhy a kcal'}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">Volatilita váhy (σ)</span>
        <span class="kpi-value mono">${wStd != null ? `±${wStd.toFixed(2)} kg` : '—'}</span>
        <span class="kpi-sub">${wMin != null ? `Rozpětí: ${wMin.toFixed(1)}–${wMax.toFixed(1)} kg` : 'Zatím málo měření'}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">BMI & Cesta k cíli</span>
        <span class="kpi-value mono">${bmi != null ? bmi.toFixed(1) : '—'}</span>
        <span class="kpi-sub">${etaText}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">Bílkoviny / kg váhy</span>
        <span class="kpi-value mono">${protPerKg != null ? `${protPerKg.toFixed(2)} g/kg` : '—'}</span>
        <span class="kpi-sub">${avgProt != null ? `Průměr ${Math.round(avgProt)} g/den (30d)` : 'Zapisuj bílkoviny'}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">Poměr maker (% kcal)</span>
        <span class="kpi-value mono">${macroKcalSum ? `${pctP}/${pctC}/${pctF}%` : '—'}</span>
        <span class="kpi-sub">${macroKcalSum ? `B ${Math.round(avgP)}g · S ${Math.round(avgC)}g · T ${Math.round(avgF)}g` : 'Zapisuj B / S / T'}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">Gym vs. Rest (kroky)</span>
        <span class="kpi-value mono">${gymSteps != null || restSteps != null ? `${gymSteps ? (gymSteps / 1000).toFixed(1) + 'k' : '—'} / ${restSteps ? (restSteps / 1000).toFixed(1) + 'k' : '—'}` : '—'}</span>
        <span class="kpi-sub">${gymKcal || restKcal ? `Kcal: ${gymKcal ? Math.round(gymKcal) : '—'} vs. ${restKcal ? Math.round(restKcal) : '—'}` : 'Porovnání dnů (30d)'}</span>
      </div>`,

      `<div class="kpi-card">
        <span class="kpi-label">Kvalita spánku (7d / 30d)</span>
        <span class="kpi-value mono">${avgSleep7 != null ? `${avgSleep7.toFixed(1)}h` : avgSleep30 != null ? `${avgSleep30.toFixed(1)}h` : '—'}</span>
        <span class="kpi-sub">${goodSleepPct != null ? `${goodSleepPct} % nocí ≥ 7.5 h (30d: ${avgSleep30.toFixed(1)}h)` : 'Zapisuj spánek'}</span>
      </div>`,
    ].join('');
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // GRAF 1: Lineární regrese váhy + ±1σ pásmo + cílová váha (až 60 dní)
    if (el.regCanvas) {
      destroyChart('regression');
      const wLogs = logs.filter((l) => num(l.weight_kg) != null).slice(-60);
      const labels = wLogs.map((l) => shortDate(l.log_date));
      const vals = wLogs.map((l) => num(l.weight_kg));
      const pts = wLogs.map((l) => ({ x: dayIndexFromDateStr(l.log_date), y: num(l.weight_kg) }));
      const reg = linearRegression(pts);
      const sigma = stdDev(vals) || 0;
      const targetWeight = num(profile?.target_weight_kg);

      const regLine = reg ? pts.map((p) => Number((reg.intercept + reg.slope * p.x).toFixed(2))) : [];
      const upperBand = reg ? regLine.map((v) => Number((v + sigma).toFixed(2))) : [];
      const lowerBand = reg ? regLine.map((v) => Number((v - sigma).toFixed(2))) : [];

      const datasets = [
        {
          label: 'Denní váha (kg)',
          data: vals,
          borderColor: '#00f0ff',
          backgroundColor: 'rgba(0, 240, 255, 0.2)',
          pointRadius: 2.5,
          borderWidth: 1.8,
          tension: 0.25,
        },
      ];

      if (reg) {
        datasets.push(
          {
            label: 'Lineární trend (OLS)',
            data: regLine,
            borderColor: '#facc15',
            borderDash: [6, 4],
            borderWidth: 2.2,
            pointRadius: 0,
            fill: false,
          },
          {
            label: '+1σ pásmo',
            data: upperBand,
            borderColor: 'rgba(168, 85, 247, 0.35)',
            backgroundColor: 'rgba(168, 85, 247, 0.10)',
            borderWidth: 1,
            pointRadius: 0,
            fill: '+1',
          },
          {
            label: '-1σ pásmo',
            data: lowerBand,
            borderColor: 'rgba(168, 85, 247, 0.35)',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
          }
        );
      }

      if (targetWeight != null && labels.length) {
        datasets.push({
          label: `Cíl (${targetWeight} kg)`,
          data: labels.map(() => targetWeight),
          borderColor: '#10b981',
          borderDash: [3, 4],
          borderWidth: 1.6,
          pointRadius: 0,
        });
      }

      charts.regression = new Chart(el.regCanvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#94a3b8', boxWidth: 11, font: { size: 11 } } },
          },
          scales: {
            x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      });
    }

    // GRAF 2: Makroživiny po dnech (stacked bar, posledních 21 dní)
    if (el.macrosCanvas) {
      destroyChart('macrosStack');
      const mLogs = logs
        .filter((l) => num(l.protein_g) != null || num(l.carbs_g) != null || num(l.fat_g) != null)
        .slice(-21);

      charts.macrosStack = new Chart(el.macrosCanvas, {
        type: 'bar',
        data: {
          labels: mLogs.map((l) => shortDate(l.log_date)),
          datasets: [
            {
              label: 'Bílkoviny (g)',
              data: mLogs.map((l) => num(l.protein_g) || 0),
              backgroundColor: 'rgba(0, 240, 255, 0.78)',
              borderRadius: 3,
            },
            {
              label: 'Sacharidy (g)',
              data: mLogs.map((l) => num(l.carbs_g) || 0),
              backgroundColor: 'rgba(139, 92, 246, 0.78)',
              borderRadius: 3,
            },
            {
              label: 'Tuky (g)',
              data: mLogs.map((l) => num(l.fat_g) || 0),
              backgroundColor: 'rgba(250, 204, 21, 0.78)',
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8', boxWidth: 11, font: { size: 11 } } },
          },
          scales: {
            x: { stacked: true, ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { stacked: true, ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      });
    }

    // GRAF 3: Průměrný kalorický podíl maker (30d doughnut)
    if (el.pieCanvas) {
      destroyChart('macroPie');
      const last30 = logs.slice(-30);
      const mDays = last30.filter(
        (l) => num(l.protein_g) != null || num(l.carbs_g) != null || num(l.fat_g) != null
      );
      const pKcal = Math.round((mean(mDays.map((l) => num(l.protein_g) || 0)) || 0) * 4);
      const cKcal = Math.round((mean(mDays.map((l) => num(l.carbs_g) || 0)) || 0) * 4);
      const fKcal = Math.round((mean(mDays.map((l) => num(l.fat_g) || 0)) || 0) * 9);
      const hasAny = pKcal + cKcal + fKcal > 0;

      charts.macroPie = new Chart(el.pieCanvas, {
        type: 'doughnut',
        data: {
          labels: hasAny
            ? [`Bílkoviny (${pKcal} kcal)`, `Sacharidy (${cKcal} kcal)`, `Tuky (${fKcal} kcal)`]
            : ['Zatím bez dat'],
          datasets: [
            {
              data: hasAny ? [pKcal, cKcal, fKcal] : [1],
              backgroundColor: hasAny
                ? ['rgba(0, 240, 255, 0.85)', 'rgba(139, 92, 246, 0.85)', 'rgba(250, 204, 21, 0.85)']
                : ['rgba(148, 163, 184, 0.2)'],
              borderColor: '#0c111d',
              borderWidth: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#cbd5e1', boxWidth: 12, padding: 12, font: { size: 11 } },
            },
          },
        },
      });
    }

    // GRAF 4: Týdenní průměry (váha + kroky za posledních 12 týdnů)
    if (el.weeklyCanvas) {
      destroyChart('weekly');
      const byWeek = {};
      logs.forEach((l) => {
        if (!l.log_date) return;
        const wk = getISOWeekLabel(l.log_date);
        if (!byWeek[wk]) byWeek[wk] = { weights: [], steps: [], kcals: [] };
        const w = num(l.weight_kg);
        const s = num(l.steps);
        const k = getKcal(l);
        if (w != null) byWeek[wk].weights.push(w);
        if (s != null) byWeek[wk].steps.push(s);
        if (k != null) byWeek[wk].kcals.push(k);
      });

      const weekKeys = Object.keys(byWeek).sort().slice(-12);
      const wAvgs = weekKeys.map((wk) => {
        const m = mean(byWeek[wk].weights);
        return m != null ? Number(m.toFixed(2)) : null;
      });
      const stepAvgs = weekKeys.map((wk) => {
        const m = mean(byWeek[wk].steps);
        return m != null ? Math.round(m) : null;
      });

      charts.weekly = new Chart(el.weeklyCanvas, {
        type: 'bar',
        data: {
          labels: weekKeys.map((k) => k.split('-')[1]),
          datasets: [
            {
              label: 'Průměr kroků / den',
              data: stepAvgs,
              backgroundColor: 'rgba(16, 185, 129, 0.45)',
              borderColor: '#10b981',
              borderWidth: 1,
              borderRadius: 4,
              yAxisID: 'y1',
            },
            {
              label: 'Týdenní průměr váhy (kg)',
              type: 'line',
              data: wAvgs,
              borderColor: '#00f0ff',
              backgroundColor: '#00f0ff',
              borderWidth: 2.4,
              pointRadius: 3,
              spanGaps: true,
              tension: 0.25,
              yAxisID: 'y',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#94a3b8', boxWidth: 11, font: { size: 11 } } },
          },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { position: 'left', ticks: { color: '#67e8f9' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y1: { position: 'right', ticks: { color: '#6ee7b7' }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }
  }

  function renderAll() {
    renderStats();
    renderCharts();
  }

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    // Automatické přepočítání po uložení denního logu nebo profilu v gym.js
    const dailyForm = document.getElementById('daily-log-form');
    if (dailyForm) {
      dailyForm.addEventListener('submit', () => {
        setTimeout(() => loadAll(), 650);
      });
    }
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('submit', () => {
        setTimeout(() => loadAll(), 650);
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
    onShow() {
      loadAll();
    },
    reset() {
      user = null;
      logs = [];
      profile = null;
      Object.keys(charts).forEach(destroyChart);
    },
  };
})();