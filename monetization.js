// ============================================================
// SMART LEARN â€” SYSTÃˆME DE MONÃ‰TISATION (v4.1.1)
// Essai gratuit 2 jours Â· 29â‚¬/an Â· Code par email automatique
// Fix : verifierRappel lancÃ© + setTimeout J1
// ============================================================

const MONETIZATION = {
  prix: 29,
  devise: 'EUR',
  dureeAbonnement: 365,
  essaiJours: 2,
  rappelHeures: 12,
  codeMaitre: 'Entrepotes974NawalWassil',
  paymentWise: 'https://wise.com/pay/r/UeBUFQoUY_B5FYE',
  emailContact: 'smartlearn.mu@gmail.com',
  nomBeneficiaire: 'SMART LEARN',
  STORAGE_KEYS: {
    trialStart:       'brevet_start',
    paidValid:        'brevet_paid',
    lastReminder:     'brevet_last_reminder',
    overlayDismissed: 'brevet_ov_dismiss',
    pendingCode:      'brevet_pending_code',
    pendingEmail:     'brevet_pending_email'
  }
};

function estEnEssai() {
  var start = localStorage.getItem(MONETIZATION.STORAGE_KEYS.trialStart);
  if (!start) return true;
  var joursEcoules = (Date.now() - parseInt(start)) / (1000 * 60 * 60 * 24);
  return joursEcoules < MONETIZATION.essaiJours;
}

function essaiExpire() {
  var start = localStorage.getItem(MONETIZATION.STORAGE_KEYS.trialStart);
  if (!start) return false;
  var joursEcoules = (Date.now() - parseInt(start)) / (1000 * 60 * 60 * 24);
  return joursEcoules >= MONETIZATION.essaiJours;
}

function aAccesComplet() {
  if (localStorage.getItem(MONETIZATION.STORAGE_KEYS.paidValid) === 'true') return true;
  return estEnEssai();
}

function aAccesPayant() {
  return localStorage.getItem(MONETIZATION.STORAGE_KEYS.paidValid) === 'true';
}

function joursRestantsEssai() {
  var start = localStorage.getItem(MONETIZATION.STORAGE_KEYS.trialStart);
  if (!start) return MONETIZATION.essaiJours;
  var joursEcoules = (Date.now() - parseInt(start)) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(MONETIZATION.essaiJours - joursEcoules));
}

function verifierCodeLocal(code) {
  return code.trim() === MONETIZATION.codeMaitre;
}

function genererCodeUnique() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function envoyerCodeParEmail(email, code) {
  var proxyUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.proxyUrl)
    ? APP_CONFIG.proxyUrl
    : 'https://script.google.com/macros/s/AKfycbxzUhsZ4ewxV_zGsu5h_L2eryTJiW2E-gZLvihC-vPl2DimCJxAeTF2dhbDF8no-ocG/exec';
  var payload = {
    userId: (typeof getUserId !== 'undefined') ? getUserId() : 'anon',
    action: 'generer_code_email',
    email: email,
    code: code,
    source: document.title || window.location.pathname,
    timestamp: Date.now()
  };
  try {
    var response = await fetch(proxyUrl, {
      method: 'POST',
      body: new URLSearchParams({ data: JSON.stringify(payload) })
    });
    var result = await response.json();
    return result.success === true;
  } catch(e) {
    console.error('Erreur envoi email:', e);
    return false;
  }
}

