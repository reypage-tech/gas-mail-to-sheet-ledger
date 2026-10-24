/** 設定：架空の料理教室（予約・申込の通知メールを台帳に集約するデモ）。業種ごとの値はここだけに置く */
var APP_CONFIG = {
  tz: 'Asia/Tokyo',
  propPrefix: 'mail_',
  dedupe: { sheet: '取込済み' },
  sheets: { ledger: '予約台帳', slots: '枠別一覧', done: '取込済み', noticeLog: 'エラー通知ログ', summary: '集計' },
  ledgerHeader: ['予約番号', '状態', '日付', '時間帯', 'お名前', 'コース', '人数', '受信日時', 'メールID'],
  receipt: { label: '予約番号', timeLabel: '受信日時' },
  mail: {
    // デモ：自分あてに送った架空メールに、手でラベル「yoyaku-demo」を付けて読む。
    // 実際に使うときは、予約システムの送信元に合わせて例えば 'from:(送信元アドレス) newer_than:7d' に書き換える
    query: 'label:yoyaku-demo newer_than:30d',
    maxMessages: 100,
    subjects: { booking: '【予約受付】', cancel: '【キャンセル受付】' },
    labels: { no: '予約番号', name: 'お名前', date: '日付', time: '時間', menu: 'コース', people: '人数' },
    nameMax: 20
  },
  slots: { times: ['10:00', '13:00', '18:00'], capacity: 6, daysAhead: 7, fewLeft: 2 },
  statuses: { booked: '予約', cancelled: 'キャンセル' },
  cancelColor: '#d9d9d9',
  menus: ['パン基礎', '和食の基本', 'お菓子入門'],
  trigger: { everyMinutes: 10 },
  notify: {
    logHeader: ['記録日時', '予約番号', '宛先', '通知文'],
    toColumn: '宛先',
    to: '管理者（架空）',
    template: ['{宛先} さん', 'メールの取り込みで止まったものがあります。', '件名：{件名}', '内容：{エラー}', '受信日時：{受信日時}', 'エラー通知ログと元のメールを確認してください。']
  },
  summary: {
    weekStart: 1,
    labels: { today: '今日', week: '今週', total: '合計' },
    groupBy: [
      { column: '状態', key: 'byStatus', prefix: '状態：', fixed: ['予約', 'キャンセル'] },
      { column: '時間帯', key: 'bySlot', prefix: '時間帯：', fixed: ['10:00', '13:00', '18:00'], time: true }
    ]
  }
};
