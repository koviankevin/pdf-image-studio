# 多來源 PDF 與掃描 OCR 回歸測試

## 原生文字編輯

`browser/native-text.spec.mjs` 以合成 Word 類 TJ／內嵌中文字型 PDF，驗證原字不再擷取、彩色底與區域外像素相等、其他原文／Form／影像／第二頁保留、字型替換、PDF／PNG／A4、搜尋、復原重做、清空／刪除此編輯、旋轉後滑鼠選取、320 px、超出／不支援提示、未失焦草稿、跨 context 備份、字型失敗重試、延遲識別與預覽取消、Worker 回收及載入期間連點。前兩案納入 Firefox／WebKit；CI 用兩個 worker 執行隔離 context／伺服器。完整相容性案例與時間預算依目前設定檔，失敗仍阻擋部署。

`unit/native-text.test.mjs` 檢查位元組區段定位、跳脫字串／註解／多串流、移除原字編碼、來源未變及輸出無孤立舊串流、來源雜湊與重複區塊驗證、不支援效果、解壓上限及 OCR 重疊排除。這不是一般永久遮蔽工具或任意 PDF 段落重排。

## 掃描文字替換

`browser/replacement.spec.mjs` 以合成掃描件檢查實際拖曳範圍、底色覆蓋後的像素、區域外與未改頁像素不變、可搜尋中文／明體、PDF／PNG／A4 輸出、復原重做、未失焦草稿及可攜備份、旋轉、取消、溢位防護、字型失敗重試與 320 px 介面。掃描輸出與草稿／備份兩案納入 Firefox／WebKit；不是實機或真人驗收。相容性案例由 33 增至 35 項，suite 由 8 分鐘調整為 9 分鐘，既有 job 10 分鐘上限保留；失敗、取消或跳過仍阻擋發布，不自動重試。

`unit/replacement.test.mjs` 核對測量換行、超出判斷、新欄位驗證、舊標記相容與實際 PDF 繪圖。變更共用 drawing／字型路徑時，仍依影響範圍驗證原標記、OCR、A4 及來源共用，並保留既有 CI 閘門。

## 商品化支援與資料管理

`browser/product.spec.mjs` 以真實範例 PDF 檢查教師／辦公匯入、既有文件保留、文字／A4 輸出、取消延遲字型、資料清單僅讀 metadata、當前與其他工作區備份、刪除取消與確認、跨分頁備份版本判斷、缺少儲存資訊及 SecurityError 降級、診斷去識別與 JSON 下載、啟動失敗時說明仍可用、更新前保護一般／已輸出的純 A4 版面、無效更新資訊、320 px／鍵盤焦點／200% 字級，以及閱讀說明不觸發草稿寫入。教師範例、資料管理、診斷及窄螢幕案例納入 Firefox／WebKit 相容性範圍。

`unit/product.test.mjs`／`unit/release-info.test.mjs` 檢查診斷白名單、數量與備份版本判斷、摘要及版本輸入；`ci/release.test.mjs` 核對全份網站與產物雜湊，不能使用過期的 release metadata。修改 `dist/` 後先執行 `node scripts/release-manifest.mjs`，再啟動測試。

## 任務模式與多選排版

`browser/ease.spec.mjs` 用實際下載確認四種任務沿用原本框選／PDF 預覽／自由排版／原生文字擷取路徑，切換前後 PDF 文字、尺寸與像素雜湊及 DPI 設定不變；也驗證任務記憶、搜尋快捷鍵、320 px 介面、混合頁面／中文標題整組縮放及 PDF 文字座標、多選對齊等距、跨紙張移動、一次復原重做、滑鼠多選／框選／觸控多選模式、磁吸／Alt 暫停、取消手勢，以及未失焦整組欄位的草稿還原。

`browser/ease-performance.spec.mjs` 加入 30 個項目後實際拖曳 100 次指標更新，要求只建立兩張共用來源預覽、更新按影格合併、事件迴圈延遲有界，並讓自動儲存計時器在手勢中觸發，確認其等待提交、還原後位置與全部選取不變。`unit/layout-selection.test.mjs` 驗證邊界、比例、字級、不同尺寸項目等距、無法排列時保留輸入及草稿多選引用。相容性套件涵蓋任務模式、整組輸出與 320 px 操作；效能量測為合成文件，不能代表所有裝置或來源 PDF。