function validerCode(codeSaisi, callback) {
  var code = codeSaisi.trim();

  if (verifierCodeLocal(code)) {
    localStorage.setItem(MONETIZATION.STORAGE_KEYS.paidValid, 'true');
    localStorage.removeItem(MONETIZATION.STORAGE_KEYS.pendingCode);
    localStorage.removeItem(MONETIZATION.STORAGE_KEYS.pendingEmail);
    if (callback) callback({ success: true, message: 'Acces famille active ! Acces complet debloque.' });
    return;
  }

  var pendingCode = localStorage.getItem(MONETIZATION.STORAGE_KEYS.pendingCode);
  if (pendingCode && pendingCode === code) {
    localStorage.setItem(MONETIZATION.STORAGE_KEYS.paidValid, 'true');
    localStorage.removeItem(MONETIZATION.STORAGE_KEYS.pendingCode);
    localStorage.removeItem(MONETIZATION.STORAGE_KEYS.pendingEmail);
    if (callback) callback({ success: true, message: 'Code valide ! Acces complet debloque.' });
    return;
  }

  var proxyUrl = (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.proxyUrl)
    ? APP_CONFIG.proxyUrl
    : 'https://script.google.com/macros/s/AKfycbxzUhsZ4ewxV_zGsu5h_L2eryTJiW2E-gZLvihC-vPl2DimCJxAeTF2dhbDF8no-ocG/exec';

  var payload = JSON.stringify({
    userId: (typeof getUserId !== 'undefined') ? getUserId() : 'anon',
    action: 'valider_code',
    code: code,
    sessionId: (typeof getSessionId !== 'undefined') ? getSessionId() : 'sess',
    source: document.title || ''
  });

  var timeout = new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('Timeout')); }, 10000);
  });

  var req = fetch(proxyUrl, {
    method: 'POST',
    body: new URLSearchParams({ data: payload })
  }).then(function(r) { return r.json(); });

  Promise.race([req, timeout]).then(function(data) {
    if (data && data.success === true) {
      localStorage.setItem(MONETIZATION.STORAGE_KEYS.paidValid, 'true');
      localStorage.removeItem(MONETIZATION.STORAGE_KEYS.pendingCode);
      localStorage.removeItem(MONETIZATION.STORAGE_KEYS.pendingEmail);
      if (callback) callback({ success: true, message: 'Code valide ! Acces complet debloque.' });
    } else {
      if (callback) callback({ success: false, message: (data && data.error ? data.error : 'Code invalide.') });
    }
  }).catch(function() {
    if (callback) callback({ success: false, message: 'Impossible de valider. Verifiez votre connexion.' });
  });
}

