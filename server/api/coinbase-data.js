const NON_PRINTABLE_UTF8 = /[\u0000-\u001f\u007f-\u009f\ufffd]/g;

function decodeCoinbaseText(hex) {
  if (
    typeof hex !== 'string'
    || hex.length === 0
    || hex.length % 2 !== 0
    || !/^[0-9a-f]+$/i.test(hex)
  ) {
    return null;
  }

  return Buffer.from(hex, 'hex')
    .toString('utf8')
    .replace(NON_PRINTABLE_UTF8, '.');
}

module.exports = { decodeCoinbaseText };
