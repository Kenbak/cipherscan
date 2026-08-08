/**
 * Crosslink Routes
 * /api/crosslink - network stats, finality, roster, staking day
 */

const express = require('express');
const router = express.Router();
const { attachLocals } = require('./crosslink/_helpers');

router.use(attachLocals);
router.use('/', require('./crosslink/stats'));
router.use('/', require('./crosslink/finalizers'));
router.use('/', require('./crosslink/fork-monitor'));

module.exports = router;
