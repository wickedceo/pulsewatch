const express = require('express');
const router = express.Router();

const {
  registerWebsite,
  listWebsites,
  updateWebsite,
  removeWebsite,
} = require('../controllers/website.controller');

router.post('/', registerWebsite);
router.get('/', listWebsites);
router.put('/:id', updateWebsite);
router.delete('/:id', removeWebsite);

module.exports = router;
