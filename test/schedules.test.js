'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduleFor, dailyTarget, validatePeriod } = require('../src/services/schedules');

const std = { id: 's', valid_from: null, valid_to: null, weekly_min: 20 * 60, workdays: [1, 2, 3, 4, 5] };
const p1 = { id: 'p1', valid_from: '2027-02-01', valid_to: '2027-04-10', weekly_min: 40 * 60, workdays: [1, 2, 3, 4, 5] };

test('Zeitraum hat Vorrang vor dem Standardmodell', () => {
  const all = [std, p1];
  assert.equal(scheduleFor(all, '2027-01-31').id, 's');
  assert.equal(scheduleFor(all, '2027-02-01').id, 'p1');
  assert.equal(scheduleFor(all, '2027-04-10').id, 'p1');
  assert.equal(scheduleFor(all, '2027-04-11').id, 's');
});

test('Tagessoll = Woche / Arbeitstage, kaufmännisch gerundet', () => {
  assert.equal(dailyTarget(std, 1), 240);
  assert.equal(dailyTarget(std, 6), 0);
  assert.equal(dailyTarget({ weekly_min: 2310, workdays: [1, 2, 3, 4, 5] }, 3), 462);
  assert.equal(dailyTarget({ weekly_min: 2400, workdays: [1, 2, 3] }, 2), 800);
  assert.equal(dailyTarget({ weekly_min: 100, workdays: [1, 2, 3] }, 2), 33);
});

test('Offener Zeitraum gilt bis auf Weiteres (E-20)', () => {
  const open = { id: 'p2', valid_from: '2027-05-01', valid_to: null, weekly_min: 1800, workdays: [1, 2, 3, 4, 5] };
  assert.equal(scheduleFor([std, p1, open], '2035-01-01').id, 'p2');
});

test('Zeiträume dürfen sich nicht überschneiden', () => {
  const all = [std, p1];
  assert.match(validatePeriod({ valid_from: '2027-04-10', valid_to: '2027-05-01' }, all), /überschneidet/);
  assert.equal(validatePeriod({ valid_from: '2027-04-11', valid_to: '2027-05-01' }, all), null);
  assert.match(validatePeriod({ valid_from: '2027-03-01', valid_to: '2027-02-01' }, all), /vor dem Startdatum/);
  assert.equal(validatePeriod({ ...p1, valid_to: '2027-04-20' }, all), null, 'eigener Zeitraum zählt nicht');
});

test('Nur der letzte Zeitraum darf offen sein', () => {
  const all = [std, p1];
  assert.match(validatePeriod({ valid_from: '2026-01-01', valid_to: null }, all), /überschneidet/);
  assert.equal(validatePeriod({ valid_from: '2027-05-01', valid_to: null }, all), null);
  const withOpen = [...all, { id: 'o', valid_from: '2027-06-01', valid_to: null }];
  assert.match(validatePeriod({ valid_from: '2027-08-01', valid_to: '2027-09-01' }, withOpen), /überschneidet/);
});
