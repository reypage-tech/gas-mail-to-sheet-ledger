// node test/demo_output.js : test/run.js と同じモック上で importMails を1回動かし、シートの中身を JSON で出す。
// docs/local_test_output.png はこの出力から作った画像。実際の Apps Script・Gmail では実行していない。
var fs = require('fs'), path = require('path'), vm = require('vm');
var mock = require('./mock_apis.js');
var fx = require('./fixtures.js');
var B = path.join(__dirname, '..', 'src');
var FILES = ['Common.gs', 'Dedupe.gs', 'Config.gs', 'Summary.gs', 'Notify.gs', 'MailParse.gs', 'Code.gs'];
var b = mock.buildMockGlobals({ nowMs: fx.T0, gmail: fx.MAILS.slice() });
var ctx = vm.createContext(b.globals);
FILES.forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(B, f), 'utf8'), ctx, { filename: f }); });
var result = ctx.importMails();
var out = { result: result, sheets: {} };
['予約台帳', '枠別一覧', 'エラー通知ログ'].forEach(function (n) { var s = b.world.sheets[n]; out.sheets[n] = s ? s.__rows().filter(function (r) { return r.length && r[0] !== ''; }) : []; });
console.log(JSON.stringify(out));
