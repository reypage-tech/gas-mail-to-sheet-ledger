// node test/run.js : モック上で src/*.gs を動かして確かめる。実際のApps Script・Gmailでは実行していない。
var fs = require('fs'), path = require('path'), vm = require('vm');
var mock = require('./mock_apis.js');
var fx = require('./fixtures.js');
var B = path.join(__dirname, '..', 'src');
var FILES = ['Common.gs', 'Dedupe.gs', 'Config.gs', 'Summary.gs', 'Notify.gs', 'MailParse.gs', 'Code.gs'];
var res = [];
function ok(name, cond, detail) { res.push(!!cond); console.log((cond ? '[OK] ' : '[NG] ') + name + (cond || !detail ? '' : ' - ' + detail)); }
function env(mails, nowMs) {
  var b = mock.buildMockGlobals({ nowMs: nowMs || fx.T0, gmail: (mails || fx.MAILS).slice() });
  var ctx = vm.createContext(b.globals);
  FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(B, f), 'utf8'), ctx, { filename: f }); });
  return { ctx: ctx, w: b.world };
}
function rows(e, name) { var s = e.w.sheets[name]; return s ? s.__rows().slice(1).filter(function (r) { return r.length && r[0] !== ''; }) : []; }
function find(e, no) { return rows(e, '予約台帳').filter(function (r) { return r[0] === no; })[0]; }

(function () {
  var e = env(); var r = e.ctx.importMails();
  ok('M01 取り込み結果：追加6・キャンセル1・エラー2・重複は追加しない', r.ok && r.added === 6 && r.cancelled === 1 && r.errors === 2, JSON.stringify(r));
  ok('M02 台帳の見出し', e.w.sheets['予約台帳'].__rows()[0].join() === '予約番号,状態,日付,時間帯,お名前,コース,人数,受信日時,メールID');
  ok('M03 台帳は6行（同じ予約番号の再送は1行のまま）', rows(e, '予約台帳').length === 6);
  ok('M04 取込済みに10通すべて記録', rows(e, '取込済み').length === 10);
  ok('M05 再送メールは「重複（同じ予約番号）」', rows(e, '取込済み').filter(function (x) { return x[0] === 'm05'; })[0][2] === '重複（同じ予約番号）');
  var r2 = e.ctx.importMails();
  ok('M06 2回目の実行は何も追加しない（同じメールは二度入れない）', r2.added === 0 && r2.cancelled === 0 && r2.errors === 0 && r2.skipped === 10 && rows(e, '予約台帳').length === 6, JSON.stringify(r2));
  ok('M07 2回目でエラー通知が増えない', rows(e, 'エラー通知ログ').length === 2);
  var c = find(e, 'R-1004');
  ok('M08 キャンセルは状態が「キャンセル」', c[1] === 'キャンセル');
  var idx = rows(e, '予約台帳').map(function (x) { return x[0]; }).indexOf('R-1004') + 2;
  ok('M09 キャンセルの行は灰色', e.w.sheets['予約台帳'].__bg(idx) === '#d9d9d9');
  ok('M10 他の行は灰色にならない', e.w.sheets['予約台帳'].__bg(2) === null);
  ok('M11 半角カナの名前を全角にそろえる', find(e, 'R-1003')[4] === 'ササキ\u3000ミキ（架空）', find(e, 'R-1003')[4]);
  ok('M12 日付の / を - にそろえる', find(e, 'R-1003')[2] === '2026-10-27');
  ok('M13 = で始まる名前は数式にならない', /^＝/.test(find(e, 'R-1007')[4]) && find(e, 'R-1007')[4] !== '#FORMULA', find(e, 'R-1007')[4]);
  var log = rows(e, 'エラー通知ログ');
  ok('M14 枠にない時間はエラー通知ログへ', log.some(function (x) { return /時間帯が枠にありません：15:00/.test(x[3]); }));
  ok('M15 元の予約が無いキャンセルはエラー通知ログへ', log.some(function (x) { return /R-9999/.test(x[3]); }));
  ok('M16 エラー通知の宛先は管理者（架空）', log.every(function (x) { return x[2] === '管理者（架空）'; }));
  var slots = rows(e, '枠別一覧');
  function slot(d, t) { return slots.filter(function (x) { return x[0] === d && x[1] === t; })[0]; }
  ok('M17 枠別一覧：10/27 10:00 は 6人・満席', slot('2026-10-27', '10:00').join() === '2026-10-27,10:00,6,0,満席', String(slot('2026-10-27', '10:00')));
  ok('M18 枠別一覧：10/27 13:00 は 1人・残り5', slot('2026-10-27', '13:00').join() === '2026-10-27,13:00,1,5,空きあり');
  ok('M19 枠別一覧：キャンセル分は数えない（10/28 18:00 は 0人）', slot('2026-10-28', '18:00')[2] === 0);
  ok('M20 枠別一覧：今日から8日×3枠', slots.length === 24 && slots[0][0] === '2026-10-26');
  var sum = rows(e, '集計').map(function (x) { return x.join(':'); }).join('/');
  ok('M21 集計：状態・時間帯ごと', /状態：予約:5/.test(sum) && /状態：キャンセル:1/.test(sum) && /時間帯：10:00:3/.test(sum), sum);
  ok('M22 ロックを解放している', e.w.lockHeld === false);
  ok('M23 Gmailの検索条件は設定どおり', e.w.searches[0] === 'label:yoyaku-demo newer_than:30d');
})();

