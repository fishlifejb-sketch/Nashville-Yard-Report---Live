(function () {
  "use strict";
  const cfg = window.YARD_CONFIG || {};
  const fb = cfg.firebase || {};

  if (!fb.apiKey || !fb.projectId || !window.firebase) {
    window.backendError = !window.firebase
      ? "Couldn't load Firebase. Check your internet connection and reload."
      : "This site isn't connected to its database yet. Fill in the Firebase settings in config.js (see README).";
    window.backendReady = Promise.resolve();
    return;
  }

  firebase.initializeApp(fb);
  const auth = firebase.auth();
  const db = firebase.firestore();
  try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) {}

  const signedIn = new Promise((resolve, reject) => {
    const off = auth.onAuthStateChanged(u => {
      if (u) { off(); resolve(u); }
    });
    auth.signInAnonymously().catch(err => {
      off();
      reject(err);
    });
  });

  const realDoc = db.doc.bind(db);
  db.doc = function (path) {
    const ref = realDoc(path);
    if (!ref.acquire) {
      ref.acquire = ({ holder, ttlMs }) => db.runTransaction(async tx => {
        const snap = await tx.get(ref), d = snap.exists ? snap.data() : null, now = Date.now();
        if (d && d.holder !== holder && (d.until || 0) > now) return { acquired: false };
        tx.set(ref, { holder, until: now + (ttlMs || 20000) });
        return { acquired: true };
      });
    }
    return ref;
  };

  const ownerRef = realDoc("owner/main");
  const onEmployeeLink = () => /^#e-/.test(location.hash || "");
  async function isOwner(uid) {
    const snap = await ownerRef.get();
    if (snap.exists) return snap.data().uid === uid;
    if (onEmployeeLink()) return false;
    try {
      return await db.runTransaction(async tx => {
        const s = await tx.get(ownerRef);
        if (s.exists) return s.data().uid === uid;
        tx.set(ownerRef, { uid, at: Date.now() });
        return true;
      });
    } catch (e) { return false; }
  }

  const relayUrl = (cfg.sheetRelayUrl || "").trim();
  function relayError(code, message) { const e = new Error(message); e.code = code; return e; }
  const mcp = !relayUrl ? null : {
    async listTools(server) {
      return { servers: [{ server, authStatus: "connected" }] };
    },
    async callTool(server, tool, args) {
      let res;
      try {
        res = await fetch(relayUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ secret: cfg.sheetRelaySecret || "", tool, args })
        });
      } catch (e) { throw relayError("server_unavailable", "The Google Sheet relay didn't respond."); }
      let out;
      try { out = await res.json(); }
      catch (e) { throw relayError("tool_error", "The relay sent back something unexpected. Check that the Apps Script is deployed with access set to Anyone."); }
      if (!out || !out.ok) throw relayError("tool_error", (out && out.error) || "Unknown error from the relay.");
      return { payload: out.payload };
    }
  };

  const downloads = {
    async save({ filename, data, mimeType }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "download.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  };

  window.backendReady = signedIn.then(u => {
    const uid = u.uid;
    let ownerP = null;
    const user = {
      id: async () => uid,
      isOwner: () => (ownerP = ownerP || isOwner(uid)),
      can: async () => true,
      profiles: async () => ({})
    };
    const services = { db, user, downloads, mcp };
    window.claude = { use: async name => services[name] || null };
  }).catch(err => {
    const code = (err && err.code) || "";
    window.backendError = /operation-not-allowed|admin-restricted/.test(code)
      ? "Firebase sign-in is turned off. In the Firebase console, go to Authentication → Sign-in method and enable Anonymous (see README)."
      : "Couldn't connect to the yard database (" + (code || (err && err.message) || "unknown error") + "). Check your signal and reload.";
  });
})();
