/**
 * 通知メールの読み取り（サービスを使わない純粋な関数。ブラウザでもそのまま動く）。
 * 件名で「予約」か「キャンセル」かを見分け、本文の「見出し：値」の行を読む。
 * 読めないときは理由つきのエラーを投げる。
 */
function parseBookingMail_(subject, body) {
  var c = APP_CONFIG, L = c.mail.labels;
  var type = null;
  if (String(subject).indexOf(c.mail.subjects.booking) !== -1) type = 'booking';
  else if (String(subject).indexOf(c.mail.subjects.cancel) !== -1) type = 'cancel';
  if (!type) throw new Error('件名が予約・キャンセルのどちらでもありません');

  var map = {};
  String(body).split(/\r?\n/).forEach(function (line) {
    var m = line.match(/^\s*([^：:]+)\s*[：:]\s*(.*?)\s*$/);
    if (m) map[m[1].trim()] = m[2];
  });
  var no = (map[L.no] || '').normalize('NFKC');
  if (!/^[A-Z]{1,3}-?\d{3,8}$/.test(no)) throw new Error('予約番号が読めません');
  if (type === 'cancel') return { type: type, no: no };

  var date = (map[L.date] || '').normalize('NFKC').replace(/\//g, '-');
  var dm = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dm) throw new Error('日付が読めません');
  date = dm[1] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2);
  var time = (map[L.time] || '').normalize('NFKC').replace(/^(\d):/, '0$1:');
  if (c.slots.times.indexOf(time) === -1) throw new Error('時間帯が枠にありません：' + time);
  var people = Number((map[L.people] || '').normalize('NFKC').replace(/[^0-9]/g, ''));
  if (!(people >= 1 && people <= c.slots.capacity)) throw new Error('人数が読めません');
  var name = normalizeName_(map[L.name] || '');
  if (!name || name.length > c.mail.nameMax) throw new Error('お名前が読めません');
  var menu = String(map[L.menu] || '').trim();
  if (c.menus.indexOf(menu) === -1) throw new Error('コースが一覧にありません：' + menu.slice(0, 20));
  return { type: type, no: no, date: date, time: time, people: people, name: name, menu: menu };
}