function creerOverlayAvecEmail(type, joursRestants) {
  if (document.getElementById('monet-overlay')) return;
  joursRestants = joursRestants || 0;

  var titre, message, showEmailForm = true;
  if (type === 'expire') {
    titre = 'Essai gratuit termine';
    message = 'Votre essai gratuit de 2 jours est termine.';
  } else if (type === 'rappel') {
    titre = 'Essai gratuit - J-' + joursRestants;
    message = joursRestants === 1
      ? 'Dernier jour ! Debloquez pour 1 an.'
      : 'Encore ' + joursRestants + ' jour(s). Debloquez pour 1 an.';
  } else {
    titre = 'Acces bloque';
    message = 'Vous devez debloquer pour continuer.';
    showEmailForm = false;
  }

  var canClose = (type === 'rappel');
  var overlay = document.createElement('div');
  overlay.id = 'monet-overlay';
  overlay.innerHTML = '<style>' +
    '#monet-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(9,9,15,0.97);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:"DM Sans","Segoe UI",Arial,sans-serif;backdrop-filter:blur(8px);}' +
    '.monet-card{background:#111118;border:1px solid #2a2a38;border-radius:16px;padding:32px 28px;max-width:480px;width:90%;color:#e8e8f0;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);}' +
    '.monet-icon{font-size:48px;margin-bottom:12px;}' +
    '.monet-title{font-size:22px;font-weight:800;margin-bottom:8px;color:#e8c87a;}' +
    '.monet-sub{font-size:14px;color:#9090a8;margin-bottom:20px;line-height:1.6;}' +
    '.monet-price{font-size:38px;font-weight:800;color:#5ecfb1;margin:8px 0;}' +
    '.monet-price small{font-size:16px;color:#9090a8;}' +
    '.monet-input{width:100%;background:#0d0d14;border:1px solid #2a2a38;border-radius:10px;color:#e8e8f0;font-size:15px;padding:12px 16px;text-align:center;margin-bottom:10px;outline:none;box-sizing:border-box;}' +
    '.monet-input:focus{border-color:#5ecfb1;}' +
    '.monet-btn{display:inline-block;padding:11px 24px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;border:none;margin:5px;}' +
    '.monet-btn.gold{background:#e8c87a;color:#09090f;}' +
    '.monet-btn.teal{background:rgba(94,207,177,0.1);color:#5ecfb1;border:1px solid rgba(94,207,177,0.3);}' +
    '.monet-btn.ghost{background:transparent;color:#9090a8;border:1px solid #2a2a38;}' +
    '.monet-pay-btn{display:inline-flex;align-items:center;gap:6px;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;border:none;margin:5px;}' +
    '.monet-pay-btn.wise{background:#9FE870;color:#0a2e0a;}' +
    '.monet-msg{font-size:13px;margin-top:10px;min-height:36px;line-height:1.5;}' +
    '.monet-msg.success{color:#5ecfb1;}' +
    '.monet-msg.error{color:#e87a7a;}' +
    '.monet-divider{border:none;border-top:1px solid #2a2a38;margin:18px 0;}' +
    '.monet-step{font-size:11px;color:#9090a8;margin-bottom:10px;line-height:1.6;}' +
    '.monet-step strong{color:#e8e8f0;}' +
    '</style>' +
    '<div class="monet-card">' +
    '<div class="monet-icon">' + (type === 'expire' ? '60' : type === 'rappel' ? 'ðŸ””' : 'ðŸ”’') + '</div>' +
    '<div class="monet-title">' + titre + '</div>' +
    '<div class="monet-sub">' + message + '</div>' +
    '<div class="monet-price">29â‚¬ <small>/ an</small></div>' +
    (showEmailForm ?
      '<div class="monet-step" id="email-step">' +
      '<strong>Etape 1 : Recevez votre code</strong><br>' +
      '<input type="email" id="code-email" class="monet-input" placeholder="Votre adresse email" style="margin-top:10px;">' +
      '<button class="monet-btn gold" id="send-code-btn">Envoyer le code par email</button>' +
      '</div>' +
      '<div class="monet-step" id="code-step" style="display:none;">' +
      '<strong>Etape 2 : Entrez votre code</strong><br>' +
      '<input type="text" id="activation-code" class="monet-input" placeholder="Code recu par email" maxlength="40" style="margin-top:10px;">' +
      '<button class="monet-btn teal" id="validate-code-btn">Valider le code</button>' +
      '</div>' : '') +
    '<hr class="monet-divider">' +
    '<div class="monet-step">' +
    '<strong>Vous avez deja un code ?</strong><br>' +
    '<input type="text" id="direct-code" class="monet-input" placeholder="Entrez votre code" maxlength="40" style="margin-top:10px;">' +
    '<button class="monet-btn teal" id="direct-validate-btn">Valider le code</button>' +
    '</div>' +
    '<hr class="monet-divider">' +
    '<div class="monet-step">' +
    '<strong>Paiement securise :</strong><br>' +
    '<a href="' + MONETIZATION.paymentWise + '" target="_blank" class="monet-pay-btn wise">Payer 29â‚¬ via Wise</a>' +
    '</div>' +
    (canClose ? '<button class="monet-btn ghost" id="monet-close">Continuer essai</button>' : '') +
    '<div class="monet-msg" id="monet-msg"></div>' +
    '</div>';

  document.body.appendChild(overlay);

  var msgDiv = document.getElementById('monet-msg');

  var sendBtn = document.getElementById('send-code-btn');
  if (sendBtn) {
    sendBtn.onclick = async function() {
      var email = document.getElementById('code-email').value.trim();
      if (!email || !email.includes('@')) {
        msgDiv.className = 'monet-msg error';
        msgDiv.textContent = 'Entrez une adresse email valide.';
        return;
      }
      sendBtn.disabled = true;
      msgDiv.className = 'monet-msg';
      msgDiv.textContent = 'Generation et envoi du code...';
      var code = genererCodeUnique();
      var sent = await envoyerCodeParEmail(email, code);
      if (sent) {
        localStorage.setItem(MONETIZATION.STORAGE_KEYS.pendingCode, code);
        localStorage.setItem(MONETIZATION.STORAGE_KEYS.pendingEmail, email);
        document.getElementById('email-step').style.display = 'none';
        document.getElementById('code-step').style.display = 'block';
        msgDiv.className = 'monet-msg success';
        msgDiv.innerHTML = 'Code envoye a ' + email + ' - Verifiez vos emails (spams)';
      } else {
        sendBtn.disabled = false;
        msgDiv.className = 'monet-msg error';
        msgDiv.textContent = 'Erreur envoi. Reessayez ou contactez ' + MONETIZATION.emailContact;
      }
    };
  }

  var validateBtn = document.getElementById('validate-code-btn');
  if (validateBtn) {
    validateBtn.onclick = function() {
      var code = document.getElementById('activation-code').value.trim();
      if (!code) { msgDiv.className = 'monet-msg error'; msgDiv.textContent = 'Entrez le code recu.'; return; }
      validateBtn.disabled = true;
      msgDiv.className = 'monet-msg'; msgDiv.textContent = 'Verification...';
      validerCode(code, function(result) {
        validateBtn.disabled = false;
        if (result.success) {
          msgDiv.className = 'monet-msg success'; msgDiv.textContent = result.message;
          setTimeout(function() { fermerOverlay(); window.location.reload(); }, 1500);
        } else {
          msgDiv.className = 'monet-msg error'; msgDiv.textContent = result.message;
        }
      });
    };
  }

  var directBtn = document.getElementById('direct-validate-btn');
  if (directBtn) {
    directBtn.onclick = function() {
      var code = document.getElementById('direct-code').value.trim();
      if (!code) { msgDiv.className = 'monet-msg error'; msgDiv.textContent = 'Entrez votre code.'; return; }
      directBtn.disabled = true;
      msgDiv.className = 'monet-msg'; msgDiv.textContent = 'Verification...';
      validerCode(code, function(result) {
        directBtn.disabled = false;
        if (result.success) {
          msgDiv.className = 'monet-msg success'; msgDiv.textContent = result.message;
          setTimeout(function() { fermerOverlay(); window.location.reload(); }, 1500);
        } else {
          msgDiv.className = 'monet-msg error'; msgDiv.textContent = result.message;
        }
      });
    };
  }

  var closeBtn = document.getElementById('monet-close');
  if (closeBtn) {
    closeBtn.onclick = function() {
      fermerOverlay();
      localStorage.setItem(MONETIZATION.STORAGE_KEYS.overlayDismissed, Date.now().toString());
    };
  }
}

