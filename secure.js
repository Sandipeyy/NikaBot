// aes-256-gcm helpers for the login cookie and db backups
// the key comes from SESSION_SECRET (BOT_TOKEN as fallback)
const crypto = require('crypto');
let key = null;
const k = () => key ||= crypto.scryptSync(
  process.env.SESSION_SECRET || process.env.BOT_TOKEN || 'dev-secret',
  'discord-bot-v1',
  32,
);

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k(), iv);
  const d = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), d]);
}

function decrypt(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', k(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

const seal = obj => encrypt(Buffer.from(JSON.stringify(obj))).toString('base64url');

function unseal(str) {
  try {
    return JSON.parse(decrypt(Buffer.from(String(str), 'base64url')).toString());
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt, seal, unseal };
