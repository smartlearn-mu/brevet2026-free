// ============================================================
// SCRIPT GOOGLE APPS SCRIPT — Proxy DeepSeek DNB Hist-Géo-EMC
// FIX CORS + FIX getText + CACHE pour performance
// ============================================================

var PRIX_PAR_CORRECTION = 0.003;
var MARGE_EURO = 0.0002;
var SEUIL_GRATUIT = 5;

// === FONCTION PRINCIPALE ===
function doPost(e) {
  try {
    if (!e) return createResponse({ success: false, error: 'Aucune donnee recue' });

    var params;
    if (e.parameter && e.parameter.data) {
      params = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else {
      return createResponse({ success: false, error: 'Aucune donnee recue' });
    }

    var action = params.action;
    var prompt = params.prompt;
    var system = params.system;
    var userId = params.userId || 'anonymous';
    var sessionId = params.sessionId || 'unknown';
    var estPayant = params.estPayant === true;
    var joursRestants = params.joursRestantsEssai || 0;
    var source = params.source || 'sujets-histgeo.html';
    var matiere = params.matiere || 'histoire';
    var email = params.email || null;

    if (action === 'correction_ia') {

      // Compteur via CacheService (rapide) + Sheets (persistant)
      var correctionsCount = getCorrectionsCountFast(userId);
      var peutCorriger = estPayant || joursRestants > 0 || correctionsCount < SEUIL_GRATUIT;

      if (!peutCorriger) {
        return createResponse({
          success: false,
          error: 'Limite gratuite atteinte (' + SEUIL_GRATUIT + ' corrections). Passez a la version payante.',
          code: 'LIMIT_REACHED',
          correctionsCount: correctionsCount,
          seuilGratuit: SEUIL_GRATUIT
        });
      }

      var debut = Date.now();
      var result = appelerDeepSeek(prompt, system);
      var tempsExecution = (Date.now() - debut) / 1000;

      var note = extraireNote(result);

      // Sauvegarde stats en arriere-plan (non bloquant)
      sauvegarderStatistique({
        timestamp: new Date().toISOString(),
        userId: userId, action: action, matiere: matiere,
        type: 'correction_ia', estPayant: estPayant, note: note,
        correctionCoutUSD: PRIX_PAR_CORRECTION, sessionId: sessionId,
        email: email, prixPayeEUR: estPayant ? 0.50 : 0,
        profitEUR: MARGE_EURO, tempsExecution: tempsExecution,
        pays: params.pays || 'FR', source: source,
        modeleIA: 'deepseek-chat', tokensUtilises: result.length,
        joursRestantsEssai: joursRestants, success: true
      });

      incrementerCorrectionsCountFast(userId, correctionsCount);

      return createResponse({
        success: true,
        content: result,
        stats: {
          correctionsRestantes: estPayant ? 'Illimite' : Math.max(0, SEUIL_GRATUIT - correctionsCount - 1),
          estPayant: estPayant,
          joursRestantsEssai: joursRestants
        }
      });
    }

    if (action === 'valider_code') {
      return traiterValidationCode(params);
    }

    return createResponse({ success: false, error: 'Action inconnue: ' + action });

  } catch (error) {
    console.error('Erreur doPost:', error);
    return createResponse({ success: false, error: error.toString() });
  }
}

// === COMPTEURS RAPIDES (Cache + Sheets) ===
function getCorrectionsCountFast(userId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'count_' + userId;
  var cached = cache.get(cacheKey);
  if (cached !== null) return parseInt(cached, 10);

  // Cache miss → lire Sheets une seule fois
  var count = getCorrectionsCountSheets(userId);
  cache.put(cacheKey, count.toString(), 600); // cache 10 min
  return count;
}

function incrementerCorrectionsCountFast(userId, oldCount) {
  var newCount = oldCount + 1;
  // Mettre a jour le cache immediatement
  CacheService.getScriptCache().put('count_' + userId, newCount.toString(), 600);
  // Mettre a jour Sheets en arriere-plan
  incrementerCorrectionsCountSheets(userId, newCount);
}

function getCorrectionsCountSheets(userId) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Compteurs');
    if (!sheet) return 0;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === userId) return parseInt(data[i][1], 10) || 0;
    }
    return 0;
  } catch (e) { return 0; }
}

function incrementerCorrectionsCountSheets(userId, newCount) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Compteurs');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Compteurs');
      sheet.getRange(1, 1, 1, 2).setValues([['UserId', 'CorrectionsCount']]);
    }
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        sheet.getRange(i + 1, 2).setValue(newCount);
        return;
      }
    }
    sheet.appendRow([userId, newCount]);
  } catch (e) { console.error('Erreur increment Sheets:', e); }
}

