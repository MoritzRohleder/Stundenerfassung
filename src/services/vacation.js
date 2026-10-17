'use strict';

const { isHalfWorkday } = require('./worktime');

// Urlaubskonto (Spec 6.6).

function trackingYear(user) {
  return user.tracking_start ? Number(user.tracking_start.slice(0, 4)) : null;
}

function entitlementOf(ctx, year) {
  return ctx.entitlements.find((e) => e.year === year) || null;
}

/** Genommene Urlaubstage eines Jahres, getrennt nach vergangen/geplant. */
function takenIn(ctx, year) {
  let taken = 0;
  let planned = 0;
  const prefix = `${year}-`;
  for (const [date, day] of ctx.daysByDate) {
    if (!date.startsWith(prefix) || day.absence_type !== 'vacation') continue;
    // Heiligabend/Silvester sind halbe Arbeitstage: frei nehmen kostet einen halben Urlaubstag.
    const days = day.absence_fraction * (isHalfWorkday(ctx, date) ? 0.5 : 1);
    taken += days;
    if (date > ctx.today) planned += days;
  }
  return { taken, planned };
}

/**
 * Urlaubskonto eines Jahres oder null, wenn das Jahr vor dem Beginn der Erfassung liegt.
 */
function vacationYear(ctx, year) {
  const first = trackingYear(ctx.user);
  if (first === null || year < first) return null;
  const memoKey = `vacation-${year}`;
  if (ctx.cache.has(memoKey)) return ctx.cache.get(memoKey);

  const ent = entitlementOf(ctx, year);
  const entitlement = ent && ent.days !== null && ent.days !== undefined ? ent.days : ctx.user.vacation_days_default || 0;
  let carryover;
  let carryoverManual = false;
  if (ent && ent.carryover_days !== null && ent.carryover_days !== undefined) {
    carryover = ent.carryover_days;
    carryoverManual = true;
  } else if (year === first) {
    carryover = 0;
  } else {
    carryover = Math.max(0, vacationYear(ctx, year - 1).rest);
  }
  const { taken, planned } = takenIn(ctx, year);
  const result = {
    year,
    entitlement,
    entitlementManual: Boolean(ent && ent.days !== null && ent.days !== undefined),
    carryover,
    carryoverManual,
    taken,
    planned,
    rest: entitlement + carryover - taken,
  };
  ctx.cache.set(memoKey, result);
  return result;
}

module.exports = { vacationYear, takenIn, trackingYear };
