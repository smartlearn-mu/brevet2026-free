// ============================================================
// SMART LEARN â€” PROXY CLIENT UNIFIÃ‰ (v4.0.0)
// FIX CORS : URLSearchParams (pas de preflight)
// ============================================================

const PROXY_URL = 'https://script.google.com/macros/s/AKfycbxzUhsZ4ewxV_zGsu5h_L2eryTJiW2E-gZLvihC-vPl2DimCJxAeTF2dhbDF8no-ocG/exec';
const PROXY_TIMEOUT_MS = 45000;

// â”€â”€ Helpers identitÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getUserId() {
  var id = localStorage.getItem('user_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'user_' + Date.now();
    localStorage.setItem('user_id', id);
  }
  return id;
}

function getSessionId() {
  var sid = sessionStorage.getItem('session_id');
  if (!sid) { sid = 'sess_' + Date.now(); sessionStorage.setItem('session_id', sid); }
  return sid;
}

function isPaid() {
  if (typeof aAccesComplet !== 'undefined') return aAccesComplet();
  return localStorage.getItem('brevet_paid') === 'true';
}

function getJoursRestantsEssai() {
  if (typeof joursRestantsEssai !== 'undefined') return joursRestantsEssai();
  return 0;
}

function safeJSON(t) {
  try { return JSON.parse(t.replace(/```json|```/g, '').trim()); }
  catch(e) { return null; }
}

// â”€â”€ Appel proxy (URLSearchParams = pas de preflight CORS) â”€â”€â”€â”€â”€
function _fetchProxy(payload, timeoutMs) {
  timeoutMs = timeoutMs || PROXY_TIMEOUT_MS;
  var timeout = new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('Timeout ' + (timeoutMs/1000) + 's')); }, timeoutMs);
  });
  var req = fetch(PROXY_URL, {
    method: 'POST',
    body: new URLSearchParams({ data: JSON.stringify(payload) })
  }).then(function(r) {
    if (!r.ok) throw new Error('Proxy HTTP ' + r.status);
    return r.json();
  });
  return Promise.race([req, timeout]);
}

// â”€â”€ callIA : correction IA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function callIA(prompt, system) {
  // VÃ©rification accÃ¨s avant tout appel
  if (typeof aAccesComplet !== 'undefined' && !aAccesComplet()) {
    if (typeof essaiExpire !== 'undefined' && essaiExpire()) {
      if (typeof afficherBlocageEssaiExpire !== 'undefined') afficherBlocageEssaiExpire();
    } else {
      if (typeof afficherRappelPaiement !== 'undefined') afficherRappelPaiement();
    }
    throw new Error('ACCES_BLOQUE');
  }

  var data = await _fetchProxy({
    userId: getUserId(),
    action: 'correction_ia',
    prompt: prompt,
    system: system,
    estPayant: isPaid(),
    sessionId: getSessionId(),
    joursRestantsEssai: getJoursRestantsEssai(),
    source: document.title || window.location.pathname,
    matiere: window._currentMatiere || '',
    type: window._currentType || ''
  });

  if (data.success && data.content) return data.content;
  throw new Error(data.error || 'RÃ©ponse proxy inattendue');
}

// â”€â”€ validerCodeServeur : validation d'un code d'accÃ¨s â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function validerCodeServeur(code) {
  var data = await _fetchProxy({
    userId: getUserId(),
    action: 'valider_code',
    code: code,
    sessionId: getSessionId(),
    source: document.title || window.location.pathname
  }, 10000);

  if (data.success) return data;
  throw new Error(data.error || 'Code invalide');
}

// â”€â”€ Surcharge isPaid avec le systÃ¨me de monÃ©tisation â”€â”€â”€â”€â”€â”€â”€â”€â”€
window.isPaid = function() {
  if (typeof aAccesComplet !== 'undefined') return aAccesComplet();
  return localStorage.getItem('brevet_paid') === 'true';
};

// Exposer globalement
window.callIA = callIA;
window.validerCodeServeur = validerCodeServeur;
window.getUserId = getUserId;
window.getSessionId = getSessionId;
window.getJoursRestantsEssai = getJoursRestantsEssai;
window.safeJSON = safeJSON;