混合頁區域／強制 OCR 回歸使用 PDF.js 字形輪廓繪圖進行嚴格的像素雜湊相等檢查，並逐次核對原始圖片及原生文字繪圖指令的解碼位元組雜湊，排除 WebKit 在重新載入後系統字型繪圖差異造成的誤判。仍核對 OCR 可搜尋文字、不可見文字模式、座標及還原結果；其餘 PDF 檢查維持預設字型繪圖，正式網站的預覽路徑不變。

批次裁切取消測試在測試攔截回應內，明確暫停第二頁的實際縮圖準備流程；確認第一頁已準備、第二頁進度可見且等待點已建立後按停止再放行，核對全部五張原始頁面的像素雜湊。取消後實際旋轉第一頁，核對尺寸、像素改變及其餘頁面不變，再復原並嚴格比對全部原始像素。此同一案例以 `@compatibility` 納入 Firefox／Playwright WebKit，也繼續執行於 Chromium 完整回歸；不另複製測試邏輯。使用可控制的等待點，避免依賴固定毫秒延遲被忙碌的測試環境跳過；正式程式不包含此等待點，既有相容性工作流程、各 job 限時與發布閘門保持不變。

## 工作區與常用編輯功能

`browser/productivity.spec.mjs` 驗證命名工作區與舊草稿相容、獨立切換／清空、在全新瀏覽器 context 匯入可攜備份、取消或損壞匯入保護、背景衝突時仍可備份目前版本、工作區刪除、複製／空白／選頁替換、三種情境的復原／重做及原生文字快捷鍵、原生文字與中文 OCR 搜尋、批次頁碼／頁首頁尾的重複套用與實際輸出，以及 320 px 版面。
`unit/project-files.test.mjs` 檢查二進位備份往返、未知格式／遺漏資源／路徑穿越、解壓縮前大小限制，以及不合法的標記、OCR、幾何與編輯器引用。

## A4 拼版

`unit/imposition.test.mjs` 驗證 A4 尺寸、格位順序、邊界與間距驗證、四種旋轉、跨來源及最後未滿一張、空白頁和來源不被修改。
`browser/imposition.spec.mjs` 操作選頁與排序、2／4 頁和自訂格位、實際下載、預覽換頁、錯誤設定及手機視窗。
另以偏移 MediaBox／CropBox 和四種旋轉逐像素比對獨立 PDF.js 參考畫面（容許少量邊緣反鋸齒差異），確認向量頁未變成圖片，
並核對原始 JPEG 位元組不變、中文標記和 OCR 隱藏文字在拼版後仍可擷取。

## 效能與安全回歸

- `unit/imposition-resources.test.mjs` 確認 40 頁共用圖片只嵌入一次，已取消和組裝中取消皆停止輸出。
- `browser/safety-performance.spec.mjs` 驗證跨來源框選與下載、40 次旋轉後縮圖數有界、30 次復原／重做所需的縮圖仍可解碼，以及追加來源與清空時釋放縮圖。
- `browser/resource-lifecycle.spec.mjs` 觀察真實 Worker 的建立／終止，驗證新匯入清空復原與 30 次歷史淘汰後的來源回收，並確認失敗匯入和有效復原仍保留來源。OCR 案例暫停真實模組回應，要求停止後立即解鎖、舊回應不啟動 worker，隨後可用真實引擎重新辨識。
- 拼版排程測試只在實際組裝入口加入可控制的等待，確定性地重現切換設定和關閉／重開競態；真正的 PDF 組裝與預覽仍執行，檢查最多只有一份工作、舊請求被取消。
- CSP 測試嘗試插入行內及外站 script、執行外站 fetch，確認瀏覽器阻擋。外站 URL 使用保留的 `.invalid` 網域並攔截回覆，不連線外部服務；原有完整 OCR／中文標記測試同時驗證新政策的相容性。

## 執行

需求：Node.js 22 以上。完整回歸使用 Chromium；Firefox 與 Playwright WebKit 另執行小範圍相容性測試。CI 固定 Node.js 22。

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

