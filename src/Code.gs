/**
 * 予約・申込の通知メールを台帳に集約するデモ（架空の料理教室）。
 * 通知メール、予約台帳（同じメールは二度入れない）、 キャンセルは灰色に、枠別一覧（残り人数）、 集計。
 * 失敗したときの通知は「エラー通知ログ」に記録するだけで、送らない（notify 部品の送信は空のまま）。
 * Gmail は高度なサービス（Gmail API）で読み取りだけ。Gmail の標準サービスは全権限（mail.google.com）が要るので使わない。ラベル付けもしない。取り込み済みかどうかは dedupe 部品（「取込済み」シートのメールID）で判定する。
 * 使う部品：gas_parts の common / dedupe / summary / notify。
 */

function importMails() {
  var c = APP_CONFIG;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, code: 'BUSY' };
  try {
    return importMailsLocked_();
  } catch (err) {
    alertRecord_({ 件名: '（取り込み全体）', エラー: String(err && err.message || err).slice(0, 200), 受信日時: dateTimeStr_(now_()) });
    return { ok: false, code: 'ERROR' };
  } finally {
    lock.releaseLock();
  }
}

function importMailsLocked_() {
  var c = APP_CONFIG, H = c.ledgerHeader, S = c.statuses;
  var ledger = getOrCreateSheet_(c.sheets.ledger, H);
  var dd = dedupeOpen_();
  var rows = readRows_(ledger, H.length);
  var byNo = {};
  rows.forEach(function (r, i) { byNo[String(r[0])] = i + 2; });

  var res = { ok: true, added: 0, cancelled: 0, skipped: 0, errors: 0 };
  var msgs = fetchMails_(c.mail.query, c.mail.maxMessages, dd);
  res.skipped += msgs.skipped || 0;
  msgs.sort(function (a, b) { return a.dateMs - b.dateMs; }); // 古い順（予約、キャンセルの順を守る）

  try {
  msgs.forEach(function (m) {
    var id = m.id;
    if (dd.has(id)) { res.skipped++; return; }
    var received = dateTimeStr_(new Date(m.dateMs));
    var result;
    try {
      var p = parseBookingMail_(m.subject, m.body);
      if (p.type === 'booking') {
        if (byNo[p.no]) result = '重複（同じ予約番号）';
        else {
          var rowNo = ledger.getLastRow() + 1, row = [p.no, S.booked, p.date, p.time, p.name, p.menu, String(p.people), received, id].map(safeCell_);
          // 書く行を先に書式なしテキストにする（時刻・日時が時刻型に変わって '9:11:06' のように見えたり、集計で数えられなくなったりしないように）
          ledger.getRange(rowNo, 1, 1, row.length).setNumberFormat('@').setValues([row]);
          byNo[p.no] = rowNo;
          res.added++;
          result = '追加';
        }
      } else {
        var rowNo = byNo[p.no];
        if (!rowNo) throw new Error('キャンセルの元になる予約が台帳にありません：' + p.no);
        ledger.getRange(rowNo, 2, 1, 1).setValues([[S.cancelled]]);
        ledger.getRange(rowNo, 1, 1, H.length).setBackground(c.cancelColor);
        res.cancelled++;
        result = 'キャンセル反映';
      }
    } catch (err) {
      res.errors++;
      result = 'エラー';
      alertRecord_({ 件名: String(m.subject).slice(0, 60), エラー: String(err.message).slice(0, 200), 受信日時: received });
    }
    dd.mark(id, result);
  });
  } finally {
    dd.flush(); // 途中で止まっても、処理した分は記録する
  }

  writeSlotSheet_();
  summaryWriteSheet_();
  return res;
}

/**
 * 条件に合うメールを読む（Gmail API：users.messages.list / get。gmail.readonly だけで動く）。
 * 戻り値：[{ id, subject, body, dateMs }]。本文は text/plain を優先し、無ければ text/html からタグを除く。
 */
function fetchMails_(query, max, dd) {
  var ids = [], skipped = 0, token = null;
  do { // 一覧（idだけ）は全部たどる。新しい順に返るので、取込済みを除いて古い順に max 件だけ本文を読む
    var page = Gmail.Users.Messages.list('me', { q: query, maxResults: 500, pageToken: token || undefined });
    (page.messages || []).forEach(function (x) { if (dd && dd.has(x.id)) skipped++; else ids.push(String(x.id)); });
    token = page.nextPageToken;
  } while (token);
  var out = ids.reverse().slice(0, max).map(function (id) {
    var m = Gmail.Users.Messages.get('me', id, { format: 'full' });
    return { id: String(m.id), subject: mailHeader_(m.payload, 'Subject'), body: mailBody_(m.payload), dateMs: Number(m.internalDate) };
  });
  out.skipped = skipped; // 取込済みで読まなかった件数（結果の skipped に足す）
  return out;
}

function mailHeader_(payload, name) {
  var h = (payload.headers || []).filter(function (x) { return String(x.name).toLowerCase() === name.toLowerCase(); })[0];
  return h ? String(h.value) : '';
}

