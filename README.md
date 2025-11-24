README — Chrome User Behavior Logger

(日本語 → English for every section)



🇯🇵🇬🇧 概要 (Overview)

この Chrome 拡張機能は、ウェブページ上でのユーザー行動を記録するために設計されています。
クリック、キーボード入力、スクロール、マウス移動、フォームの変更、ドラッグ＆ドロップ、可視性変更、ネットワーク状態など、多数のイベントをキャプチャし、バッチ処理・圧縮してバックグラウンドに送信することができます。

This Chrome extension is designed to capture detailed user behavior on webpages.
It records clicks, keyboard activity, scrolling, mouse sampling, form interactions, drag-and-drop, visibility changes, network status, and more.
All events can be batched, compressed, and optionally forwarded to the background script.



🇯🇵🇬🇧 主な機能 (Main Features)

クリック/マウスイベントの記録 / Click & mouse event logging
キー入力、入力フィールドの変更 / Keystrokes and input field changes
選択、コピペ、フォーカス/ブラー / Text selection, copy/paste, focus/blur
スクロールのデバウンス記録 / Debounced scroll logging
マウス移動の一定間隔サンプリング / Interval-based mouse movement sampling
ウィンドウリサイズ、画面の向き変更 / Resize + orientation detection
rage click の自動検出 / Rage click detection
タイピング速度測定 / Typing speed measurement
ページ可視性変更イベント / Page visibility change tracking
ネットワークオンライン/オフラインイベント / Network online/offline monitoring
フォーム送信イベント / Form submission events
バッチ処理と LZW 圧縮 / Batch processing with LZW compression
バックグラウンドへのイベント送信（任意）/ Optional forwarding to background script



🇯🇵🇬🇧 ファイル構成 (File Structure)

CLICK-LOGGER-V3
│── README.md
└── src/
    └── modules/
        │── bridge.js
        │── background.js
        │── content.js
        └── manifest.json


🇯🇵 content.js の概要 (About content.js)
content.js は実際のデータキャプチャロジックの 100% を担当します。 
約 700 行の単一ファイルになっていますが、Chrome の仕様上、content script は直接モジュール化できません。
そのため:
グローバル衝突を避けるために即時関数(IIFE)でラップ
window.__ext_logger_v2 という名前空間に安全に格納
全イベントリスナーを一元管理
バッチャーと圧縮機能を統合

🇬🇧 About content.js
content.js contains 100% of the data-capturing logic.
It is nearly 700 lines long, but this is necessary because content scripts cannot be modularized using ES modules.
So it is structured with:
An IIFE wrapper to prevent global pollution
A safe namespace: window.__ext_logger_v2
Unified event registry
Integrated batcher + compression logic



🇯🇵🇬🇧 background.js の概要 (About background.js)

バックグラウンドサービスワーカーは、コンテンツスクリプトから送られたイベントを受信し、コンソールに表示したり、保存したりするための橋渡しをします。
また次のデバッグ API を提供します:
The background service worker receives events forwarded from the content script and logs or stores them.
It also exposes debugging commands:
PING
GET_PENDING_COUNT
FLUSH_QUEUE



🇯🇵🇬🇧 機能フラグ (Feature Flags)

window.__ext_logger_v2.featureFlags を使うことで、実行中に各機能の ON/OFF を切り替えられます。
Using window.__ext_logger_v2.featureFlags, you can enable or disable features at runtime.
例/Example:
window.__ext_logger_v2.setFeature("click", false)



🇯🇵🇬🇧 デバッグ方法 (Debugging)

コンテンツスクリプトロード確認 (Check content script load):
window.__ext_logger_v2

バッチ数確認 (Check queued batch size):
window.__ext_logger_v2.getPendingBatchCount()

強制フラッシュ (Force flush):
window.__ext_logger_v2.flushBatch(true)



🇯🇵🇬🇧 インストール方法 (Installation)

Chrome を開く / Open Chrome
chrome://extensions / Go to chrome://extensions
「デベロッパーモードON」 / Enable "Developer Mode"
「パッケージ化されていない拡張機能を読み込む」 / Click "Load unpacked"
このフォルダを選択 / Select this extension folder



🇯🇵🇬🇧 注意事項 (Notes)

この拡張機能は学術目的で作成されています / This extension is built for academic purposes
商用のユーザートラッキングとしては使用しないでください / Do not use as a commercial tracking system
ユーザーデータを扱う場合は必ず同意を得ること / If used with real users, always obtain consent



🇯🇵🇬🇧 ライセンス (License)
MIT License