只執行不需要瀏覽器的測試：

```sh
npm run test:unit
```

只執行瀏覽器測試，或開啟 Playwright 除錯介面：

```sh
npm run test:browser
npm run test:browser:ui
# 只執行真正的掃描 OCR 流程
npm run test:ocr
```

測試會自行啟動既有 `serve.mjs`，使用空閒的 localhost port，結束後關閉。
不需開啟正式網站或手動啟動伺服器。套件及瀏覽器安裝後，測試文件與網站資源皆在本機讀取。
瀏覽器測試禁止外部 HTTP 請求。失敗可用 `npx playwright show-report` 查看報告；
CI 另保留 trace、截圖及 HTML 報告七天。沒有自動重試或允許失敗的測試。

## 架構與驗證範圍

- `support/pdfs.mjs` 以專案內附的 pdf-lib 即時產生 A（2 頁）與 B（3 頁）。
  每頁有獨立英文文字、尺寸與色塊；無私人資料、外部字型或二進位測試檔。
- `unit/multi-pdf.test.mjs` 直接匯入正式 `editor-core.mjs`，用 Node 內建 `node:test`。
  檢查跨來源區塊移動、來源索引與物件保留、非法位置、交錯組裝、選取部分頁面、
  重複匯出、旋轉／裁切跟隨原頁，以及來源文件不被修改。
  匯出後重新載入 PDF，解碼本測試已知格式的文字操作符，核對每頁文字與尺寸。
  該輔助程式只適用於合成 fixture，不是通用 PDF 文字擷取器。
- `browser/multi-pdf.spec.mjs` 以 Playwright 驅動實際 `dist/index.html`，不替換 PDF.js、
  工作區邏輯或文件，也不公開測試專用的應用程式 API。
  覆蓋 A→B、B→A，各自一次加入與分次加入（四個完整案例）。
  透過拖曳與移動按鈕排成 B3、A2、B1、A1、B2，驗證原始檔名／頁碼、縮圖、
  原生文字擷取、校對預覽、TXT 下載、實際 PNG 下載色塊、完整與部分 PDF 下載。
  下載 PDF 使用網站內附的 PDF.js 重新解析，每頁比對完整文字及尺寸。

`workspace.mjs` 在載入時依賴 DOM、Canvas 及 PDF.js worker，所以使用瀏覽器測試；
`editor-core.mjs` 可直接匯入 Node，因此不需 jsdom、打包器或額外單元測試框架。
正式網站程式與第三方模組均不需為測試更動。

## 此次回歸的關鍵

內附 PDF.js 5.4.624 的 `PagesMapper` 在不同文件間共用頁數。
三頁 B 載入後再載入兩頁 A，若未在每次查找前恢復來源文件的頁數，讀取 B3 會出現
`Invalid page request.`。因此不能只測試兩份頁數相同的 PDF，也不能只核對匯出總頁數。

這組測試讓較大的來源頁碼出現在工作區前面，並交錯存取兩份文件，涵蓋
`getSourcePage` 的 render、viewport 與 native text 呼叫路徑。
原生文字案例也要求不載入 Tesseract，避免錯誤查找後意外改走 OCR 而被掩蓋。

## 掃描 OCR 端到端回歸

`browser/scanned-ocr.spec.mjs` 沿用相同 Playwright、伺服器與 Chromium，分別測試
`chi_tra+eng`（繁中＋英文）與 `eng`（英文），各兩頁，並各自跑自動版面與單欄版面。
`support/scans.mjs` 用內附 Noto Sans CJK TC 字型在 Canvas 畫出固定的合成內容，
再以 PNG 嵌入 PDF；沒有姓名、帳號等個資，也不需外部資料或新增二進位 fixture。
PDF.js 在辨識前確認兩頁都完全沒有文字，避免誤走原生文字捷徑。

### 必須通過的功能契約

- 經 UI 啟動正式 `ocr-tools.mjs`：不 mock Tesseract、worker、語言檔、辨識結果或應用程式狀態。
  確認實際 worker、WASM core loader 與所選語言資料成功載入，兩頁都完成且進入可編輯 OCR 模式。
  context 層級禁止外部 HTTP 請求，包含 dedicated worker 的請求。
