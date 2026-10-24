/**
 * 部品：集計。今日・今週・合計の件数と、見出しごと（種別・担当者など）の件数。
 * 実際のシートで日付が日付型に変わっていても数えられる（cellYmd_）。
 * 使う設定：APP_CONFIG.ledgerHeader（intake を使わないとき）/ sheets.ledger / sheets.summary / receipt.timeLabel / summary
 *   summary: { weekStart: 1, labels: {today, week, total}, groupBy: [{ column: '種別', key: 'byKind', prefix: '種別：', fixed: [選択肢], time: 時刻の列なら true }] }
 */
/** 時刻を 'HH:mm' で読む。実際のシートで時刻型（Date）や数値（1日=1）に変わっていても、'9:00'・'10:00:00' のような文字でも同じ形にそろえる */
function cellHm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  if (typeof v === 'number' && v >= 0 && v < 1) { var m = Math.round(v * 1440); return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
  var t = String(v).normalize('NFKC').trim().match(/^(\d{1,2}):(\d{2})/);
  return t ? ('0' + t[1]).slice(-2) + ':' + t[2] : String(v);
}
/** 台帳の見出し：APP_CONFIG.ledgerHeader があればそれ、なければ intake 部品の見出し */
function summaryHeader_() { return APP_CONFIG.ledgerHeader || intakeHeader_(); }

function summaryBuild_() {
  var c = APP_CONFIG, header = summaryHeader_();
  var sh = getOrCreateSheet_(c.sheets.ledger, header);
  var rows = readRows_(sh, header.length);
  var today = todayStr_(), week = weekStartStr_();
  var timeIdx = header.indexOf(c.receipt.timeLabel);
  var s = { today: 0, week: 0, total: rows.length };
  var groups = (c.summary.groupBy || []).map(function (g) {
    var idx = header.indexOf(g.column);
    if (idx === -1) throw new Error('集計の見出しが台帳にありません: ' + g.column);
    s[g.key] = {};
    (g.fixed || []).forEach(function (k) { s[g.key][k] = 0; });
    return { g: g, idx: idx };
  });
  rows.forEach(function (r) {
    var d = cellYmd_(r[timeIdx]);
    if (d === today) s.today++;
    if (d >= week && d <= today) s.week++;
    groups.forEach(function (x) {
      var k = x.g.time ? cellHm_(r[x.idx]) : String(r[x.idx]);
      if (x.g.fixed && x.g.fixed.indexOf(k) === -1) return; // 決まった選択肢以外は数えない
      s[x.g.key][k] = (s[x.g.key][k] || 0) + 1;
    });
  });
  return s;
}

/** 集計シートに書く。s を渡さなければ summaryBuild_ で作る */
function summaryWriteSheet_(s) {
  var c = APP_CONFIG, L = c.summary.labels;
  s = s || summaryBuild_();
  var sh = getOrCreateSheet_(c.sheets.summary, null);
  sh.clearContents();
  var values = [['項目', '件数'], [L.today, s.today], [L.week, s.week], [L.total, s.total]];
  (c.summary.groupBy || []).forEach(function (g) {
    Object.keys(s[g.key]).forEach(function (k) { values.push([g.prefix + k, s[g.key][k]]); });
  });
  sh.getRange(1, 1, values.length, 2).setValues(values);
  return s;
}
