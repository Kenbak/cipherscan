// Deployment identity, not the browser host, controls network-specific data.
function isTestnet(env = process.env) {
  if (env.NETWORK) return env.NETWORK.toLowerCase() === 'testnet';
  return /testnet/i.test(env.DB_NAME || '') || /:18232(?:\/|$)/.test(env.ZEBRA_RPC_URL || '');
}

function mainnetOnly(feature) {
  return (_req, res, next) => {
    if (!isTestnet()) return next();
    return res.status(404).json({
      success: false, available: false, network: 'testnet',
      code: 'FEATURE_UNAVAILABLE_ON_NETWORK', feature,
      error: `${feature} is not available on testnet`,
    });
  };
}
module.exports = { isTestnet, mainnetOnly };