- 多行辨識結果非空、可逐行編輯，聚焦時有有效的原稿標示框。不鎖定確切分行數或信心分數。
- 用確定的繁中／英文／數字校對字串取代每行，跨頁保留未存修改，儲存後關閉再開仍一致。
  後續未儲存的修改在關閉後捨棄。
- 下載實際 UTF-8 BOM TXT，精確比對頁次、行順序與全部校對文字。
- 下載實際 PDF，由內附 PDF.js 重新解析：比對完整校對文字（僅忽略 PDF 排版空白），
  檢查 rendering mode 3 隱藏文字、文字位置在頁內、尺寸不變。
  在同次瀏覽器執行中比較輸入與輸出的整頁 RGBA 雜湊，確認外觀逐像素相同；沒有跨機器 golden screenshot。
- 清空工作區後重新匯入輸出 PDF，再次擷取必須走原生文字且唯讀，不啟動新的 OCR worker。

### 準確率與防止誤判

原始辨識結果另外記錄為 `ocr-accuracy.json`：包含預期字串、實際字串與每頁字元錯誤率（CER）。
計算前採 NFKC、轉小寫並忽略空白／標點／符號，降低無關格式差異。
**CER 僅供觀察，不是 CI 通過門檻**，也不是掃描品質或整體準確率的保證。
引擎／語言資料升級時應比較此報告；若要建立準確率門檻，應另外準備有代表性的標註資料集。
功能測試仍要求辨識成功且產生多行文字，但不會因一兩個錯字、信心分數或行數變化而失敗。
校對／下載／匯出的預期值來自測試輸入的確定字串，不會以原始 OCR 輸出驗證它自己。

報告附於 Playwright HTML，CI 不論成功或失敗都上傳已產生的 `ocr-accuracy-*` artifact（七天）。
尚未完成辨識就失敗時可能沒有準確率報告，可查看既有 failure diagnostics。
單案例上限 180 秒、辨識等待 120 秒，沿用零重試，避免用重試掩蓋回歸。
功能回歸不注入辨識參數或結果，也不改既有原生文字測試「不可載入 Tesseract」的檢查。

尚未涵蓋低品質照片、手寫、複雜表格、密碼 PDF、所有標記工具、
大檔壓力與真正 Safari 實機。Firefox／Playwright WebKit 僅涵蓋下方 smoke suite，不代表完整 Chromium 回歸已在三種引擎驗證。

## CI 與部署

`.github/workflows/tests.yml` 在所有指向 main 的 PR、每次 main push 及手動執行時測試。
`Node and Chromium regression` 保留原名稱、Node.js 22、完整 Node／Chromium 測試與診斷 artifacts。
測試 job 只有 `contents: read`，不需要 secrets；任一安裝或測試步驟失敗都不能部署。

Pages 已整合到同一 workflow 的 `Publish tested website` job，以 `needs: [regression, compatibility]` 等待成功；
另明確要求 regression 與 compatibility 結果皆為 success、ref 為 `refs/heads/main`，且事件為 push 或 workflow_dispatch。
PR（包括 fork）和手動選取其他分支只測試，不會發布。原本獨立的 `pages.yml` 已刪除，避免旁路。
所有 main 更新都測試並在成功後發布，包含純測試／相依套件／文件變更；刻意不保留 dist 路徑過濾，
減少兩份觸發条件需要同步維護的風險。

測試與發布均 checkout 相同 `${{ github.sha }}`，PR 測的是 GitHub merge ref 的 SHA，
main 發布測的是 main 事件 SHA。部署在全新 workspace 取同一提交的 dist，不使用測試產物或移動中的 main。
Pages artifact 名稱包含 run ID 與 attempt，避免重跑時誤取舊 artifact；只有部署 job 有
`pages: write`／`id-token: write`，沿用 `github-pages` environment。

