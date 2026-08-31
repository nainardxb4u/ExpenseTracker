#!/usr/bin/env node
/** Sanity checks for weight → calorie plan (mirrors web/app.js). */
const KCAL_PER_KG = 7700;
const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };

function bmr(p) {
  const gender = p.calcGender || p.gender;
  const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
  return gender === "male" ? base + 5 : base - 161;
}
function tdee(p) {
  return Math.round(bmr(p) * (ACTIVITY[p.activity] || 1.375));
}
function planFromProfile(p) {
  const gender = p.calcGender || p.gender;
  const maintain = tdee(p);
  const current = p.weight;
  const target = p.targetWeight;
  const delta = +(target - current).toFixed(1);
  const abs = Math.abs(delta);
  const minKcal = gender === "male" ? 1500 : 1200;
  const maxKcal = maintain + 700;
  let mode = "maintain";
  if (delta <= -0.4) mode = "reduce";
  else if (delta >= 0.4) mode = "gain";
  const safeWeekly = mode === "reduce" ? 0.5 : mode === "gain" ? 0.35 : 0;
  let weeks = p.weeks;
  if (!weeks || weeks < 1) {
    weeks = mode === "maintain" ? 0 : Math.max(4, Math.ceil(abs / safeWeekly));
  }
  let weekly = 0;
  let dailyAdj = 0;
  if (mode !== "maintain") {
    weekly = delta / weeks;
    if (mode === "reduce") weekly = Math.max(-0.75, Math.min(-0.2, weekly));
    if (mode === "gain") weekly = Math.min(0.5, Math.max(0.15, weekly));
    dailyAdj = Math.round((weekly * KCAL_PER_KG) / 7);
  }
  let daily = maintain + dailyAdj;
  daily = Math.max(minKcal, Math.min(maxKcal, daily));
  dailyAdj = daily - maintain;
  weekly = +((dailyAdj * 7) / KCAL_PER_KG).toFixed(2);
  return { maintain, daily, dailyAdj, weekly, mode, delta, abs };
}

const base = { gender: "female", calcGender: "female", age: 28, height: 165, activity: "light", weeks: 12 };

const reduce = planFromProfile({ ...base, weight: 70, targetWeight: 65 });
const gain = planFromProfile({ ...base, weight: 60, targetWeight: 68 });
const hold = planFromProfile({ ...base, weight: 62, targetWeight: 62 });

const checks = [
  ["reduce mode", reduce.mode === "reduce"],
  ["reduce deficit", reduce.dailyAdj < 0],
  ["reduce daily below maintain", reduce.daily < reduce.maintain],
  ["gain mode", gain.mode === "gain"],
  ["gain surplus", gain.dailyAdj > 0],
  ["gain daily above maintain", gain.daily > gain.maintain],
  ["maintain mode", hold.mode === "maintain"],
  ["maintain zero adj", hold.dailyAdj === 0],
  ["maintain equals tdee", hold.daily === hold.maintain],
  ["heavier person burns more", tdee({ ...base, weight: 90 }) > tdee({ ...base, weight: 55 })]
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    failed += 1;
    console.error("FAIL", name);
  } else {
    console.log("ok", name);
  }
}
console.log("reduce", reduce);
console.log("gain", gain);
console.log("hold", hold);
if (failed) {
  process.exit(1);
}
console.log("all calorie-plan checks passed");
