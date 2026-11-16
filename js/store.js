// Storage layer. Uses Firebase Auth + Firestore when js/firebase-config.js is
// filled in, otherwise falls back to this browser's localStorage.
//
// Firestore layout (multi-user ready):
//   users/{uid}                    { prefs, tier, lastVisit, createdAt }
//   users/{uid}/properties/{id}    { listing, opts, notes, updatedAt }

import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';
const LS_KEY = 'rentalrater:v1';

let mode = 'local';
let fb = null;      // { auth, db, fs, authMod }
let user = null;
const authListeners = [];

function lsRead() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
function lsWrite(d) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* storage blocked */ } }

export async function init() {
  if (!firebaseConfig.apiKey) {
    mode = 'local';
    user = { uid: 'local', displayName: 'This browser', local: true };
    authListeners.forEach((cb) => cb(user));
    return { mode };
  }
  let appMod, authMod, fs;
  try {
    [appMod, authMod, fs] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-auth.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
  } catch (e) {
    // Firebase couldn't load (offline, blocked). Keep working in local mode.
    mode = 'local';
    user = { uid: 'local', displayName: 'This browser', local: true };
    authListeners.forEach((cb) => cb(user));
    return { mode, error: `Couldn't reach Firebase, so changes are only saved in this browser. (${e.message})` };
  }
  const app = appMod.initializeApp(firebaseConfig);
  fb = { auth: authMod.getAuth(app), db: fs.getFirestore(app), fs, authMod };
  mode = 'firebase';
  authMod.onAuthStateChanged(fb.auth, (u) => {
    user = u ? { uid: u.uid, displayName: u.displayName || u.email, email: u.email, photoURL: u.photoURL } : null;
    authListeners.forEach((cb) => cb(user));
  });
  return { mode };
}

export const getMode = () => mode;
export const currentUser = () => user;
export function onAuth(cb) { authListeners.push(cb); if (user) cb(user); }

export async function signIn() {
  if (mode !== 'firebase') return;
  const { authMod, auth } = fb;
  const provider = new authMod.GoogleAuthProvider();
  try { await authMod.signInWithPopup(auth, provider); }
  catch (e) {
    if (e && /popup/i.test(e.code || '')) await authMod.signInWithRedirect(auth, provider);
    else throw e;
  }
}

export async function signOut() { if (mode === 'firebase') await fb.authMod.signOut(fb.auth); }

function userDoc() { return fb.fs.doc(fb.db, 'users', user.uid); }

export async function loadUser() {
  if (mode === 'local') { const d = lsRead(); return { prefs: d.prefs || {}, lastVisit: d.lastVisit || null }; }
  const snap = await fb.fs.getDoc(userDoc());
  if (!snap.exists()) {
    await fb.fs.setDoc(userDoc(), { prefs: {}, tier: 'free', createdAt: fb.fs.serverTimestamp() });
    return { prefs: {}, lastVisit: null };
  }
  const d = snap.data();
  return { prefs: d.prefs || {}, lastVisit: d.lastVisit || null };
}

export async function savePrefs(prefs) {
  const clean = JSON.parse(JSON.stringify(prefs));
  if (mode === 'local') { const d = lsRead(); d.prefs = clean; lsWrite(d); return; }
  await fb.fs.setDoc(userDoc(), { prefs: clean }, { merge: true });
}

export async function markVisit(iso) {
  if (mode === 'local') { const d = lsRead(); d.lastVisit = iso; lsWrite(d); return; }
  await fb.fs.setDoc(userDoc(), { lastVisit: iso }, { merge: true });
}

export async function listProperties() {
  if (mode === 'local') return Object.values(lsRead().properties || {});
  const snap = await fb.fs.getDocs(fb.fs.collection(userDoc(), 'properties'));
  return snap.docs.map((d) => d.data());
}

export async function saveProperty(rec) {
  const clean = JSON.parse(JSON.stringify({ ...rec, updatedAt: new Date().toISOString() }));
  if (mode === 'local') { const d = lsRead(); d.properties = d.properties || {}; d.properties[rec.id] = clean; lsWrite(d); return; }
  await fb.fs.setDoc(fb.fs.doc(userDoc(), 'properties', safeId(rec.id)), clean);
}

export async function deleteProperty(id) {
  if (mode === 'local') { const d = lsRead(); if (d.properties) delete d.properties[id]; lsWrite(d); return; }
  await fb.fs.deleteDoc(fb.fs.doc(userDoc(), 'properties', safeId(id)));
}

const safeId = (id) => String(id).replace(/[\/#?\[\]]/g, '_').slice(0, 500);