發布使用 `pages` concurrency lock 且不取消進行中的部署；main workflow 不會因後續 push 而中途取消，
PR 仍取消舊執行。取得發布鎖後才查 main HEAD，若事件 SHA 已過期則略過 checkout、上傳與發布，
避免慢速舊執行或舊提交重跑覆蓋新站。GitHub 不保證 concurrency 排序，不能只依賴排隊次序。
查詢 main 失敗會直接失敗，不會放行。檢查後若 main 又前進，正在發布的仍是通過測試的 SHA；
新提交必須自己通過測試，並取得同一發布鎖後才能取代它。新提交測試失敗時維持先前成功發布的版本。

### 手動發布與重跑

在 Actions → **Regression tests** → **Run workflow** 選 **main**。
這會先重跑完整測試，再發布當次 SHA，沒有跳過測試的選項。請勿再使用已移除的 Publish website workflow。
若只重跑失敗的部署 job，GitHub 沿用同一 run、同一 SHA 已成功的 regression 與 compatibility 結果；
過期 SHA 仍會被 main HEAD 檢查擋住。需要回復舊功能時請在 main 建立 revert 提交並重新測試。

### 發布閘門驗證

```sh
npm run test:ci
```

`ci/deployment-gate.test.mjs` 解析正式 workflow YAML，用 GitHub 官方 `@actions/expressions`
求值實際部署条件，包含 48 組事件／ref／測試結果情境，另驗證必跑測試、SHA、權限、artifact、
發布鎖與 main HEAD 檢查。成功 main push／手動執行放行，失敗／取消／跳過均阻擋。
HEAD 檢查直接執行 YAML 的 script，mock 僅限 GitHub API 回應，涵蓋 current、stale 與 API 錯誤。
這是 workflow 契約測試，不會呼叫正式 Pages API，也不代表已實際部署網站。
GitHub PR 執行另驗證完整回歸測試；正式部署整合須在此 PR 合併至 main 後才能執行。

若要在合併前強制把關，可在 main 的 branch protection/ruleset 將
`Node and Chromium regression`、`Compatibility (firefox)`、`Compatibility (webkit)` 設為 required status checks，並要求透過 PR 合併。
此變更不調整儲存庫設定或分支保護規則。

## 繁中準確率調查與選用實驗

2026-10-11 調查確認第一頁錯誤集中在第一行的中英文誤認；單欄 PSM 4 在本合成資料
將第一頁 CER 0.369565 降為 0，第二頁與英文控制組均維持 0。
正式 UI 加入單欄選項，預設仍為自動版面，不假設一般文件都只有一欄。
完整原因、對照數字與限制見 [調查報告](reports/ocr-investigation-20261011.md)。

`npm run test:ocr:compare` 使用相同 fixture、字型、引擎與 CER，對照 PSM、DPI、語言順序
與二值化；輸出 `ocr-experiment-results/**/comparison.json`。這是選用的量測，
不在日常 CI 執行，也不以 CER 為 pass/fail 門檻。

## 掃描條件與閱讀順序（模擬樣本）

`support/scan-conditions.mjs` 新增六頁固定資料：乾淨對照、正負 1.5° 傾斜、
Canvas blur(1.2px)、灰字 170／灰底 210，以及左右各四行的雙欄中文。
全部是無個資的電腦合成掃描模擬，**實體掃描樣本數為 0**，不代表一般文件準確率。
既有 `support/scans.mjs`、正規化和 CER 完全不變。

`browser/scan-conditions.spec.mjs` 經正式 UI 選 PSM 3／4，沿用原 PDF.js、Tesseract、
字型、語言檔、300 DPI／3500 px 上限，不攔截修改 OCR 程式、不注入辨識結果。
每種模式各一個六頁功能案例，納入既有日常 CI；原本八個瀏覽器案例保留。
新案例檢查無原生文字、引擎載入、六頁完成、可編輯文字與有效框、校對儲存和精確 TXT。
隱藏 PDF 文字層與原稿外觀仍由既有完整 OCR 端到端案例把關。

每頁的校對前 UI 原始文字、逐行框、PNG SHA-256、預期文字、CER 與閱讀順序
另存 `ocr-accuracy.json`，沿用既有 informational artifact；它們**不是 pass/fail 門檻**。
閱讀順序以原稿框的欄／行位置觀察，雙欄預期為左欄由上到下，再右欄由上到下。
跨欄合併、順序錯置、缺少／無法定位均分別標示，不重排 OCR 來降低 CER。
此觀察器只適用本固定幾何資料，不是通用閱讀順序演算法。
CI 另保存實際生成的 PNG／image-only PDF 七天，方便對照字型渲染或瀏覽器版本差異。

