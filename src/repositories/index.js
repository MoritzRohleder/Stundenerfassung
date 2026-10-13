'use strict';

// Ein Repository pro Entität. Routes und Services kennen nur diese Methoden,
// nicht die Speicherform (Spec 10.2).

function createRepositories(storage) {
  const users = {
    findById: (id) => storage.findById('users', id),
    findByUsername: (username) =>
      storage.findOne('users', (u) => u.username.toLowerCase() === String(username).toLowerCase()),
    create: (data) => storage.insert('users', data),
    update: (id, changes) => storage.update('users', id, changes),
  };

  const timeBlocks = {
    forUser: (userId) => storage.findAll('time_blocks', { user_id: userId }),
    forDay: (userId, date) => storage.findAll('time_blocks', (b) => b.user_id === userId && b.date === date),
    create: (data) => storage.insert('time_blocks', data),
    removeForDay: (userId, date) => storage.removeWhere('time_blocks', (b) => b.user_id === userId && b.date === date),
  };

  const days = {
    forUser: (userId) => storage.findAll('days', { user_id: userId }),
    find: (userId, date) => storage.findOne('days', (d) => d.user_id === userId && d.date === date),
    create: (data) => storage.insert('days', data),
    update: (id, changes) => storage.update('days', id, changes),
    remove: (id) => storage.remove('days', id),
    removeForDay: (userId, date) => storage.removeWhere('days', (d) => d.user_id === userId && d.date === date),
  };

  const workSchedules = {
    forUser: (userId) => storage.findAll('work_schedules', { user_id: userId }),
    find: (userId, id) => storage.findOne('work_schedules', (s) => s.user_id === userId && s.id === id),
    create: (data) => storage.insert('work_schedules', data),
    update: (id, changes) => storage.update('work_schedules', id, changes),
    remove: (id) => storage.remove('work_schedules', id),
  };

  const vacationEntitlements = {
    forUser: (userId) => storage.findAll('vacation_entitlements', { user_id: userId }),
    find: (userId, year) => storage.findOne('vacation_entitlements', (e) => e.user_id === userId && e.year === year),
    create: (data) => storage.insert('vacation_entitlements', data),
    update: (id, changes) => storage.update('vacation_entitlements', id, changes),
    remove: (id) => storage.remove('vacation_entitlements', id),
  };

  return {
    users,
    timeBlocks,
    days,
    workSchedules,
    vacationEntitlements,
    transaction: (fn) => storage.transaction(fn),
  };
}

module.exports = { createRepositories };
