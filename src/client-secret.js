const crypto = require("crypto");

// Get a secret for a given client ID
function getClientSecret(clientId, secret) {
  const combined = `${secret}${clientId}`;
  const hash = crypto.createHash("sha256").update(combined).digest("hex");
  const integerHash = BigInt("0x" + hash);
  const base36 = integerHash.toString(36).toUpperCase();
  return base36.substring(0, 8);
}

module.exports = getClientSecret;
