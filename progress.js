window.ProgressModule = (() => {
  let db = null;
  let user = null;
  let dataCache = {
    todos: [],
    logs: [],
    workouts: [],
    sets: [],
    profile: null,
    photos: [],
  };
  let photoFilter = 'all';
  let charts = { radar: null, xp: null };
  let initializedListeners = false;

  const TIERS = [
    { name: 'IRON', color: '#94a3b8' },
    { name: 'BRONZE', color: '#d97706' },
    { name: 'SILVER', color: '#e2e8f0' },
    { name: 'GOLD', color: '#facc15' },
    { name: 'PLATINUM', color: '#38bdf8' },
    { name: 'DIAMOND', color: '#a855f7' },
    { name: 'MASTER', color: '#ec4899' },
    { name: 'GRANDMASTER', color: '#ff4757' },
    { name: 'APEX', color: '#00f0ff' },
    { name: 'MYTHIC', color: '#10b981' },
  ];
  const DIVISIONS = ['III', 'II', 'I'];
  const PHOTO_CAT_LABEL = {
    progres: 'Progres / Forma',
    gym: 'Gym',
    jidlo: 'Jídlo',
    ostatni: 'Ostatní',
  };

  const el = {};

  function cacheElements() {
    el.hudEmblem = document.getElementById('hud-emblem');
    el.hudLevel = document.getElementById('hud-level');
    el.hudRank = document.getElementById('hud-rank');
    el.hudXpText = document.getElementById('hud-xp-text');
    el.hudXpFill = document.getElementById('hud-xp-fill');
    el.hudStreak = document.getElementById('hud-streak');

    el.rankShowcase = document.getElementById('rank-showcase');
    el.progKpiGrid = document.getElementById('prog-kpi-grid');
    el.achievementsGrid = document.getElementById('achievements-grid');
    el.achievementsCount = document.getElementById('achievements-count');

    el.photoForm = document.getElementById('photo-upload-form');
    el.photoFile = document.getElementById('photo-file-input');
    el.photoDate = document.getElementById('photo-date-input');
    el.photoCategory = document.getElementById('photo-category-input');
    el.photoCaption = document.getElementById('photo-caption-input');
    el.photoSubmitBtn = document.getElementById('photo-submit-btn');
    el.photoFilterBtns = document.querySelectorAll('.photo-filter-chip');
    el.photoGallery = document.getElementById('photo-gallery-grid');
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function xpForLevel(level) {
    return Math.round(140 * Math.pow(level, 1.22));
  }

  // Nekonečný výpočet ranku (10 tierů × 3 divize × 2 levely = 60 levelů na 1 Prestige cyklus -> P1, P2, ... ∞)
  function getInfiniteRank(level) {
    const idx = Math.max(0, level - 1);
    const prestige = Math.floor(idx / 60);
    const inCycle = idx % 60;
    const tierIndex = Math.floor(inCycle / 6);
    const divIndex = Math.floor((inCycle % 6) / 2);

    const tier = TIERS[tierIndex];
    const division = DIVISIONS[divIndex];
    const prefix = prestige > 0 ? `ASCENSION ${prestige} · ` : '';
    const shortPrefix = prestige > 0 ? `P${prestige} · ` : '';

    return {
      prestige,
      tierIndex,
      divIndex,
      tierName: tier.name,
      division,
      color: tier.color,
      fullName: `${prefix}${tier.name} ${division}`,
      shortName: `${shortPrefix}${tier.name} ${division}`,
    };
  }

  function buildRankEmblemSVG(rank, size = 42) {
    const c = rank.color;
    const chevrons =
      rank.divIndex === 0
        ? `<path d="M22 36 L32 28 L42 36" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
        : rank.divIndex === 1
        ? `<path d="M22 39 L32 31 L42 39 M22 30 L32 22 L42 30" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="M22 42 L32 34 L42 42 M22 33 L32 25 L42 33 M22 24 L32 16 L42 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;

    const prestigeRing =
      rank.prestige > 0
        ? `<polygon points="32,2 60,17 60,47 32,62 4,47 4,17" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7"/>`
        : '';

    const prestigeBadge =
      rank.prestige > 0
        ? `<circle cx="52" cy="14" r="9" fill="#07090f" stroke="${c}" stroke-width="2"/><text x="52" y="17.5" text-anchor="middle" fill="#fff" font-size="9" font-family="JetBrains Mono, monospace" font-weight="700">P${rank.prestige}</text>`
        : '';

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
        ${prestigeRing}
        <polygon points="32,6 56,19 56,45 32,58 8,45 8,19" fill="rgba(7,9,15,0.9)" stroke="${c}" stroke-width="3"/>
        <polygon points="32,12 50,22 50,42 32,52 14,42 14,22" fill="${c}" opacity="0.14"/>
        ${chevrons}
        ${prestigeBadge}
      </svg>
    `;
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

    const rank = getInfiniteRank(level);
    const nextRankLevel = level + (2 - ((level - 1) % 2));
    const nextRank = getInfiniteRank(nextRankLevel);

    return {
      level,
      rank,
      nextRank,
      nextRankLevel,
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

  function compressImage(file, maxSize = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Neplatný formát obrázku.'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width >= height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function loadAll() {
    if (!db || !user) return;

    const [todosRes, logsRes, woRes, setsRes, profRes, photosRes] = await Promise.all([
      db.from('todos').select('id, is_completed, priority, subtasks, created_at'),
      db.from('daily_logs').select('*').order('log_date', { ascending: true }).limit(365),
      db.from('workouts').select('*').order('workout_date', { ascending: true }).limit(365),
      db.from('workout_sets').select('*').limit(4000),
      db.from('fitness_profile').select('*').eq('user_id', user.id).maybeSingle(),
      db.from('user_photos').select('*').order('photo_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    ]);

    dataCache = {
      todos: todosRes.data || [],
      logs: logsRes.data || [],
      workouts: woRes.data || [],
      sets: setsRes.data || [],
      profile: profRes.data || null,
      photos: photosRes.data || [],
    };

    renderAll();
  }

  function computeRPG() {
    const { todos, logs, workouts, sets, profile, photos } = dataCache;
    const xpByDate = {};
    const addDailyXp = (dateStr, amount) => {
      if (!dateStr) return;
      xpByDate[dateStr] = (xpByDate[dateStr] || 0) + amount;
    };

    // 1. XP za splněné úkoly a podúkoly
    let todoXp = 0;
    let completedTodos = 0;
    let completedSubtasks = 0;
    todos.forEach((t) => {
      const dateStr = (t.created_at || '').slice(0, 10);
      const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
      const doneSubs = subs.filter((s) => s.done).length;
      if (doneSubs > 0) {
        completedSubtasks += doneSubs;
        const subPts = doneSubs * 5;
        todoXp += subPts;
        addDailyXp(dateStr, subPts);
      }
      if (t.is_completed) {
        completedTodos++;
        const pts = t.priority === 'high' ? 40 : t.priority === 'low' ? 15 : 25;
        todoXp += pts;
        addDailyXp(dateStr, pts);
      }
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

    // 3. XP za tréninky a série
    let workoutXp = 0;
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

    // 4. XP za fotky progresu (+15 XP za fotku)
    let photoXp = 0;
    photos.forEach((p) => {
      photoXp += 15;
      addDailyXp(p.photo_date, 15);
    });

    const totalXp = todoXp + logXp + workoutXp + photoXp;
    const levelInfo = getLevelInfo(totalXp);

    const gymStats = window.GymStats
      ? window.GymStats.compute(logs, profile)
      : { currentStreak: 0, longestStreak: 0 };

    const latestWeight = gymStats.avgWeight7 || gymStats.currentWeight || 80;
    const relStr = maxE1RM ? maxE1RM / latestWeight : 0;
    const strScore = Math.min(100, Math.round(relStr * 55 + Math.min(25, workouts.length * 2.5)));

    const avgSteps = gymStats.avgSteps30 || 0;
    const endScore = Math.min(
      100,
      Math.round((avgSteps / Math.max(targetSteps, 8000)) * 80 + Math.min(20, (gymStats.cardioDays30 || 0) * 5))
    );

    const proteinPct = gymStats.proteinHitPct ?? 0;
    const disScore = Math.min(100, Math.round(Math.min(50, gymStats.currentStreak * 5) + proteinPct * 0.5));
    const focusScore = Math.min(100, Math.round(Math.min(100, completedTodos * 5 + completedSubtasks * 1.5)));

    const avgSleep = gymStats.avgSleep30 || 0;
    const sleepPart = avgSleep ? Math.min(75, Math.max(0, ((avgSleep - 4.5) / 3.5) * 75)) : 0;
    const restPart = gymStats.restDays30 ? Math.min(25, gymStats.restDays30 * 5) : 0;
    const recScore = Math.min(100, Math.round(sleepPart + restPart));

    const today = new Date();
    const xpTimeline = [];
    const sortedAllDates = Object.keys(xpByDate).sort();
    const start30Str = toDateStr(new Date(today.getTime() - 29 * 86400000));

    let runningTotal = 0;
    sortedAllDates.forEach((d) => {
      if (d < start30Str) runningTotal += xpByDate[d];
    });

    for (let i = 29; i >= 0; i--) {
      const dStr = toDateStr(new Date(today.getTime() - i * 86400000));
      const daily = xpByDate[dStr] || 0;
      runningTotal += daily;
      xpTimeline.push({
        label: dStr.slice(5).split('-').reverse().join('.'),
        daily,
        cumulative: runningTotal,
      });
    }

    const achievements = [
      { icon: '⚔️', title: 'První krev', desc: 'Zapiš svůj první trénink', unlocked: workouts.length >= 1 },
      { icon: '🔥', title: 'Týdenní série', desc: 'Dosáhni 7denního streaku', unlocked: gymStats.longestStreak >= 7 },
      { icon: '🏋️', title: '100 kg Club', desc: 'Zvedni v sérii alespoň 100 kg', unlocked: maxWeightLifted >= 100 },
      { icon: '📦', title: '10 tun železa', desc: 'Celková tonáž 10 000+ kg', unlocked: totalTonnage >= 10000 },
      { icon: '👟', title: '10k Walker', desc: '30d průměr kroků ≥ 10 000', unlocked: avgSteps >= 10000 },
      { icon: '🥩', title: 'Protein Sniper', desc: 'Bílkoviny ≥ 80 % dnů (min. 5d)', unlocked: (gymStats.proteinHitPct || 0) >= 80 && logs.length >= 5 },
      { icon: '✅', title: 'Exekutor', desc: 'Splň 15 úkolů nebo 30 podúkolů', unlocked: completedTodos >= 15 || completedSubtasks >= 30 },
      { icon: '📸', title: 'Vizuální log', desc: 'Nahraj alespoň 3 fotky progresu', unlocked: photos.length >= 3 },
      { icon: '👑', title: 'Ascension I', desc: 'Překonej Level 60 a vstoupíš do P1', unlocked: levelInfo.level >= 61 },
    ];

    return {
      levelInfo,
      streak: gymStats.currentStreak || 0,
      todoXp,
      logXp,
      workoutXp,
      photoXp,
      totalTonnage,
      completedTodos,
      completedSubtasks,
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

    // Horní HUD
    if (el.hudEmblem) el.hudEmblem.innerHTML = buildRankEmblemSVG(levelInfo.rank, 38);
    if (el.hudLevel) el.hudLevel.textContent = `LVL ${levelInfo.level}`;
    if (el.hudRank) {
      el.hudRank.textContent = levelInfo.rank.shortName;
      el.hudRank.style.color = levelInfo.rank.color;
    }
    if (el.hudXpText) el.hudXpText.textContent = `${levelInfo.currentXp} / ${levelInfo.neededXp} XP`;
    if (el.hudXpFill) el.hudXpFill.style.width = `${levelInfo.pct}%`;
    if (el.hudStreak) el.hudStreak.textContent = `🔥 ${r.streak}d`;

    // Velká karta aktuálního ranku v záložce Progres
    if (el.rankShowcase) {
      el.rankShowcase.innerHTML = `
        <div class="rank-showcase-emblem">${buildRankEmblemSVG(levelInfo.rank, 76)}</div>
        <div class="rank-showcase-info">
          <div class="rank-showcase-tag mono">NEKONEČNÝ RANK SYSTÉM · LEVEL ${levelInfo.level}</div>
          <div class="rank-showcase-name" style="color: ${levelInfo.rank.color}">${levelInfo.rank.fullName}</div>
          <div class="muted">Další povýšení na <strong>${levelInfo.nextRank.fullName}</strong> od levelu ${levelInfo.nextRankLevel} · Celkem ${levelInfo.totalXp.toLocaleString('cs-CZ')} XP</div>
        </div>
      `;
    }

    // KPI
    if (el.progKpiGrid) {
      el.progKpiGrid.innerHTML = [
        `<div class="kpi-card kpi-glow"><span class="kpi-label">XP z tréninků</span><span class="kpi-value kpi-accent mono">${r.workoutXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Tonáž: ${Math.round(r.totalTonnage).toLocaleString('cs-CZ')} kg</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">XP z těla & stravy</span><span class="kpi-value mono">${r.logXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">Streak: ${r.streak} dní</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">XP z úkolů & podúkolů</span><span class="kpi-value mono">${r.todoXp.toLocaleString('cs-CZ')} XP</span><span class="kpi-sub">${r.completedTodos} úkolů · ${r.completedSubtasks} podúkolů</span></div>`,
        `<div class="kpi-card"><span class="kpi-label">Fotky progresu</span><span class="kpi-value mono">${dataCache.photos.length} ks</span><span class="kpi-sub">+${r.photoXp} XP z vizuálního logu</span></div>`,
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

    renderPhotos();
    renderCharts(r);
  }

  function renderPhotos() {
    if (!el.photoGallery) return;
    const filtered =
      photoFilter === 'all'
        ? dataCache.photos
        : dataCache.photos.filter((p) => p.category === photoFilter);

    if (!filtered.length) {
      el.photoGallery.innerHTML = '<p class="empty-state">Zatím tu nejsou žádné fotky.</p>';
      return;
    }

    el.photoGallery.innerHTML = filtered
      .map(
        (p) => `
        <article class="photo-card" data-photo-id="${p.id}">
          <div class="photo-thumb-wrap">
            <img src="${p.image_data}" alt="${escapeHtml(p.caption || 'Fotka')}" loading="lazy" class="photo-thumb">
            <button type="button" class="photo-del-btn" data-del-photo="${p.id}" title="Smazat fotku">✕</button>
          </div>
          <div class="photo-meta">
            <div class="photo-meta-top">
              <span class="mono">${p.photo_date}</span>
              <span class="badge badge-gym">${PHOTO_CAT_LABEL[p.category] || p.category}</span>
            </div>
            ${p.caption ? `<div class="photo-caption">${escapeHtml(p.caption)}</div>` : ''}
          </div>
        </article>
      `
      )
      .join('');
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
            label: 'Staty postavy',
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
        plugins: { legend: { display: false } },
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
            label: 'Denní XP',
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

  function bindEvents() {
    if (initializedListeners) return;
    initializedListeners = true;

    if (el.photoForm) {
      el.photoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = el.photoFile.files?.[0];
        if (!file || !user) {
          window.appShowError('Vyber nejdřív obrázek.');
          return;
        }

        el.photoSubmitBtn.disabled = true;
        el.photoSubmitBtn.textContent = 'Ukládám...';

        try {
          const imageData = await compressImage(file, 900, 0.72);
          const { error } = await db.from('user_photos').insert([
            {
              user_id: user.id,
              photo_date: el.photoDate.value || toDateStr(new Date()),
              category: el.photoCategory.value,
              caption: el.photoCaption.value.trim() || null,
              image_data: imageData,
            },
          ]);

          if (error) throw error;

          el.photoFile.value = '';
          el.photoCaption.value = '';
          window.appShowToast('Fotka nahrána (+15 XP).');
          await loadAll();
          window.CalendarModule?.refresh();
        } catch (err) {
          window.appShowError(`Chyba nahrávání: ${err.message}`);
        } finally {
          el.photoSubmitBtn.disabled = false;
          el.photoSubmitBtn.textContent = 'Nahrát fotku';
        }
      });
    }

    el.photoFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        photoFilter = btn.dataset.cat;
        el.photoFilterBtns.forEach((b) => b.classList.toggle('active', b === btn));
        renderPhotos();
      });
    });

    if (el.photoGallery) {
      el.photoGallery.addEventListener('click', async (e) => {
        const delBtn = e.target.closest('[data-del-photo]');
        if (delBtn) {
          e.stopPropagation();
          if (!confirm('Smazat tuto fotku?')) return;
          const { error } = await db.from('user_photos').delete().eq('id', delBtn.dataset.delPhoto);
          if (error) {
            window.appShowError(`Chyba mazání fotky: ${error.message}`);
            return;
          }
          window.appShowToast('Fotka smazána.');
          await loadAll();
          window.CalendarModule?.refresh();
          return;
        }

        const card = e.target.closest('.photo-card');
        if (card) {
          const photo = dataCache.photos.find((p) => p.id === card.dataset.photoId);
          if (photo && window.openPhotoLightbox) {
            window.openPhotoLightbox(
              photo.image_data,
              `${photo.photo_date} · ${PHOTO_CAT_LABEL[photo.category] || photo.category}${photo.caption ? ' — ' + photo.caption : ''}`
            );
          }
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
      if (el.photoDate && !el.photoDate.value) {
        el.photoDate.value = toDateStr(new Date());
      }
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
      dataCache = { todos: [], logs: [], workouts: [], sets: [], profile: null, photos: [] };
    },
  };
})();