(function () {
  var e = env([fx.booking('a1', 3, 'R-2001', 'あ（架空）', '2026-10-27', '10:00', 'パン基礎', 5)]);
  e.ctx.importMails();
  e.w.mails.push(fx.booking('a2', 1, 'R-2002', 'い（架空）', '2026-10-27', '10:00', 'パン基礎', 2));
  var r = e.ctx.importMails();
  var s = rows(e, '枠別一覧').filter(function (x) { return x[0] === '2026-10-27' && x[1] === '10:00'; })[0];
  ok('O01 新しいメールだけ追加される', r.added === 1 && r.skipped === 1);
  ok('O02 定員を超えたら「定員超過」と表示（台帳には入れる）', s[4] === '定員超過' && s[3] === 0, String(s));
  var e2 = env([fx.booking('b1', 3, 'R-3001', 'う（架空）', '2026-10-27', '13:00', 'パン基礎', 5)]);
  e2.ctx.importMails();
  ok('O03 残り1人は「残りわずか」', rows(e2, '枠別一覧').filter(function (x) { return x[0] === '2026-10-27' && x[1] === '13:00'; })[0][4] === '残りわずか');
  var e3 = env(); e3.w.gmailFail = true;
  var r3 = e3.ctx.importMails();
  ok('O04 Gmailの読み取りに失敗したら ERROR を返しエラー通知ログへ', r3.ok === false && r3.code === 'ERROR' && rows(e3, 'エラー通知ログ').length === 1 && e3.w.lockHeld === false);
  var e4 = env(); e4.w.lockBusy = true;
  ok('O05 実行が重なったら BUSY（何もしない）', e4.ctx.importMails().code === 'BUSY' && rows(e4, '予約台帳').length === 0);
  var e5 = env(); e5.ctx.importMails();
  e5.ctx.resetDemo();
  ok('O06 resetDemo で見出しだけに戻り、灰色も消える', rows(e5, '予約台帳').length === 0 && rows(e5, '取込済み').length === 0 && rows(e5, 'エラー通知ログ').length === 0 && e5.w.sheets['予約台帳'].__bg(5) === null);
  e5.ctx.setupTriggers(); e5.ctx.setupTriggers();
  ok('O07 トリガーは10分ごと・1本だけ', e5.w.triggers.length === 1 && e5.w.triggers[0].spec.everyMinutes === 10 && e5.w.triggers[0].spec.fn === 'importMails');
  var e6 = env([]); e6.ctx.importMails();
  ok('O08 メールが0通でも枠別一覧と集計を作る', rows(e6, '枠別一覧').length === 24 && rows(e6, '集計').length >= 3);
})();

(function () {
  var e = env([]);
  function p(s, b) { try { return e.ctx.parseBookingMail_(s, b); } catch (err) { return err.message; } }
  ok('P01 全角数字・全角コロンの本文も読める', p('【予約受付】', '予約番号：Ｒ－１０２３\nお名前：あ（架空）\n日付：２０２６年\n').indexOf('日付') !== -1);
  ok('P02 件名が違うメールはエラー', /件名/.test(p('ご案内', '予約番号：R-1')));
  ok('P03 人数が定員より多いとエラー', /人数/.test(p('【予約受付】', '予約番号：R-1000\nお名前：あ\n日付：2026-10-27\n時間：10:00\nコース：パン基礎\n人数：9名')));
  ok('P04 9:00 のような1桁の時刻も 09:00 にそろえて照合', /09:00/.test(p('【予約受付】', '予約番号：R-1000\nお名前：あ\n日付：2026-10-27\n時間：9:00\nコース：パン基礎\n人数：1名')));
  ok('P05 一覧にないコースはエラー', /コース/.test(p('【予約受付】', '予約番号：R-1000\nお名前：あ\n日付：2026-10-27\n時間：10:00\nコース：謎\n人数：1名')));
  ok('P06 正しい本文は全項目を返す', JSON.stringify(p('【予約受付】', '予約番号：R-1000\nお名前：あ\n日付：2026/1/5\n時間：13:00\nコース：和食の基本\n人数：２名')) === JSON.stringify({ type: 'booking', no: 'R-1000', date: '2026-01-05', time: '13:00', people: 2, name: 'あ', menu: '和食の基本' }));
})();

