// sqlite session store (the default memory store leaks)
const session = require('express-session');
const { db } = require('./db');
db.exec('CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, data TEXT, expires INTEGER)');

setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  } catch {}
}, 36e5).unref();

module.exports = class SqliteStore extends session.Store {
  get(sid, cb) {
    try {
      const r = db.prepare('SELECT data,expires FROM sessions WHERE sid=?').get(sid);
      cb(null, r && r.expires > Date.now() ? JSON.parse(r.data) : null);
    } catch (e) {
      cb(e);
    }
  }

  set(sid, sess, cb) {
    try {
      const exp =
        sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 6048e5;
      db.prepare('INSERT OR REPLACE INTO sessions VALUES(?,?,?)').run(
        sid,
        JSON.stringify(sess),
        exp,
      );
      cb && cb();
    } catch (e) {
      cb && cb(e);
    }
  }

  destroy(sid, cb) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid=?').run(sid);
      cb && cb();
    } catch (e) {
      cb && cb(e);
    }
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
};