```sh
npm run test:ocr:conditions
# 預先安排三次獨立 context/worker 量測，並非失敗重試
npm run test:ocr:conditions -- --repeat-each=3
```

詳見 [掃描條件實測報告](reports/ocr-scan-conditions-20261011.md) 與同名 JSON 原始資料。

## 可選雙欄模式：中央分割、先左後右

`two-column` 只處理中央留白、沒有跨欄內容的橫排雙欄掃描。以顯示中的頁面
（套用旋轉／裁切後）中央為界，先切圖再用 PSM 4 分別辨識左右兩欄；右欄座標
加回切割偏移，兩欄都成功才提交該頁。自動 PSM 3／單欄 PSM 4 的整頁路徑不變。
這不是自動偵測欄縫，不支援跨欄標題、表格、直排、非中央分欄或任意多欄。

`support/scan-conditions.mjs` 原封不動引用 PR #4 的
`4b435401c3f06e32c6d4edd47e94803b2a92af55`，只取第六頁比較三種模式。
建立本功能 PR 期間，PR #4 已合併至 main；整合後保留其全部測試，既有 CER／正規化未變。

`browser/two-column-ocr.spec.mjs` 使用正式 UI 和真實 Tesseract，核對固定樣本的
八行文字、先左後右順序、原稿框、校對儲存、TXT、PDF 文字順序／座標、隱藏
模式及完全相同的可見像素；另驗證開始處理右欄時取消不保存半頁、可重新辨識。
其中一個獨立裁圖測試用 worker spy 檢查奇數寬度的像素覆蓋、空欄及錯誤傳播，
此測試不屬於 OCR 準確率量測。單元測試保護座標換算、欄內排序及缺框 fallback。
CER 仍是報告值；新模式的固定 fixture 文字及欄序是功能回歸契約，不代表一般
文件準確率。自動／單欄模式沒有「必須保持錯誤」的斷言。

```sh
npm run test:browser -- two-column-ocr.spec.mjs
# 選用：記錄兩種整頁模式的原始 blocks／paragraphs／lines／words
npm run test:ocr:compare -- two-column-layout.spec.mjs
```

原始階層檢查只在記憶體中的 served copy 加入結果記錄，不更動引擎輸出。
日常端到端測試不攔截或改寫正式 OCR 模組。CI 保存 OCR JSON 與雙欄校對 PNG／
PDF 七天。實測範圍與數據見 [雙欄報告](reports/ocr-two-column-20261011.md)。


## Firefox / Playwright WebKit 相容性 smoke suite

```bash
npm ci
npx playwright install --with-deps firefox webkit
npm run test:compatibility
# 可單獨重現某個引擎
npm run test:compatibility -- --project=firefox
npm run test:compatibility -- --project=webkit
```

`playwright.compatibility.config.mjs` 以 `@compatibility` 標籤沿用既有 fixtures、合成 PDF 與五個回歸案例，
另加一個 Worker 生命週期案例，每個引擎 6 項。使用獨立設定與測試目錄，
`npm run test:browser` 的 Chromium 案例及 OCR 準確率矩陣保持原樣。

| 案例 | 核對內容 |
| --- | --- |
| A4 UI | 兩份不同頁數 PDF、工作區順序、每張預覽、真實下載、A4 尺寸與文字順序、無效間距 |
| 跨來源框選 | 先匯入長 PDF 再匯入短 PDF，仍可預覽及下載長 PDF 的第 3 頁 |
| 來源回收 | 失敗匯入保留復原；反覆刪除／新增後只留目前來源與一個 PDF Worker；清空歸零 |
| OCR 模組載入取消 | 暫停真實模組回應，停止立即解鎖；遲到回應不啟動舊 Worker；可再次辨識 |
| 拼版取消 | 控制實際組裝入口的等待，驗證過時設定、關閉／重開取消與序列化，真正組裝／渲染照常執行 |
| OCR Worker | 真實引擎、WASM、英文資料啟動；取消後關閉 Worker；重新啟動，同一 Worker 辨識兩個 image-only 合成頁面 |

