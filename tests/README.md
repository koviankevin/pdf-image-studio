# 多來源 PDF 與掃描 OCR 回歸測試

## 執行

需求：Node.js 22 以上。CI 固定使用 Node.js 22 與 Chromium。

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
`chi_tra+eng`（繁中＋英文）與 `eng`（英文），各兩頁。
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
測試不修改正式程式，也不改既有原生文字測試「不可載入 Tesseract」的檢查。

尚未涵蓋低品質照片、手寫、複雜表格、密碼 PDF、所有標記工具、
大檔壓力、Safari 或 Firefox；這些可在有對應回歸風險時再加入。

## CI 與部署

`.github/workflows/tests.yml` 在所有指向 main 的 PR、main push 及手動執行時測試。
只有讀取原始碼權限，不需要 secrets。測試失敗會讓 `Node and Chromium regression` 檢查失敗。

既有 `.github/workflows/pages.yml` 保持原樣：仍由 main 的 dist 變更觸發 Pages 發布。
測試與發布是獨立流程，**此變更本身不會阻擋失敗的 main commit 部署**。
若要在合併前強制把關，可在 main 的 branch protection/ruleset 將
`Node and Chromium regression` 設為 required status check，並要求透過 PR 合併。
本 PR 不調整儲存庫的權限或分支保護規則。