function fermerOverlay() {
  var overlay = document.getElementById('monet-overlay');
  if (overlay) overlay.remove();
}

function afficherBlocageEssaiExpire() { creerOverlayAvecEmail('expire'); }
function afficherRappelPaiement() { creerOverlayAvecEmail('rappel', joursRestantsEssai()); }
function activerApresPaiement() { localStorage.setItem('brevet_paiement_en_attente', 'true'); }

function creerBanniereEssai() {
  if (document.getElementById('monet-banner') || aAccesPayant()) return;
  if (!estEnEssai()) return;
  var j = joursRestantsEssai();
  var banner = document.createElement('div');
  banner.id = 'monet-banner';
  banner.innerHTML = '<style>' +
    '#monet-banner{position:sticky;top:0;left:0;right:0;background:#e8c87a;color:#09090f;font-family:"DM Sans","Segoe UI",Arial,sans-serif;font-size:13px;padding:8px 20px;z-index:9998;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;}' +
    '.monet-banner-text{font-weight:600;}' +
    '.monet-banner-btn{padding:4px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:#09090f;color:#e8c87a;}' +
    '</style>' +
    '<span class="monet-banner-text">ðŸ†“ Essai gratuit - J-' + j + ' ' + (j <= 1 ? 'jour restant' : 'jours restants') + '</span>' +
    '<button class="monet-banner-btn" onclick="afficherRappelPaiement()">ðŸ’³ Debloquer (29â‚¬/an)</button>';
  document.body.insertBefore(banner, document.body.firstChild);
}

