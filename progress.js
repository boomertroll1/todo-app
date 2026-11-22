window.ProgressModule = (() => {
  let db = null;
  let user = null;
  let dataCache = {
    todos: [],
    logs: [],
    workouts: [],
    sets: [],
    profile: null,
  };
  let charts = { radar: null, xp: null };

  const RANKS = [
    { minLevel: 1, name: 'IRON INITIATE', color: '#94a3b8' },
    { minLevel: 4, name: 'BRONZE GRINDER', color: '#cd7f32' },
    { minLevel: 8, name: 'SILVER VANGUARD', color: '#cbd5e1' },
    { minLevel: 13, name: 'GOLD CONTENDER', color: '#facc15' },
    { minLevel: 19, name: 'PLATINUM ELITE', color: '#38bdf8' },
    { minLevel: 26, name: 'DIAMOND TITAN', color: '#a855f7' },
    { minLevel: 35, name: 'APEX ASCENDANT', color: '#00f0ff' },
  ];

  const el = {};

  function cacheElements() {
    el.hudLevel = document.getElementById('hud-level');
    el.hudRank = document.getElementById('hud-rank');
    el.hudXpText = document.getElementById('hud-xp-text');
    el.hudXpFill = document.getElementById('hud-xp-fill');
    el.hudStreak = document.getElementById('hud-streak');

    el.progKpiGrid = document.getElementById('prog-kpi-grid');
    el.achievementsGrid = document.getElementById('achievements-grid');
    el.achievementsCount = document.getElementById('achievements-count');
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function xpForLevel(level) {
    return Math.round(150 * Math.pow(level, 1.25));
  }

  function getLevelInfo(totalXp) {
    let level = 1;
    let remaining = totalXp;
    let needed = xpForLevel(level);

    while (remaining >= needed) {
      remaining -= needed;
      level++;
      needed = xpForLevel(level);
    }

    let rank = RANKS[0];
    for (const r of RANKS) {
      if (level >= r.minLevel) rank = r;
    }

    return {
      level,
      rank,
      currentXp: remaining,
      neededXp: needed,
      pct: Math.min(100, Math.round((remaining / needed) * 100)),
      totalXp,
    };
  }

  function calcE1RM(weight, reps) {
    const w = Number(weight);
    const r = Number(reps);
    if (!w || !r) return 0;
    return r === 1 ? w : w * (1 + r / 30);
  }

  async function loadAll() {
    if (!db || !user) return;

    const [todosRes, logsRes, woRes, setsRes, profRes] = await Promise.all([
      db.from('todos').select('id, is_completed, priority, created_at'),
      db.from('daily_logs').select('*').order('log_date', { ascending: true }).limit(365),
      db.from('workouts').select('*').order('workout_date', { ascending: true }).limit(365),
      db.from('workout_sets').select('*').limit(4000),
      db.from('fitness_profile').select('*').eq('user_id', user.id).maybeSingle(),
    ]);

    dataCache = {
      todos: todosRes.data || [],
      logs: logsRes.data || [],
      workouts: woRes.data || [],
      sets: setsRes.data || [],
      profile: profRes.data || null,
    };

    renderAll();
  }

  function computeRPG() {
    const { todos, logs, workouts, sets, profile } = dataCache;
    const xpByDate = {};
    const addDailyXp = (dateStr, amount) => {
      if (!dateStr) return;
      xpByDate[dateStr] = (xpByDate[dateStr] || 0) + amount;
    };

    // 1. XP za splněné úkoly
    let todoXp = 0;
    let completedTodos = 0;
    todos.forEach((t) => {
      if (!t.is_completed) return;
      completedTodos++;
      const pts = t.priority === 'high' ? 40 : t.priority === 'low' ? 15 : 25;
      todoXp += pts;
      addDailyXp((t.created_at || '').slice(0, 10), pts);
    });

    // 2. XP za denní záznamy
    let logXp = 0;
    const targetProtein = Number(profile?.target_protein_g || 160);
    const targetSteps = Number(profile?.target_steps || 10000);

    logs.forEach((l) => {
      let pts = 30;
      if (l.protein_g != null && Number(l.protein_g) >= targetProtein) pts += 20;
      if (l.steps != null && Number(l.steps) >= targetSteps) pts += 20;
      logXp += pts;
      addDailyXp(l.log_date, pts);
    });

    // 3. XP za tréninky a pracovní série
    let workoutXp = 0;
    const workoutMap = new Map(workouts.map((w) => [w.id, w]));
    const workingSetsByWo = {};
    let totalTonnage = 0;
    let maxWeightLifted = 0;
    let maxE1RM = 0;

    sets.forEach((s) => {
      if (s.is_warmup) return;
      const w = Number(s.weight_kg);
      const r = Number(s.reps);
      totalTonnage += w * r;
      if (w > maxWeightLifted) maxWeightLifted = w;
      const e1 = calcE1RM(w, r);
      if (e1 > maxE1RM) maxE1RM = e1;
      workingSetsByWo[s.workout_id] = (workingSetsByWo[s.workout_id] || 0) + 1;
    });

    workouts.forEach((w) => {
      const pts = 60 + (workingSetsByWo[w.id] || 0) * 5;
      workoutXp += pts;
      addDailyXp(w.workout_date, pts);
    });

    const totalXp = todoXp + logXp + workoutXp;
    const levelInfo = getLevelInfo(totalXp);

    // Streak z GymStats
    const gymStats = window.GymStats ? window.GymStats.compute(logs, profile) : { currentStreak: 0, longestStreak: 0 };

    // RPG Atributy (0–100)
    const latestWeight = gymStats.avgWeight7 || gymStats.currentWeight || 80;
    const relStr = maxE1RM ? maxE1RM / latestWeight : 0;
    const strScore = Math.min(100, Math.round(relStr * 55 + Math.min(25, workouts.length * 2.5)));

    const avgSteps = gymStats.avgSteps30 || 0;
    const endScore = Math.min(100, Math.round((avgSteps / Math.max(targetSteps, 8000)) * 80 + Math.min(20, (gymStats.cardioDays30 || 0) * 5)));

    const proteinPct = gymStats.proteinHitPct ?? 0;
    const disScore = Math.min(100, Math.round(Math.min(50, gymStats.currentStreak * 5) + proteinPct * 0.5));

    const focusScore = Math.min(100, Math.round(Math.min(100, completedTodos * 5)));

    const avgSleep = gymStats.avgSleep30 || 0;
    const sleepPart = avgSleep ? Math.min(75, Math.max(0, ((avgSleep - 4.5) / 3.5) * 75)) : 0;
    const restPart = gymStats.restDays30 ? Math.min(25, gymStats.restDays30 * 5) : 0;
    const recScore = Math.min(100, Math.round(sleepPart + restPart));

    // Posledních 30 dní pro XP graf
    const today = new Date();
    const xpTimeline = [];
    const sortedAllDates = Object.keys(xpByDate).sort();
    const start30 = new Date(today.getTime() - 29 * 86400000);
    const start30Str = toDateStr(start30);

    let runningTotal = 0;
    sortedAllDates.forEach((d) => {
      if (d < start30Str) runningTotal += xpByDate[d];
    });

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const dStr = toDateStr(d);
      const daily = xpByDate[dStr] || 0;
      runningTotal += daily;
      xpTimeline.push({
        label: dStr.slice(5).split('-').reverse().join('.'),
        daily,
        cumulative: runningTotal,
      });
    }

    // Achievementy
    const achievements = [
      {
        icon: '⚔️',
        title: 'První krev',
        desc: 'Zapiš svůj první trénink',
        unlocked: workouts.length >= 1,
      },
      {
        icon: '🔥',
        title: 'Týdenní série',
        desc: 'Dosáhni 7denního logging streaku',
        unlocked: gymStats.longestStreak >= 7,
      },
      {
        icon: '🏋️',
        title: '100 kg Club',
        desc: 'Zvedni v pracovní sérii alespoň 100 kg',
        unlocked: maxWeightLifted >= 100,
      },
      {
        icon: '📦',
        title: '10 tun železa',
        desc: 'Nazvedej celkovou tonáž 10 000+ kg',
        unlocked: totalTonnage >= 10000,
      },
      {
        icon: '👟',
        title: '10k Walker',
        desc: 'Udrž 30denní průměr kroků ≥ 10 000',
        unlocked: avgSteps >= 10000,
      },
      {
        icon: '🥩',
        title: 'Protein Sniper',
        desc: 'Tref bílkoviny alespoň v 80 % dnů',
        unlocked: (gymStats.proteinHitPct || 0) >= 80 && logs.length >= 5,
      },
      {
        icon: '✅',
        title: 'Exekutor',
        desc: 'Splň alespoň 15 úkolů v To-Do listu',
        unlocked: completedTodos >= 15,
      },
      {
        icon: '👑',
        title: 'Level 10',
        desc: 'Dosáhni 10. úrovně v systému',
        unlocked: levelInfo.level >= 10,
      },
    ];

    return {
      levelInfo,
      streak: gymStats.currentStreak || 0,
      todoXp,
      logXp,
      workoutXp,
      totalTonnage,
      completedTodos,
      attributes: [
        { label: 'STR (Síla)', value: strScore },
        { label: 'END (Výdrž)', value: endScore },
        { label: 'DIS (Disciplína)', value: disScore },
        { label: 'FOC (Úkoly)', value: focusScore },
        { label: 'REC (Regenerace)', value: recScore },
      ],
      xpTimeline,
      achievements,
    };
  }

  function renderAll() {
    const r = computeRPG();
    const { levelInfo } = r;

    // Update horní Gaming HUD
    if (el.hudLevel) el.hudLevel.textContent = `LVL ${levelInfo.level}`;
    if (el.hudRank) {
      el.hudRank.textContent = levelInfo.rank.name;
      el.hudRank.style.color = levelInfo.rank.color;
    }
    if (el.hudXpText) {
      el.hudXpText.textContent = `${levelInfo.currentXp} / ${levelInfo.neededXp} XP`;
    }
    if (el.hudXpFill) {
      el.hudXpFill.style.width = `${levelInfo.pct}%`;
    }
    if (el.hudStreak) {
      el.hudStreak.textContent = `🔥 ${r.streak}d`;
    }

    // KPI v záložce Progres
    if (el.progKpiGrid) {
      el.progKpiGrid.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">Celkové XP</span><span class="kpi-value kpi-accent mono">${levelInfo.totalXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Level ${levelInfo.level} · ${levelInfo.rank.name}</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">XP z tréninků</span><span class="kpi-value mono">${r.workoutXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Tonáž: ${Math.round(r.totalTonnage).toLocaleString('cs-CZ')} kg</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">XP z těla & stravy</span><span class="kpi-value mono">${r.logXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Streak: ${r.streak} dní</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">XP z úkolů</span><span class="kpi-value mono">${r.todoXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Splněno: ${r.completedTodos} úkolů</span></div>`,
      ].join('');
    }

    // Achievementy
    if (el.achievementsGrid) {
      const unlockedCount = r.achievements.filter((a) => a.unlocked).length;
      el.achievementsCount.textContent = `${unlockedCount} / ${r.achievements.length} odemčeno`;
      el.achievementsGrid.innerHTML = r.achievements
        .map(
          (a) => `
          <div class="ach-card ${a.unlocked ? 'unlocked' : 'locked'}">
            <div class="ach-icon">${a.icon}</div>
            <div class="ach-body">
              <div class="ach-title">${a.title}</div>
              <div class="ach-desc">${a.desc}</div>
            </div>
            <span class="ach-status">${a.unlocked ? 'UNLOCKED' : 'LOCKED'}</span>
          </div>
        `
        )
        .join('');
    }

    renderCharts(r);
  }

  function renderCharts(r) {
    if (typeof Chart === 'undefined') return;
    const radarCanvas = document.getElementById('rpg-radar-chart');
    const xpCanvas = document.getElementById('xp-progress-chart');
    if (!radarCanvas || !xpCanvas) return;

    if (charts.radar) charts.radar.destroy();
    charts.radar = new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels: r.attributes.map((a) => a.label),
        datasets: [
          {
            label: 'Staty postavy (0–100)',
            data: r.attributes.map((a) => a.value),
            backgroundColor: 'rgba(0, 240, 255, 0.18)',
            borderColor: '#00f0ff',
            pointBackgroundColor: '#00f0ff',
            pointBorderColor: '#07090f',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { stepSize: 25, display: false },
            grid: { color: 'rgba(148, 163, 184, 0.16)' },
            angleLines: { color: 'rgba(148, 163, 184, 0.16)' },
            pointLabels: { color: '#e2e8f0', font: { size: 11, weight: '600' } },
          },
        },
      },
    });

    if (charts.xp) charts.xp.destroy();
    charts.xp = new Chart(xpCanvas, {
      type: 'bar',
      data: {
        labels: r.xpTimeline.map((p) => p.label),
        datasets: [
          {
            label: 'Denní zisk XP',
            data: r.xpTimeline.map((p) => p.daily),
            backgroundColor: 'rgba(139, 92, 246, 0.65)',
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Celkové XP',
            type: 'line',
            data: r.xpTimeline.map((p) => p.cumulative),
            borderColor: '#00f0ff',
            backgroundColor: '#00f0ff',
            borderWidth: 2.2,
            pointRadius: 0,
            tension: 0.3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { position: 'left', ticks: { color: '#c4b5fd' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y1: { position: 'right', ticks: { color: '#67e8f9' }, grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  return {
    init(supabaseClient, currentUser) {
      db = supabaseClient;
      user = currentUser;
      cacheElements();
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
      dataCache = { todos: [], logs: [], workouts: [], sets: [], profile: null };
    },
  };
})();