(function () {
  var code = FILES.map(function (f) { return fs.readFileSync(path.join(B, f), 'utf8'); }).join('\n');
  ok('X01 送信系（MailApp・GmailApp・UrlFetchApp）を使っていない', !/\bMailApp\b|\bGmailApp\b|\.sendEmail\b|\.reply\b|createDraft|UrlFetchApp|\bforward\b/.test(code));
  ok('X02 Gmail はラベル付け・削除・既読化もしない', !/addLabel|moveToTrash|markRead|createLabel/.test(code));
  var man = JSON.parse(fs.readFileSync(path.join(B, 'appsscript.json'), 'utf8'));
  ok('X03 権限は シート（このファイル）・Gmail読み取り・トリガー の3つ', man.oauthScopes.length === 3 && man.oauthScopes.some(function (s) { return /gmail\.readonly$/.test(s); }) && !man.oauthScopes.some(function (s) { return /gmail\.(send|modify|compose)|mail\.google\.com/.test(s); }));
  ok('X05 架空の表示（送信元は example ドメイン）', fx.MAILS.every(function (m) { return /\.example$/.test(m.from); }));
})();

(function () {
  // 実物の Gmail API に近い形：本文が HTML だけのメール、ページ送り、試験用文面の取り込み
  var html = fx.booking('h01', 3, 'R-2001', '高橋ゆか（架空）', '2026-10-27', '18:00', 'パン基礎', 1);
  html.html = '<div>予約番号：R-2001</div><div>お名前：高橋ゆか（架空）</div><div>日付：2026-10-27</div><div>時間：18:00</div><div>コース：パン基礎</div><div>人数：1名<br></div>';
  var e = env([html]); var r = e.ctx.importMails();
  ok('G01 本文が HTML だけのメールも読める', r.added === 1 && find(e, 'R-2001')[4] === '高橋ゆか（架空）', JSON.stringify(r));
  var many = []; for (var i = 0; i < 130; i++) many.push(fx.booking('p' + i, 1, 'R-' + (3000 + i), '架空' + i, '2026-10-27', '10:00', 'パン基礎', 1)); many.forEach(function (m, i) { m.dateMs = fx.T0 - (200 - i) * 60000; });
  var e2 = env(many); var r2 = e2.ctx.importMails();
  ok('G02 1回で読むのは古い順に maxMessages（100件）まで、残りは次の実行で', r2.added + r2.errors === 100 && rows(e2, '取込済み').length === 100 && rows(e2, '取込済み').some(function (r) { return String(r[0]) === 'p0'; }) && !rows(e2, '取込済み').some(function (r) { return String(r[0]) === 'p129'; }), JSON.stringify(r2));
  var r2b = e2.ctx.importMails();
  ok('G03 2回目で残り30件を読む（ページ送り）', rows(e2, '取込済み').length === 130 && e2.w.apiCalls.some(function (x) { return x.list; }), JSON.stringify(r2b));
  var e3 = env([]); var txt = e3.ctx.demoMailTexts();
  var mails = txt.split(/\n\n(?=--- )/).map(function (blk, k) {
    var subj = blk.match(/件名：(.*)/)[1], body = blk.split('本文：\n')[1];
    return { id: 'd' + k, dateMs: fx.T0 - (10 - k) * 60000, from: 'me', subject: subj, body: body };
  });
  var e4 = env(mails); var r4 = e4.ctx.importMails();
  ok('G04 試験用の6通：追加3・キャンセル1・エラー1（15:00）・再送は追加しない', mails.length === 6 && r4.added === 3 && r4.cancelled === 1 && r4.errors === 1 && rows(e4, '予約台帳').length === 3, JSON.stringify(r4));
})();

