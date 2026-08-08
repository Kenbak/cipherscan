/**
 * Transaction Routes
 * /api/tx/*, /api/mempool
 */

const express = require('express');
const router = express.Router();
const { injectDependencies } = require('./transactions/_helpers');

router.use(injectDependencies);

// Order matters: more specific paths before parameterized catch-alls.
router.use('/', require('./transactions/tx-lists'));
router.use('/', require('./transactions/tx-read'));
router.use('/', require('./transactions/tx-raw'));
router.use('/', require('./transactions/tx-detail'));
router.use('/', require('./transactions/tx-mempool'));
router.use('/', require('./transactions/tx-write'));

module.exports = router;
