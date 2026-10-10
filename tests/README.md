# 多來源 PDF 回歸測試

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

此套件不衡量掃描 OCR 的辨識準確率，也未涵蓋密碼 PDF、所有標記工具、
大檔壓力、Safari 或 Firefox；這些可在有對應回歸風險時再加入。

## CI 與部署

`.github/workflows/tests.yml` 在所有指向 main 的 PR、main push 及手動執行時測試。
只有讀取原始碼權限，不需要 secrets。測試失敗會讓 `Node and Chromium regression` 檢查失敗。

既有 `.github/workflows/pages.yml` 保持原樣：仍由 main 的 dist 變更觸發 Pages 發布。
測試與發布是獨立流程，**此變更本身不會阻擋失敗的 main commit 部署**。
若要在合併前強制把關，可在 main 的 branch protection/ruleset 將
`Node and Chromium regression` 設為 required status check，並要求透過 PR 合併。
本 PR 不調整儲存庫的權限或分支保護規則。
