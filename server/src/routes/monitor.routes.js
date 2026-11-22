
const express = require('express');
const router = express.Router();

const {
  monitorWebsite,
  monitorRegisteredWebsite,
  getWebsiteHistory,
  getWebsiteStats,
} = require('../controllers/monitor.controller');

// Check any URL
router.post('/check', monitorWebsite);

// Get monitoring history
router.get('/:id/history', getWebsiteHistory);

// Get monitoring statistics
router.get('/:id/stats', getWebsiteStats);

// Check a registered website
router.post('/:id/check', monitorRegisteredWebsite);

module.exports = router;
