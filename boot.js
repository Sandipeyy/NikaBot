// restore the db from the backup first, then start the bot
require('dotenv').config();

(async () => {
  try {
    await require('./backup').restore();
  } catch (e) {
    console.warn('[backup] restore skipped:', e.message);
  }

  require('./index.js');
})();