每個案例觀察頁面的 `securitypolicyviolation` 及未處理錯誤，正常流程出現任一項即失敗。
保留正式 meta CSP，不用 `bypassCSP`。既有 Chromium 的惡意行內／外站 script 阻擋測試保留；
這個 suite 聚焦正常功能可否運作，不重複整套 CSP 攻擊測試，也不宣稱 meta CSP 會套用到獨立 Worker 回應。

OCR Worker 案例只在第一次 `recognize` 訊息送進原生 Worker 前設置確定性的等待點，
避免快速辨識完成與點擊停止競速；不偽造 OCR 結果。取消後的兩頁辨識完整執行真實引擎，
確認每頁有非空白可校對文字及預覽，並計數建立／終止與跨頁重用。
此案例不是「WASM 正在計算途中」的任意時間取消測試，也不對 CER、行數或字型像素做跨引擎承諾。
完整中英文準確率、雙欄與低品質掃描矩陣仍只在 Chromium 執行，實體掃描覆蓋率不因此增加。

CI 用兩個平行 matrix jobs，各只安裝自己的引擎；每個 job 上限 10 分鐘，
Playwright 每次執行上限 5 分鐘、單 worker、不重試、不允許失敗，避免把 OCR 回歸成本擴成三倍。
每次保存 HTML、瀏覽器實際版本、CSP／錯誤診斷與合成 PDF；失敗另有 trace／截圖，保留七天。
部署仍只從 main 的受測 SHA 發布，保留過時提交檢查，並要求原本 Node／Chromium 與兩個相容性 jobs 全部成功。

**驗證邊界：** Firefox 是 Playwright 所帶的 Firefox；WebKit 是 Linux 上 Playwright 所帶的 WebKit。
後者不是安裝於 macOS／iOS 的 Safari，不涵蓋所有 Safari 版本、Apple 裝置、剪貼簿與下載介面差異。
真正 Safari 實機目前尚未驗證；後續手動檢查應記錄 OS、Safari 版本與裝置，使用同樣的合成 PDF 核對
多檔預覽、A4 下載、OCR 啟動／停止／再執行與控制台錯誤。

## 紙間分享縮圖

`dist/social-preview-20261022.png` 是 1200 × 630 PNG（約 44 KB），沿用既有紙頁圖示、
品牌藍、米白與內附 Noto Sans CJK TC 字型。重要文字置於中央 630 × 630 範圍，
已目視檢查原尺寸、600 × 315 縮小及中央正方形裁切；平台仍可能採用其他裁切方式。
SVG 編輯來源為 `scripts/social-preview.svg`，不載入外站圖片或新增前端套件。

```sh
# 選用：修改 SVG 後，使用既有 Playwright 與內附字型重新輸出靜態 PNG
node scripts/generate-social-preview.mjs
# 亦可安裝內附字型後使用 Inkscape 匯出 SVG；本次 PNG 採此方式製作。
# 本機檢查（也由 test:ci 強制執行）
node scripts/check-social-preview.mjs
# 合併發布後，與這份 checkout 的 PNG 雜湊比對
node scripts/check-social-preview.mjs --url https://koviankevin.github.io/pdf-image-studio/
```

`ci/social-preview.test.mjs` 核對靜態 head 的 OG／Twitter 標籤、正式 HTTPS 專案路徑、
PNG 簽章、實際／宣告尺寸、300 KB 上限及上傳目錄內的檔案；另確認缺檔、錯路徑及錯尺寸會失敗。
`browser/social-preview.spec.mjs` 透過本機伺服器讀取圖片並真正解碼，驗證 HTTP MIME 與自然尺寸。
現有發布閘門仍上傳完整 `dist`，且在 Pages 發布後核對正式首頁與圖片的 HTTP 200、MIME、
中繼資料及 PNG SHA-256，短暫 CDN 延遲最多重試 6 次；讀取失敗會明確使工作失敗，
但此時 Pages 已完成發布，該檢查不會自動回滾網站。

