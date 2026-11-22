
require('dotenv').config();

const app = require('./app');
const { startMonitoringScheduler } = require('./services/scheduler.service');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Pulsewatch API running on port ${PORT}`);

  startMonitoringScheduler();
});
