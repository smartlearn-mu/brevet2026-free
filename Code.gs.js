// ============================================================
// SMART LEARN — Proxy DeepSeek + Monétisation complète
// Version 5.0 — clé sécurisée · valider_code · email · stats
// ============================================================

var COUT_PAR_CORRECTION_USD = 0.001;
var PRIX_ABONNEMENT_EUR     = 29.0;
var PRIX_ABONNEMENT_MU      = 999;
var TAUX_EUR_USD            = 1.08;

// ============================================================
// GET — test de vie
// ============================================================

function doGet() {
  return createCORSResponse({
    status:    'active',
    message:   'Proxy DeepSeek + Monetisation — SMART LEARN v5.0',
    timestamp: new Date().toISOString()
  });
}

// ============================================================
// POST — point d'entrée principal
// ============================================================

function doPost(e) {
  try {
    var data;
    if (e.parameter && e.parameter.data) {
      data = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return createCORSResponse({ success: false, error: 'Pas de donnees' });
    }

    if (!data.action) {
      return createCORSResponse({ success: false, error: 'Champ action requis' });
    }

    var action    = data.action    || '';
    var userId    = data.userId    || 'anonymous';
    var sessionId = data.sessionId || 'unknown';
    var estPayant = data.estPayant === true;
    var matiere   = data.matiere   || '';
    var source    = data.source    || '';
    var jours     = data.joursRestants || data.joursRestantsEssai || 0;

    // ── Correction IA ───────────────────────────────────────
    if (action === 'correction_ia') {
      if (!data.prompt || !data.system) {
        return createCORSResponse({ success: false, error: 'prompt et system requis' });
      }
      var result = appelerDeepSeek(data.prompt, data.system);
      var note   = extraireNote(result);

      logStat(userId, sessionId, action, matiere, data.type || '',
              estPayant, note, COUT_PAR_CORRECTION_USD, data.email || '',
              data.prixPayeEUR || null, jours, data.pays || '', source);

      return createCORSResponse({ success: true, content: result });
    }

    // ── Validation code ─────────────────────────────────────
    if (action === 'valider_code') {
      return traiterValidationCode(data);
    }

    // ── Envoi code par email ─────────────────────────────────
    if (action === 'generer_code_email') {
      return traiterEnvoiEmail(data);
    }

    // ── Stats (page_view, trial_start) ──────────────────────
    if (action === 'page_view' || action === 'trial_start') {
      logStat(userId, sessionId, action, matiere, '', false, '',
              null, '', null, jours, data.pays || '', source);
      return createCORSResponse({ success: true });
    }

    return createCORSResponse({ success: true, message: 'OK' });

  } catch(err) {
    console.error('doPost:', err);
    return createCORSResponse({ success: false, error: err.toString() });
  }
}

// ============================================================
// DEEPSEEK — clé dans PropertiesService
// ============================================================

function appelerDeepSeek(prompt, system, temperature) {
  temperature = temperature || 0.3;

  // Clé sécurisée — à configurer dans Paramètres > Propriétés de script
  var key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (!key) throw new Error('DEEPSEEK_API_KEY manquante dans les proprietes du script');

  var opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    payload: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt }
      ],
      temperature: temperature,
      max_tokens: 2048
    }),
    muteHttpExceptions: true
  };

  var res  = UrlFetchApp.fetch('https://api.deepseek.com/v1/chat/completions', opts);
  var code = res.getResponseCode();
  var body = JSON.parse(res.getContentText());

  if (code !== 200) {
    var msg = body.error ? (body.error.message || JSON.stringify(body.error)) : 'HTTP ' + code;
    throw new Error('DeepSeek: ' + msg);
  }

  if (!body.choices || !body.choices[0] || !body.choices[0].message) {
    throw new Error('Reponse DeepSeek inattendue');
  }

  return body.choices[0].message.content;
}

// ============================================================
// VALIDATION CODE
// ============================================================

function traiterValidationCode(data) {
  var code   = (data.code || '').toString().trim();
  var userId = data.userId || 'anonymous';

  if (!code) return createCORSResponse({ success: false, error: 'Code manquant' });

  try {
    var sheet = getCodesSheet();
    var rows  = sheet.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').toString().trim() === code) {
        // Marquer utilisé
        sheet.getRange(i+1, 4).setValue(true);
        sheet.getRange(i+1, 5).setValue(new Date().toISOString());
        sheet.getRange(i+1, 6).setValue(userId);

        // Logger dans stats
        logStat(userId, data.sessionId || '', 'code_active', '', '',
                true, '', null, rows[i][1] || '', PRIX_ABONNEMENT_EUR,
                0, '', data.source || '');

        return createCORSResponse({ success: true, message: 'Code valide ! Acces debloque.' });
      }
    }

    return createCORSResponse({ success: false, error: 'Code invalide.' });

  } catch(err) {
    return createCORSResponse({ success: false, error: err.toString() });
  }
}

// ============================================================
// ENVOI CODE PAR EMAIL
// ============================================================

