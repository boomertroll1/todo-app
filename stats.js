window.GymStats = (() => {
  const MS_DAY = 86400000;

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function daysDiff(dateStrA, dateStrB) {
    return Math.round((parseDate(dateStrB) - parseDate(dateStrA)) / MS_DAY);
  }

  function mean(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdDev(arr) {
    if (arr.length < 2) return null;
    const avg = mean(arr);
    const variance = arr.reduce((sum, x) => sum + (x - avg) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  function linearRegression(points) {
    if (points.length < 3) return null;
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  function pearsonCorrelation(pairs) {
    if (pairs.length < 5) return null;
    const xs = pairs.map((p) => p.x);
    const ys = pairs.map((p) => p.y);
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < pairs.length; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? null : num / denom;
  }

  function getISOWeekKey(dateStr) {
    const d = parseDate(dateStr);
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp - yearStart) / MS_DAY) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function getPreviousWeekKey(weekKey) {
    const [yearStr, wStr] = weekKey.split('-W');
    const jan4 = new Date(Date.UTC(Number(yearStr), 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const mondayOfW1 = new Date(jan4.getTime() - (dayOfWeek - 1) * MS_DAY);
    const targetMonday = new Date(mondayOfW1.getTime() + (Number(wStr) - 2) * 7 * MS_DAY);
    const y = targetMonday.getUTCFullYear();
    const m = String(targetMonday.getUTCMonth() + 1).padStart(2, '0');
    const d = String(targetMonday.getUTCDate()).padStart(2, '0');
    return getISOWeekKey(`${y}-${m}-${d}`);
  }

  function filterWindow(logs, refDateStr, days) {
    return logs.filter((l) => {
      const diff = daysDiff(l.log_date, refDateStr);
      return diff >= 0 && diff < days;
    });
  }

  function compute(rawLogs, profile) {
    const logs = [...rawLogs].sort((a, b) => a.log_date.localeCompare(b.log_date));
    const todayStr = toDateStr(new Date());
    const refDate = logs.length ? logs[logs.length - 1].log_date : todayStr;

    const logs7 = filterWindow(logs, refDate, 7);
    const logs14 = filterWindow(logs, refDate, 14);
    const logs30 = filterWindow(logs, refDate, 30);

    // 1. Váha a rozdíl oproti předchozímu zápisu
    const weightLogs = logs.filter((l) => l.weight_kg != null);
    const latestWeightLog = weightLogs[weightLogs.length - 1] || null;
    const prevWeightLog = weightLogs[weightLogs.length - 2] || null;
    const currentWeight = latestWeightLog ? Number(latestWeightLog.weight_kg) : null;
    const weightDeltaPrev =
      latestWeightLog && prevWeightLog
        ? Number(latestWeightLog.weight_kg) - Number(prevWeightLog.weight_kg)
        : null;

    // 2 & 3. Klouzavé průměry váhy (7d, 14d, 30d)
    const w7 = logs7.filter((l) => l.weight_kg != null).map((l) => Number(l.weight_kg));
    const w14 = logs14.filter((l) => l.weight_kg != null).map((l) => Number(l.weight_kg));
    const w30 = logs30.filter((l) => l.weight_kg != null).map((l) => Number(l.weight_kg));
    const avgWeight7 = mean(w7);
    const avgWeight14 = mean(w14);
    const avgWeight30 = mean(w30);

    // 4. Směrodatná odchylka váhy (7d / 30d)
    const stdWeight7 = stdDev(w7);
    const stdWeight30 = stdDev(w30);

    // 5 & 6. Lineární trend (kg/týden) a predikce za 30 dní (z okna posledních 30 dní)
    const w30Logs = logs30.filter((l) => l.weight_kg != null);
    let trendKgPerWeek = null;
    let predictedWeight30d = null;
    let slopePerDay = null;
    let trendLineMap = {};

    if (w30Logs.length >= 3) {
      const originDate = w30Logs[0].log_date;
      const spanDays = daysDiff(originDate, w30Logs[w30Logs.length - 1].log_date);
      if (spanDays >= 2) {
        const points = w30Logs.map((l) => ({
          x: daysDiff(originDate, l.log_date),
          y: Number(l.weight_kg),
        }));
        const reg = linearRegression(points);
        if (reg) {
          slopePerDay = reg.slope;
          trendKgPerWeek = reg.slope * 7;
          const lastX = points[points.length - 1].x;
          predictedWeight30d = reg.intercept + reg.slope * (lastX + 30);
          logs30.forEach((l) => {
            const x = daysDiff(originDate, l.log_date);
            trendLineMap[l.log_date] = Number((reg.intercept + reg.slope * x).toFixed(2));
          });
        }
      }
    }

    // 7. BMI
    const baseWeight = avgWeight7 ?? currentWeight;
    const heightM = profile?.height_cm ? Number(profile.height_cm) / 100 : null;
    const bmi = baseWeight && heightM ? baseWeight / (heightM * heightM) : null;

    // 8. Průměr kcal (7d / 30d)
    const k7 = logs7.filter((l) => l.calories != null).map((l) => Number(l.calories));
    const k30 = logs30.filter((l) => l.calories != null).map((l) => Number(l.calories));
    const avgKcal7 = mean(k7);
    const avgKcal30 = mean(k30);

    // 9. Bílkoviny (7d) + g/kg
    const p7 = logs7.filter((l) => l.protein_g != null).map((l) => Number(l.protein_g));
    const p30 = logs30.filter((l) => l.protein_g != null).map((l) => Number(l.protein_g));
    const avgProtein7 = mean(p7);
    const avgProtein30 = mean(p30);
    const proteinPerKg = avgProtein7 && baseWeight ? avgProtein7 / baseWeight : null;

    // 10 & 11. Reálné TDEE a reálný denní deficit/přebytek
    let estimatedTdee = null;
    let realDailyBalance = null;
    if (slopePerDay != null && k30.length >= 5 && w30Logs.length >= 5) {
      const spanDays = daysDiff(w30Logs[0].log_date, w30Logs[w30Logs.length - 1].log_date);
      if (spanDays >= 6) {
        realDailyBalance = slopePerDay * 7700; // záporné = deficit
        estimatedTdee = avgKcal30 - realDailyBalance;
      }
    }

    // 12. Úspěšnost plnění cílů (posledních 30 dní)
    let proteinHitPct = null;
    let kcalHitPct = null;
    if (profile?.target_protein_g && p30.length) {
      const hits = p30.filter((v) => v >= Number(profile.target_protein_g)).length;
      proteinHitPct = (hits / p30.length) * 100;
    }
    if (profile?.target_kcal && k30.length) {
      const limit = Number(profile.target_kcal) + 75;
      const hits = k30.filter((v) => v <= limit).length;
      kcalHitPct = (hits / k30.length) * 100;
    }

    // 13. Aktuální a nejdelší logging streak
    const dateSet = new Set(logs.map((l) => l.log_date));
    let currentStreak = 0;
    let cursor = new Date();
    if (!dateSet.has(toDateStr(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dateSet.has(toDateStr(cursor))) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    let longestStreak = 0;
    let run = 0;
    for (let i = 0; i < logs.length; i++) {
      if (i === 0 || daysDiff(logs[i - 1].log_date, logs[i].log_date) === 1) {
        run++;
      } else {
        run = 1;
      }
      if (run > longestStreak) longestStreak = run;
    }

    // 14. Tréninkový streak (týdny v řadě se splněným cílem tréninků)
    const targetWorkouts = Number(profile?.target_workouts_per_week || 5);
    const gymByWeek = {};
    logs.forEach((l) => {
      if (l.day_type === 'gym') {
        const wk = getISOWeekKey(l.log_date);
        gymByWeek[wk] = (gymByWeek[wk] || 0) + 1;
      }
    });
    const currentWeekKey = getISOWeekKey(todayStr);
    const gymThisWeek = gymByWeek[currentWeekKey] || 0;
    let trainingWeekStreak = 0;
    let checkWk = gymThisWeek >= targetWorkouts ? currentWeekKey : getPreviousWeekKey(currentWeekKey);
    while ((gymByWeek[checkWk] || 0) >= targetWorkouts) {
      trainingWeekStreak++;
      checkWk = getPreviousWeekKey(checkWk);
    }

    // 15. Poměr Gym / Rest / Cardio (30d)
    const gymDays30 = logs30.filter((l) => l.day_type === 'gym').length;
    const restDays30 = logs30.filter((l) => l.day_type === 'rest').length;
    const cardioDays30 = logs30.filter((l) => l.day_type === 'cardio').length;

    // 16. Dny od posledního rest day
    let daysSinceRest = null;
    if (logs.length) {
      let count = 0;
      for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].day_type === 'rest') break;
        count++;
      }
      daysSinceRest = count;
    }

    // 17. Průměr kroků (celkem, gym dny, rest dny za 30d)
    const stepsAll30 = logs30.filter((l) => l.steps != null).map((l) => Number(l.steps));
    const stepsGym30 = logs30
      .filter((l) => l.day_type === 'gym' && l.steps != null)
      .map((l) => Number(l.steps));
    const stepsRest30 = logs30
      .filter((l) => l.day_type === 'rest' && l.steps != null)
      .map((l) => Number(l.steps));

    // 18. Spánek (7d / 30d) + korelace spánku a kroků
    const sleep7 = logs7.filter((l) => l.sleep_hours != null).map((l) => Number(l.sleep_hours));
    const sleep30 = logs30.filter((l) => l.sleep_hours != null).map((l) => Number(l.sleep_hours));
    const sleepStepPairs = logs30
      .filter((l) => l.sleep_hours != null && l.steps != null)
      .map((l) => ({ x: Number(l.sleep_hours), y: Number(l.steps) }));
    const sleepStepsCorr = pearsonCorrelation(sleepStepPairs);

    // Data pro grafy (posledních 30 dní v chronologickém pořadí)
    const chartSeries = logs30.map((l) => {
      const win7 = filterWindow(logs, l.log_date, 7)
        .filter((x) => x.weight_kg != null)
        .map((x) => Number(x.weight_kg));
      return {
        date: l.log_date,
        label: l.log_date.slice(5).split('-').reverse().join('.'),
        weight: l.weight_kg != null ? Number(l.weight_kg) : null,
        weightAvg7: win7.length ? Number(mean(win7).toFixed(2)) : null,
        weightTrend: trendLineMap[l.log_date] ?? null,
        calories: l.calories != null ? Number(l.calories) : null,
        protein: l.protein_g != null ? Number(l.protein_g) : null,
        steps: l.steps != null ? Number(l.steps) : null,
        sleep: l.sleep_hours != null ? Number(l.sleep_hours) : null,
        dayType: l.day_type,
      };
    });

    return {
      totalDays: logs.length,
      currentWeight,
      weightDeltaPrev,
      avgWeight7,
      avgWeight14,
      avgWeight30,
      stdWeight7,
      stdWeight30,
      trendKgPerWeek,
      predictedWeight30d,
      bmi,
      avgKcal7,
      avgKcal30,
      avgProtein7,
      avgProtein30,
      proteinPerKg,
      estimatedTdee,
      realDailyBalance,
      proteinHitPct,
      kcalHitPct,
      currentStreak,
      longestStreak,
      trainingWeekStreak,
      gymThisWeek,
      targetWorkouts,
      gymDays30,
      restDays30,
      cardioDays30,
      daysSinceRest,
      avgSteps30: mean(stepsAll30),
      avgStepsGym30: mean(stepsGym30),
      avgStepsRest30: mean(stepsRest30),
      avgSleep7: mean(sleep7),
      avgSleep30: mean(sleep30),
      sleepStepsCorr,
      chartSeries,
    };
  }

  return { compute, toDateStr };
})();