(function () {
  var e = env([]); e.ctx.setupTriggers(); e.ctx.setupTriggers();
  var before = e.w.triggers.length; var n = e.ctx.stopTriggers();
  ok('G05 setupTriggers を2回押しても1本、stopTriggers で0本', before === 1 && n === 1 && e.w.triggers.length === 0, before + '/' + n);
  var m = fx.booking('u1', 1, 'R-4001', '小林みお（架空）', '2026-10-27', '10:00', 'パン基礎', 1);
  var e2 = env([m]); var raw = e2.ctx.Gmail.Users.Messages.get;
  e2.ctx.Gmail.Users.Messages.get = function (u, id, o) { var r = raw(u, id, o); r.payload.parts[0].body.data = r.payload.parts[0].body.data.replace(/=+$/, ''); return r; };
  ok('G06 本文の末尾の = が省かれていても読める', e2.ctx.importMails().added === 1);
  var m3 = fx.booking('u2', 1, 'R-4002', '小林みお（架空）', '2026-10-27', '10:00', 'パン基礎', 1);
  var e3 = env([m3]); var raw3 = e3.ctx.Gmail.Users.Messages.get;
  e3.ctx.Gmail.Users.Messages.get = function (u, id, o) { var r = raw3(u, id, o); r.payload.parts[0].body.data = Array.prototype.slice.call(Buffer.from(m3.body, 'utf8')).map(function (b) { return b > 127 ? b - 256 : b; }); return r; };
  ok('G09 本文がバイト列（数の配列）で返っても読める', e3.ctx.importMails().added === 1 && find(e3, 'R-4002')[4] === '小林みお（架空）');
})();
(function () {
  // 途中で落ちても、そこまでに処理した分は「取込済み」に残る（次の実行で二重に入れない）
  var e = env(); var orig = e.ctx.parseBookingMail_, n = 0;
  e.ctx.parseBookingMail_ = function (s, b) { if (++n === 4) { var x = new Error('stop'); x.fatal = true; throw x; } return orig(s, b); };
  var origAlert = e.ctx.alertRecord_; e.ctx.alertRecord_ = function (o) { if (o.エラー === 'stop') throw new Error('alert down'); return origAlert(o); };
  var r = e.ctx.importMails();
  ok('G07 途中で止まっても処理した3通は取込済みに残る', r.ok === false && rows(e, '取込済み').length === 3 && rows(e, '予約台帳').length === 3, JSON.stringify(r) + rows(e, '取込済み').length);
  e.ctx.parseBookingMail_ = orig; e.ctx.alertRecord_ = origAlert;
  var r2 = e.ctx.importMails();
  ok('G08 次の実行で残りを読み、台帳は通常どおり6行', rows(e, '予約台帳').length === 6 && rows(e, '取込済み').length === 10, JSON.stringify(r2));
})();
(function () {
  // 実物に近い形：台帳を先に手で作っていて「書式なしテキスト」になっていない（時刻・日時が時刻型に変わるシート）
  var e = env(), H = e.ctx.APP_CONFIG.ledgerHeader;
  var sh = e.ctx.SpreadsheetApp.getActive().insertSheet('予約台帳'); sh.getRange(1, 1, 1, H.length).setValues([H]);
  e.ctx.importMails();
  var sum = rows(e, '集計').map(function (x) { return x.join(':'); }).join('/');
  ok('R01 書式なしの台帳でも集計の時間帯が数えられる（10:00/13:00/18:00 が0にならない）', /時間帯：10:00:3/.test(sum) && !/時間帯：13:00:0/.test(sum) && !/時間帯：18:00:0/.test(sum), sum);
  var rec = rows(e, '予約台帳').map(function (x) { return x[7]; });
  ok('R02 受信日時は0埋めの文字（yyyy-MM-dd HH:mm:ss）で入る', rec.length === 6 && rec.every(function (v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v); }) && rows(e, '予約台帳').every(function (x) { return typeof x[3] === 'string'; }), JSON.stringify(rec));
  // 前から残っている行：時間帯が時刻型・'13:00:00'・' 18:00' のもの
  var last = sh.getLastRow(), d = rows(e, '予約台帳')[0][2];
  sh.getRange(last + 1, 1, 3, H.length).setValues([['R-9001', '予約', d, '10:00', 'A', 'x', '1', '', 'z1'], ['R-9002', '予約', d, "'13:00:00", 'B', 'x', '1', '', 'z2'], ['R-9003', '予約', d, "' 18:00", 'C', 'x', '1', '', 'z3']]);
  var b = e.ctx.summaryBuild_().bySlot;
  ok('R03 時刻型・秒つき・前後に空白の時間帯も数える', Object.prototype.toString.call(rows(e, '予約台帳')[6][3]) === '[object Date]' && b['10:00'] === 4 && b['13:00'] >= 2 && b['18:00'] >= 2, JSON.stringify(b));
  var hm = e.ctx.cellHm_;
  ok('R04 cellHm_ は 0埋めなし・秒つき・時刻型・数値をそろえる', hm('9:05') === '09:05' && hm('10:00:00') === '10:00' && hm(new e.ctx.Date(Date.UTC(1899, 11, 30, 1, 0, 0))) === '10:00' && hm(0.75) === '18:00' && hm('１３：００') === '13:00');
})();
(function () {
  var e = env(); e.ctx.alertRecord_({});
  var v = (rows(e, 'エラー通知ログ').pop() || [])[0];
  ok('L01 エラー通知ログの時刻は日付つき（yyyy-MM-dd HH:mm:ss の文字）', typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v), String(v));
})();

var pass = res.filter(Boolean).length;
console.log('\n' + pass + ' OK / ' + (res.length - pass) + ' NG (total ' + res.length + ')');
process.exit(pass === res.length ? 0 : 1);
