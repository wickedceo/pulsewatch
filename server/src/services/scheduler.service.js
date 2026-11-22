
const cron = require('node-cron');
const pool = require('../config/database');
const { checkRegisteredWebsite } = require('./monitor.service');

let scheduledTask;

const startMonitoringScheduler = () => {
  if (scheduledTask) return scheduledTask;

  console.log('Pulsewatch monitoring scheduler initialized.');

  // Run every 5 minutes
  scheduledTask = cron.schedule('*/5 * * * *', async () => {
    console.log('Starting scheduled website checks...');

    try {
      const result = await pool.query(
        `SELECT id, user_id FROM websites
         WHERE is_active = TRUE AND user_id IS NOT NULL`
      );

      const websites = result.rows;

      console.log(`Found ${websites.length} active websites.`);

      for (const website of websites) {
        try {
          const check = await checkRegisteredWebsite(website.id, website.user_id);

          if (check) {
            console.log(
              `Checked website ${website.id}: ${
                check.isOnline ? 'ONLINE' : 'OFFLINE'
              } (${check.responseTime}ms)`
            );
          }
        } catch (error) {
          console.error(
            `Failed to check website ${website.id}:`,
            error.message
          );
        }
      }

      console.log('Scheduled website checks completed.');
    } catch (error) {
      console.error('Monitoring scheduler error:', error);
    }
  }, { noOverlap: true });

  return scheduledTask;
};

module.exports = {
  startMonitoringScheduler,
};