function traiterEnvoiEmail(data) {
  var email = data.email || '';
  var code  = data.code  || '';

  if (!email || !code) {
    return createCORSResponse({ success: false, error: 'Email ou code manquant' });
  }

  try {
    MailApp.sendEmail({
      to:      email,
      subject: 'Votre code Hub Brevet 2026 — Smart Learn',
      body:    'Bonjour,\n\n' +
               'Votre code d\'activation Hub Brevet 2026 :\n\n' +
               '    ' + code + '\n\n' +
               'Entrez ce code sur la page Hub Brevet pour debloquer votre acces.\n' +
               'Valable 24h.\n\n' +
               'Pour toute question : smartlearn.mu@gmail.com\n\n' +
               '— Smart Learn'
    });

    // Enregistrer dans la feuille Codes
    getCodesSheet().appendRow([
      code, email, new Date().toISOString(), false, '', '', 'auto-email'
    ]);

    // Logger dans stats
    logStat(data.userId || '', data.sessionId || '', 'code_email', '', '',
            false, '', null, email, null, 0, '', data.source || '');

    return createCORSResponse({ success: true, message: 'Code envoye a ' + email });

  } catch(err) {
    console.error('Erreur email:', err);
    return createCORSResponse({ success: false, error: err.toString() });
  }
}

// ============================================================
// FEUILLE STATISTIQUES — colonnes existantes conservées
// ============================================================

function logStat(userId, sessionId, action, matiere, type, estPayant,
                 note, coutUSD, email, prixPayeEUR, jours, pays, source) {
  try {
    var sheet = getOrCreateSheet();
    sheet.appendRow([
      new Date(),          // Timestamp
      userId,              // UserId
      action,              // Action
      matiere,             // Matiere
      type,                // Type
      estPayant,           // EstPayant
      note   || '',        // Note
      coutUSD || null,     // Correction_Cout_USD
      sessionId,           // SessionId
      email  || '',        // Email
      prixPayeEUR || null, // PrixPayeEUR
      null,                // ProfitEUR
      null,                // CumulCoutUser
      null,                // CumulCorrectionsUser
      jours  || '',        // JoursRestantsEssai
      pays   || '',        // Pays
      source || '',        // Source
      'deepseek'           // ModeleIA
    ]);
  } catch(e) {
    console.warn('Erreur tracking:', e);
  }
}

function getOrCreateSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Statistiques');
  if (!sheet) {
    sheet = ss.insertSheet('Statistiques');
    initSheet(sheet);
  }
  return sheet;
}

function initSheet(sheet) {
  var headers = [
    'Timestamp','UserId','Action','Matiere','Type',
    'EstPayant','Note','Correction_Cout_USD','SessionId','Email',
    'PrixPayeEUR','ProfitEUR','CumulCoutUser','CumulCorrectionsUser',
    'JoursRestantsEssai','Pays','Source','ModeleIA'
  ];
  sheet.getRange(1,1,1,headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#f5a623').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

// ============================================================
// FEUILLE CODES
// ============================================================

function getCodesSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Codes');
  if (!sheet) {
    sheet = ss.insertSheet('Codes');
    var h = ['Code','Contact','DateCreation','Utilise','DateUtilisation','UserId','Notes'];
    sheet.getRange(1,1,1,h.length).setValues([h])
         .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sheet.setColumnWidth(1,180); sheet.setColumnWidth(2,220);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ============================================================
// CORS
// ============================================================

function createCORSResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// UTILITAIRES
// ============================================================

function extraireNote(txt) {
  try {
    var m = txt.match(/"note"\s*:\s*(\d+(?:\.\d+)?)/);
    if (m) return m[1];
    m = txt.match(/(\d+(?:\.\d+)?)\/(\d+)/);
    if (m) return m[1] + '/' + m[2];
    return '';
  } catch(e) { return ''; }
}

// ============================================================
// ADMIN
// ============================================================

function generateCode() {
  // Modifier avant d'exécuter :
  var contact = '+230XXXXXXXX';  // email ou WhatsApp du client
  var notes   = '';

  var code = genCode();
  getCodesSheet().appendRow([code, contact, new Date().toISOString(), false, '', '', notes]);

  console.log('Contact : ' + contact);
  console.log('Code    : ' + code);
  return { code: code, contact: contact };
}

function genCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var c = '';
  for (var i = 0; i < 8; i++) c += chars.charAt(Math.floor(Math.random() * chars.length));
  return c;
}

function voirCodes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Codes');
  if (!sheet) { console.log('Pas de feuille Codes'); return; }
  var data = sheet.getDataRange().getValues();
  var actifs = 0, utilises = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][3]) { utilises++; console.log('UTILISE | ' + data[i][0] + ' | ' + data[i][1]); }
    else            { actifs++;   console.log('ACTIF   | ' + data[i][0] + ' | ' + data[i][1]); }
  }
  console.log('Actifs: ' + actifs + ' | Utilises: ' + utilises);
}

function creerFeuilles() {
  getOrCreateSheet();
  getCodesSheet();
  console.log('Feuilles creees : Statistiques + Codes');
  console.log('Ajoute maintenant le code maitre dans la feuille Codes.');
}

function verifierCleAPI() {
  var key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (key && key.startsWith('sk-')) { console.log('Cle DeepSeek OK'); return true; }
  console.log('Cle DeepSeek MANQUANTE — va dans Parametres > Proprietes de script');
  return false;
}
