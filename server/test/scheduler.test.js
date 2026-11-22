const assert = require('node:assert/strict');
const { test } = require('node:test');
const cron = require('node-cron');
const pool = require('../src/config/database');
const monitorService = require('../src/services/monitor.service');

test('scheduler registers once with overlap prevention enabled', () => {
  const schedulerPath = require.resolve('../src/services/scheduler.service');
  const previousSchedulerModule = require.cache[schedulerPath];
  const originalSchedule = cron.schedule;
  const scheduledTask = { id: 'pulsewatch-scheduler' };
  const registrations = [];

  delete require.cache[schedulerPath];
  cron.schedule = (expression, callback, options) => {
    registrations.push({ expression, callback, options });
    return scheduledTask;
  };

  try {
    const { startMonitoringScheduler } = require('../src/services/scheduler.service');

    const firstTask = startMonitoringScheduler();
    const secondTask = startMonitoringScheduler();

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].expression, '*/5 * * * *');
    assert.equal(typeof registrations[0].callback, 'function');
    assert.equal(registrations[0].options.noOverlap, true);
    assert.equal(firstTask, scheduledTask);
    assert.equal(secondTask, scheduledTask);
  } finally {
    cron.schedule = originalSchedule;
    delete require.cache[schedulerPath];
    if (previousSchedulerModule) {
      require.cache[schedulerPath] = previousSchedulerModule;
    }
  }
});

test('scheduled websites use the registered website check path with their owner IDs', async () => {
  const schedulerPath = require.resolve('../src/services/scheduler.service');
  const previousSchedulerModule = require.cache[schedulerPath];
  const originalSchedule = cron.schedule;
  const originalQuery = pool.query;
  const originalRegisteredCheck = monitorService.checkRegisteredWebsite;
  const calls = [];
  let scheduledCallback;

  delete require.cache[schedulerPath];
  cron.schedule = (_expression, callback) => {
    scheduledCallback = callback;
    return { id: 'pulsewatch-scheduler' };
  };
  pool.query = async () => ({
    rows: [{ id: 'website-id', user_id: 'owner-id' }],
  });
  monitorService.checkRegisteredWebsite = async (websiteId, userId) => {
    calls.push([websiteId, userId]);
    return { isOnline: true, responseTime: 5 };
  };

  try {
    const { startMonitoringScheduler } = require('../src/services/scheduler.service');
    startMonitoringScheduler();
    await scheduledCallback();
    assert.deepEqual(calls, [['website-id', 'owner-id']]);
  } finally {
    cron.schedule = originalSchedule;
    pool.query = originalQuery;
    monitorService.checkRegisteredWebsite = originalRegisteredCheck;
    delete require.cache[schedulerPath];
    if (previousSchedulerModule) {
      require.cache[schedulerPath] = previousSchedulerModule;
    }
  }
});