// === DEEPSEEK ===
function appelerDeepSeek(prompt, system, temperature) {
  temperature = temperature || 0.7;

  var API_KEY = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (!API_KEY) throw new Error('Cle API DeepSeek manquante.');

  var systemContent = system || 'Tu es un correcteur expert du DNB en Histoire-Geographie-EMC.\nReponds UNIQUEMENT en JSON :\n{"note":"X/Y","commentaire":"...","pistes":"...","cours_su":"OK/Partiel/Non","methode":"OK/Partiel/Non"}';

  var options = {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + API_KEY,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt }
      ],
      temperature: temperature,
      max_tokens: 2000
    }),
    muteHttpExceptions: true
  };

  var response;
  try {
    response = UrlFetchApp.fetch('https://api.deepseek.com/v1/chat/completions', options);
  } catch (fetchErr) {
    throw new Error('Connexion DeepSeek echouee : ' + fetchErr.toString());
  }

  if (!response) throw new Error('Reponse undefined de DeepSeek');

  var code = response.getResponseCode();
  var rawText = response.getContentText();

  if (code !== 200) throw new Error('DeepSeek HTTP ' + code + ' : ' + rawText.substring(0, 300));

  var data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error('Reponse non-JSON : ' + rawText.substring(0, 300));
  }

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Structure inattendue : ' + JSON.stringify(data).substring(0, 300));
  }

  return data.choices[0].message.content;
}

// === STATISTIQUES (non bloquant) ===
function sauvegarderStatistique(stat) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Statistiques');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Statistiques');
      sheet.getRange(1, 1, 1, 20).setValues([[
        'Timestamp','UserId','Action','Matiere','Type','EstPayant',
        'Note','Correction_Cout_USD','SessionId','Email','PrixPayeEUR',
        'ProfitEUR','TempsExecution_s','Pays','Source','ModeleIA',
        'TokensUtilises','JoursRestantsEssai','Success','ErrorMessage'
      ]]);
    }
    sheet.appendRow([
      stat.timestamp, stat.userId, stat.action, stat.matiere, stat.type,
      stat.estPayant, stat.note || '', stat.correctionCoutUSD, stat.sessionId,
      stat.email || '', stat.prixPayeEUR, stat.profitEUR, stat.tempsExecution,
      stat.pays, stat.source, stat.modeleIA, stat.tokensUtilises,
      stat.joursRestantsEssai, stat.success, stat.errorMessage || ''
    ]);
  } catch (e) { console.error('Erreur stats:', e); }
}

// === EXTRAIRE NOTE ===
function extraireNote(reponse) {
  try {
    var patterns = [
      /"note":\s*"(\d+(?:\.\d+)?)\/(\d+)"/,
      /note:\s*(\d+(?:\.\d+)?)\/(\d+)/,
      /(\d+(?:\.\d+)?)\/(\d+)\s*points?/,
      /Note\s*:?\s*(\d+(?:\.\d+)?)\/(\d+)/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = reponse.match(patterns[i]);
      if (m) return m[1] + '/' + m[2];
    }
    return 'Non evaluee';
  } catch (e) { return 'Erreur'; }
}

// === REPONSE HTTP ===
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// === TESTS & SETUP ===
function testCorrection() {
  var result = appelerDeepSeek(
    'Question: Q1 — Relevez un extrait qui definit la gigafactory. (2 pts)\nCorrection attendue: "usines de fabrication de batteries"\nReponse eleve: Les gigafactories sont des usines qui fabriquent des batteries.'
  );
  console.log('Resultat test:', result);
  return result;
}

function verifierCleAPI() {
  var key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (key && key.startsWith('sk-')) {
    console.log('Cle API DeepSeek configuree'); return true;
  } else {
    console.log('Cle API DeepSeek NON configuree'); return false;
  }
}

function creerFeuilles() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Statistiques')) {
    var s1 = ss.insertSheet('Statistiques');
    s1.getRange(1,1,1,20).setValues([[
      'Timestamp','UserId','Action','Matiere','Type','EstPayant',
      'Note','Correction_Cout_USD','SessionId','Email','PrixPayeEUR',
      'ProfitEUR','TempsExecution_s','Pays','Source','ModeleIA',
      'TokensUtilises','JoursRestantsEssai','Success','ErrorMessage'
    ]]);
  }
  if (!ss.getSheetByName('Compteurs')) {
    var s2 = ss.insertSheet('Compteurs');
    s2.getRange(1,1,1,2).setValues([['UserId','CorrectionsCount']]);
  }
  console.log('Feuilles pretes');
}