**驗證邊界：** HTTP／中繼資料及本機裁切檢查不是 Facebook、LINE 或 X 的實際分享預覽。
本次未取得這些平台的實際預覽或快取結果，不宣稱其快取已刷新。
圖片使用版本化檔名；日後改圖請同步更新檔名與中繼資料，必要時透過平台官方工具重新擷取。


## 多張排版、批次裁切、區域 OCR、工作範本與差異比對

`studio.spec.mjs` 驗證多張 A4 的實際 PDF 文字、跨張移動／復原、草稿與專案備份；不同尺寸／方向頁面的批次裁切與中途取消；混合原生文字及掃描影像的真實區域／強制 OCR，以及旋轉框選後範圍外舊文字層的方向／位置；全空白多張排版的保存與輸出；多分頁範本更新，並比對輸出像素確認原稿不變；範本設定與來源資料隔離；差異比對的相同頁、修改頁、缺頁及下載尺寸；320px 操作寬度。

`studio-performance.spec.mjs` 使用 50 頁來源，記錄畫布上限、同時運作 Worker 數、取消反應、事件迴圈停頓、反覆開關後的 URL／Worker 釋放，以及回收後 JS heap 增量；輸出 `comparison-performance.json`。另一例確認十張排版只建立兩張共用預覽，紙面 DOM 只包含目前紙張。單元測試另驗證 20 張／300 個重複項目仍只有一份原始影像資源。這些是合成資料的回歸界線，不代表任意 PDF 的固定速度或整個瀏覽器程序的記憶體總量。

- `browser/tool-hub.spec.mjs` 驗證全部工具入口、前置條件、搜尋定位、三種原文直接入口與實際 PDF，以及手機先顯示頁面再顯示輸出設定。
- `unit/tool-catalog.test.mjs` 要求每個工具都有唯一識別、分類、目標與有效測試對照；對照清單見 `docs/FEATURE-COVERAGE.md`。

- `browser/pdf-inspection.spec.mjs` 在讀兩頁 PDF 的像素後，刻意載入另一份單頁 PDF，確認驗收讀頁始終綁定被檢查的文件；文字與像素斷言保持原樣。

- `browser/tool-coverage.spec.mjs` 補驗原本缺少的直接操作：圖片轉 PDF、拆分／範圍 ZIP、JPG 容量預估和圖片 ZIP、框選剪貼簿 PNG 的尺寸與 DPI／權限失敗，以及文字、螢光筆、箭頭、方框的實際輸出。

## 0.12.1 工具狀態邊界

`browser/tool-hub.spec.mjs` 補驗空頁面仍可復原、只有重做時定位到重做，以及未選頁仍可開啟既有文字辨識結果；並核對復原前後與校對開關後的實際 PDF。兩個案例都納入 Firefox／WebKit。相容性 suite 為 12 分鐘、job 15 分鐘；完整 Chromium 與安裝的 job 為 20 分鐘，單一案例時限與發布關卡保持。

## 0.12.2 接續排版與零結果

`tool-hub.spec.mjs` 補驗 A4 任務在未選頁、草稿還原、主工作區無頁面與空白排版時的實際開啟和 PDF；圖片尺寸防護失敗後重試、第一張前取消與部分完成後取消的入口及 PNG。`tool-state-matrix.spec.mjs` 以原有控制項為參考，檢查 17 種一般狀態、32 個入口（544 項狀態比對），涵蓋空白、選頁、復原／重做、兩份來源、忙碌／取消、圖片結果、既有 A4 與 OCR。以上案例納入 Firefox／WebKit。

## 0.12.3 停止控制與載入就緒

`long-task-visibility.spec.mjs` 在 1440px 與 320px 驗證 OCR／範本設定收合後的停止與進度、取消回復及實際 PDF。測試在真實模組匯入／PNG 編碼邊界等待，不以固定延遲猜測處理階段。

`support/control-state.mjs` 的 `expectControlEnabled` 檢查實際 CSS `:disabled`，包含祖先 fieldset 停用；44 處 fieldset 等待已改用此 helper。`control-readiness.spec.mjs` 驗證停用時 helper 確實等待失敗、啟用後通過；`unit/control-state-policy.test.mjs` 防止已登錄 fieldset 使用會誤判的通用 enabled/disabled matcher。原有輸出與取消斷言保留。