function creerBanniereExpire() {
  if (document.getElementById('monet-banner') || aAccesPayant()) return;
  var banner = document.createElement('div');
  banner.id = 'monet-banner';
  banner.innerHTML = '<style>' +
    '#monet-banner{position:sticky;top:0;left:0;right:0;background:#e87a7a;color:#fff;font-family:"DM Sans","Segoe UI",Arial,sans-serif;font-size:13px;padding:8px 20px;z-index:9998;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;}' +
    '.monet-banner-text{font-weight:600;}' +
    '.monet-banner-btn{padding:4px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:#fff;color:#e87a7a;}' +
    '</style>' +
    '<span class="monet-banner-text">âš ï¸ Essai gratuit termine - Corrections IA bloquees</span>' +
    '<button class="monet-banner-btn" onclick="afficherBlocageEssaiExpire()">ðŸ’³ Debloquer 29â‚¬/an</button>';
  document.body.insertBefore(banner, document.body.firstChild);
}

function verifierRappel() {
  if (aAccesPayant()) return;
  if (!estEnEssai()) { creerBanniereExpire(); return; }
  var lastReminder = parseInt(localStorage.getItem(MONETIZATION.STORAGE_KEYS.lastReminder) || '0');
  var heuresDepuis = (Date.now() - lastReminder) / (1000 * 60 * 60);
  var dismissed = parseInt(localStorage.getItem(MONETIZATION.STORAGE_KEYS.overlayDismissed) || '0');
  var minutesDepuisFermeture = (Date.now() - dismissed) / (1000 * 60);
  if (minutesDepuisFermeture < 60) return;
  if (heuresDepuis >= MONETIZATION.rappelHeures || !lastReminder) {
    localStorage.setItem(MONETIZATION.STORAGE_KEYS.lastReminder, Date.now().toString());
    afficherRappelPaiement();
  }
}

function verifierAccesAvantAction(actionCallback) {
  if (!aAccesComplet()) {
    if (essaiExpire()) afficherBlocageEssaiExpire();
    else afficherRappelPaiement();
    return false;
  }
  if (actionCallback && typeof actionCallback === 'function') actionCallback();
  return true;
}

function initialiserEssai() {
  if (!localStorage.getItem(MONETIZATION.STORAGE_KEYS.trialStart)) {
    localStorage.setItem(MONETIZATION.STORAGE_KEYS.trialStart, Date.now().toString());
  }
}

function initMonetization() {
  initialiserEssai();
  if (aAccesPayant()) return;
  if (estEnEssai()) {
    creerBanniereEssai();
  } else {
    creerBanniereExpire();
    setTimeout(function() { afficherBlocageEssaiExpire(); }, 500);
  }
  // Fix v4.1.1 : verifierRappel maintenant lance
  setTimeout(verifierRappel, 3000);
  setInterval(verifierRappel, 30 * 60 * 1000);
}

window.estEnEssai              = estEnEssai;
window.essaiExpire             = essaiExpire;
window.aAccesComplet           = aAccesComplet;
window.aAccesPayant            = aAccesPayant;
window.joursRestantsEssai      = joursRestantsEssai;
window.validerCode             = validerCode;
window.verifierCodeLocal       = verifierCodeLocal;
window.afficherBlocageEssaiExpire = afficherBlocageEssaiExpire;
window.afficherRappelPaiement  = afficherRappelPaiement;
window.fermerOverlay           = fermerOverlay;
window.activerApresPaiement    = activerApresPaiement;
window.verifierAccesAvantAction = verifierAccesAvantAction;
window.initMonetization        = initMonetization;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMonetization);
} else {
  initMonetization();
}