function mailBody_(payload) {
  var plain = findPart_(payload, 'text/plain');
  if (plain) return decodeB64_(plain.body.data);
  var html = findPart_(payload, 'text/html');
  if (!html) return '';
  return decodeB64_(html.body.data).replace(/<br\s*\/?>|<\/(p|div|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function findPart_(p, mime) {
  if (!p) return null;
  if (p.mimeType === mime && p.body && p.body.data) return p;
  for (var i = 0; p.parts && i < p.parts.length; i++) { var f = findPart_(p.parts[i], mime); if (f) return f; }
  return null;
}

function decodeB64_(data) {
  // Apps Script の高度なサービスは bytes 型の項目をバイト列（数の配列）で返すことがある。そのときはそのまま文字にする
  if (Array.isArray(data)) return Utilities.newBlob(data).getDataAsString('UTF-8');
  var d = String(data || '');
  while (d.length % 4) d += '='; // 末尾の = が省かれていても読めるように
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(d)).getDataAsString('UTF-8');
}

/**
 * 試験用：架空の予約メールの件名と本文を、今日から先の日付で実行ログに出す（送らない）。
 * 出た文面を Gmail の「作成」に貼り、宛先を自分にして手で送る。
 */
function demoMailTexts() {
  var t = todayStr_(), base = dayNumber_(t), d1 = ymdFromDayNumber_(base + 1), d2 = ymdFromDayNumber_(base + 2);
  var list = [
    ['【予約受付】パン基礎 ' + d1 + ' 10:00', ['予約番号：R-1001', 'お名前：山田花子（架空）', '日付：' + d1, '時間：10:00', 'コース：パン基礎', '人数：2名']],
    ['【予約受付】和食の基本 ' + d1 + ' 13:00', ['予約番号：R-1002', 'お名前：田中一郎（架空）', '日付：' + d1, '時間：13:00', 'コース：和食の基本', '人数：3名']],
    ['【予約受付】お菓子入門 ' + d2 + ' 18:00', ['予約番号：R-1003', 'お名前：中村さくら（架空）', '日付：' + d2, '時間：18:00', 'コース：お菓子入門', '人数：4名']],
    ['【予約受付】和食の基本 ' + d1 + ' 13:00（再送）', ['予約番号：R-1002', 'お名前：田中一郎（架空）', '日付：' + d1, '時間：13:00', 'コース：和食の基本', '人数：3名']],
    ['【キャンセル受付】予約番号 R-1003', ['予約番号：R-1003']],
    ['【予約受付】お菓子入門 ' + d2 + ' 15:00', ['予約番号：R-1004', 'お名前：森あおい（架空）', '日付：' + d2, '時間：15:00', 'コース：お菓子入門', '人数：1名']]
  ];
  var text = list.map(function (x, i) { return '--- ' + (i + 1) + '通目 ---\n件名：' + x[0] + '\n本文：\n' + x[1].join('\n'); }).join('\n\n');
  console.log(text);
  return text;
}

/** 失敗の通知：文面を作ってエラー通知ログに記録するだけ（送らない） */
function alertRecord_(info) {
  var o = { 予約番号: '-', 宛先: APP_CONFIG.notify.to };
  Object.keys(info).forEach(function (k) { o[k] = info[k]; });
  return notifyRecord_(o);
}

/** 枠別一覧：今日から daysAhead 日分 × 時間帯ごとの予約人数と残り */
function buildSlots_() {
  var c = APP_CONFIG, H = c.ledgerHeader;
  var rows = readRows_(getOrCreateSheet_(c.sheets.ledger, H), H.length);
  var count = {};
  rows.forEach(function (r) {
    if (String(r[1]) !== c.statuses.booked) return;
    var k = cellYmd_(r[2]) + ' ' + slotTime_(r[3]);
    count[k] = (count[k] || 0) + Number(r[6]);
  });
  var out = [], base = dayNumber_(todayStr_());
  for (var d = 0; d <= c.slots.daysAhead; d++) {
    var day = ymdFromDayNumber_(base + d);
    c.slots.times.forEach(function (t) {
      var n = count[day + ' ' + t] || 0, left = c.slots.capacity - n;
      var state = left < 0 ? '定員超過' : left === 0 ? '満席' : left <= c.slots.fewLeft ? '残りわずか' : '空きあり';
      out.push([day, t, n, Math.max(left, 0), state]);
    });
  }
  return out;
}

/** 実際のシートで時刻が日付型や数値に変わっていても 'HH:mm' で読む */
function slotTime_(v) { return cellHm_(v); }

function writeSlotSheet_() {
  var c = APP_CONFIG;
  var values = [['日付', '時間帯', '予約人数', '残り', '状況']].concat(buildSlots_());
  var sh = getOrCreateSheet_(c.sheets.slots, null);
  sh.clearContents();
  setTextFormat_(sh, 2); // 日付・時間帯の列は文字のまま（日付型・時刻型に変えない）
  sh.getRange(1, 1, values.length, 5).setValues(values);
  return values;
}

/** 初回だけ手で実行：10分ごとの取り込みトリガーを1本だけ作る */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importMails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('importMails').timeBased().everyMinutes(APP_CONFIG.trigger.everyMinutes).create();
}

/** 試験の終わりに手で実行：このデモが作ったトリガー（importMails）を全部消す */
function stopTriggers() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importMails') { ScriptApp.deleteTrigger(t); n++; }
  });
  console.log('消したトリガー：' + n + '本');
  return n;
}

/** デモを初めの状態に戻す（台帳・取込済み・エラー通知ログを見出しだけに） */
function resetDemo() {
  var c = APP_CONFIG;
  dedupeReset_();
  [[c.sheets.ledger, c.ledgerHeader]].forEach(function (x) {
    var sh = getOrCreateSheet_(x[0], x[1]);
    sh.clearContents();
    sh.getRange(1, 1, sh.getMaxRows(), x[1].length).setBackground(null);
    setTextFormat_(sh, x[1].length);
    sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]);
  });
  notifyResetLog_();
  writeSlotSheet_();
  summaryWriteSheet_();
}
