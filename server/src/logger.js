const { format } = require("winston");
const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

function cleanUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined),
  );
}

const logger = {
  info: async (logObj) => {
    const id = logObj.requestId || undefined;
    const cleanLog = cleanUndefined(logObj);
    if (id) {
      await db
        .collection("server_logs")
        .doc(id)
        .set(
          {
            ...cleanLog,
            level: "info",
            timestamp: new Date().toISOString(),
          },
          { merge: true },
        );
    } else {
      await db.collection("server_logs").add({
        ...cleanLog,
        level: "info",
        timestamp: new Date().toISOString(),
      });
    }
  },
  warn: async (logObj) => {
    const id = logObj.requestId || undefined;
    const cleanLog = cleanUndefined(logObj);
    if (id) {
      await db
        .collection("server_logs")
        .doc(id)
        .set(
          {
            ...cleanLog,
            level: "warn",
            timestamp: new Date().toISOString(),
          },
          { merge: true },
        );
    } else {
      await db.collection("server_logs").add({
        ...cleanLog,
        level: "warn",
        timestamp: new Date().toISOString(),
      });
    }
  },
  error: async (logObj) => {
    const id = logObj.requestId || undefined;
    const cleanLog = cleanUndefined(logObj);
    if (id) {
      await db
        .collection("server_logs")
        .doc(id)
        .set(
          {
            ...cleanLog,
            level: "error",
            timestamp: new Date().toISOString(),
          },
          { merge: true },
        );
    } else {
      await db.collection("server_logs").add({
        ...cleanLog,
        level: "error",
        timestamp: new Date().toISOString(),
      });
    }
  },
};

module.exports = logger;
