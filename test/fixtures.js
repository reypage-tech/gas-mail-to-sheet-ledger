// 架空の通知メール（送信元・人名・予約番号はすべて架空）
var T0 = Date.UTC(2026, 9, 25, 23, 0, 0); // 2026-10-26 08:00 JST（月曜）
// 受信時刻は 2026-10-24・25 の 10:00〜17:00（日中）
function at(h) { return T0 - h * 3600000; }
function booking(id, hAgo, no, name, date, time, menu, people) {
  return { id: id, dateMs: at(hAgo), from: 'noreply@yoyaku.example', subject: '【予約受付】' + menu + ' ' + date + ' ' + time,
    body: '予約を受け付けました。\n予約番号：' + no + '\nお名前：' + name + '\n日付：' + date + '\n時間：' + time + '\nコース：' + menu + '\n人数：' + people + '名\n' };
}
function cancel(id, hAgo, no) {
  return { id: id, dateMs: at(hAgo), from: 'noreply@yoyaku.example', subject: '【キャンセル受付】予約番号 ' + no, body: 'キャンセルを受け付けました。\n予約番号：' + no + '\n' };
}
var MAILS = [
  booking('m01', 46, 'R-1001', '山田花子（架空）', '2026-10-27', '10:00', 'パン基礎', 2),
  booking('m02', 45, 'R-1002', '田中一郎（架空）', '2026-10-27', '10:00', 'パン基礎', 3),
  booking('m03', 43, 'R-1003', 'ｻｻｷ ﾐｷ（架空）', '2026/10/27', '13:00', '和食の基本', 1),
  booking('m04', 41, 'R-1004', '中村さくら（架空）', '2026-10-28', '18:00', 'お菓子入門', 4),
  booking('m05', 39, 'R-1002', '田中一郎（架空）', '2026-10-27', '10:00', 'パン基礎', 3), // 同じ予約の再送
  booking('m06', 22, 'R-1005', '小川ゆい（架空）', '2026-10-27', '10:00', 'パン基礎', 1),
  cancel('m07', 21, 'R-1004'),
  { id: 'm08', dateMs: at(19), from: 'noreply@yoyaku.example', subject: '【予約受付】お菓子入門', body: '予約番号：R-1006\nお名前：森あおい（架空）\n日付：2026-10-29\n時間：15:00\nコース：お菓子入門\n人数：1名\n' }, // 枠にない時間
  booking('m09', 17, 'R-1007', '=HYPERLINK("x")', '2026-10-29', '13:00', '和食の基本', 2),
  cancel('m10', 15, 'R-9999') // 元の予約が無いキャンセル
];
module.exports = { T0: T0, MAILS: MAILS, booking: booking, cancel: cancel, at: at };