function getStatsGlobales() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Statistiques');
    if (!sheet) return { error: 'Aucune statistique' };
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var rows = data.slice(1);
    var total = 0, payant = 0, coutUSD = 0, profitEUR = 0, users = {};
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][headers.indexOf('Action')] === 'correction_ia') {
        total++;
        if (rows[i][headers.indexOf('EstPayant')]) payant++;
        coutUSD += rows[i][headers.indexOf('Correction_Cout_USD')] || 0;
        profitEUR += rows[i][headers.indexOf('ProfitEUR')] || 0;
        users[rows[i][headers.indexOf('UserId')]] = true;
      }
    }
    return { totalCorrections: total, correctionsPayantes: payant,
      correctionsGratuites: total - payant, coutTotalUSD: coutUSD,
      profitTotalEUR: profitEUR, utilisateursUniques: Object.keys(users).length };
  } catch (e) { return { error: e.toString() }; }
}

// ============================================================
// MONETISATION — CODES D'ACCES
// ============================================================

function traiterValidationCode(params) {
  var code = (params.code || '').toString().trim();
  var userId = params.userId || 'anonymous';

  if (!code) return createResponse({ success: false, error: 'Code manquant' });

  try {
    var sheet = getOrCreateCodesSheet();
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      var codeSheet = (data[i][0] || '').toString().trim();
      if (codeSheet === code) {
        sheet.getRange(i + 1, 4).setValue(true);
        sheet.getRange(i + 1, 5).setValue(new Date().toISOString());
        sheet.getRange(i + 1, 6).setValue(userId);
        console.log('Code valide: ' + code + ' — ' + userId);
        return createResponse({ success: true, message: 'Code valide ! Acces complet debloque.', email: data[i][1] || '' });
      }
    }

    console.log('Code invalide: ' + code);
    return createResponse({ success: false, error: 'Code invalide ou deja utilise.' });

  } catch (err) {
    return createResponse({ success: false, error: 'Erreur serveur: ' + err.toString() });
  }
}

function getOrCreateCodesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Codes');
  if (!sheet) {
    sheet = ss.insertSheet('Codes');
    sheet.getRange(1, 1, 1, 7).setValues([['Code','Email','DateCreation','Utilise','DateUtilisation','UserId','Notes']]);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 220);
  }
  return sheet;
}

function generateCode() {
  // ← CHANGER L'EMAIL ICI avant d'executer
  var email = 'email@exemple.com';
  var notes = '';

  var code = _genererCode();
  getOrCreateCodesSheet().appendRow([code, email, new Date().toISOString(), false, '', '', notes]);

  console.log('=====================================');
  console.log('Email : ' + email);
  console.log('Code  : ' + code);
  console.log('=====================================');
  return { code: code, email: email };
}

function generateCodesPourListe() {
  // ← MODIFIER LA LISTE ICI
  var emails = ['eleve1@gmail.com', 'eleve2@gmail.com'];
  for (var i = 0; i < emails.length; i++) {
    var code = _genererCode();
    getOrCreateCodesSheet().appendRow([code, emails[i], new Date().toISOString(), false, '', '', '']);
    console.log(emails[i] + ' -> ' + code);
  }
}

function _genererCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function voirTousCodes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Codes');
  if (!sheet) { console.log('Aucune feuille Codes'); return; }
  var data = sheet.getDataRange().getValues();
  var actifs = 0, utilises = 0;
  console.log('=== CODES D\'ACCES ===');
  for (var i = 1; i < data.length; i++) {
    if (data[i][3]) { utilises++; console.log('UTILISE  | ' + data[i][0] + ' | ' + data[i][1]); }
    else { actifs++; console.log('ACTIF    | ' + data[i][0] + ' | ' + data[i][1]); }
  }
  console.log('Actifs: ' + actifs + ' | Utilises: ' + utilises);
}

// === DOGET — pour le deploiement Web App ===
function doGet(e) {
  return createResponse({
    status: 'active',
    message: 'Proxy DeepSeek DNB Hist-Geo-EMC',
    version: '2.0',
    timestamp: new Date().toISOString()
  });
}

// === TEST DIAGNOSTIC ===
function testDiagnostic() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Codes');
  if (!sheet) { console.log('ERREUR: feuille Codes absente'); return; }
  var data = sheet.getDataRange().getValues();
  console.log('Nb lignes: ' + data.length);
  for (var i = 0; i < data.length; i++) {
    console.log('Ligne ' + i + ': ' + JSON.stringify(data[i]));
  }
  var codeTest = 'Entrepotes974NawalWassil';
  for (var j = 1; j < data.length; j++) {
    var codeSheet = (data[j][0] || '').toString().trim();
    console.log('[' + codeSheet + '] === [' + codeTest + '] : ' + (codeSheet === codeTest));
  }
}
