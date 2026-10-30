# 真實掃描基準：收錄與執行

目前正式收錄 **0 頁**。空 manifest 不是通過的 benchmark，也沒有新的真實掃描 CER 結果。
這次新增評分及驗證工具；未更動正式 OCR 引擎、既有 CER 或發布關卡。

## 收錄目標（尚待取得與人工校對）

| 分層 | 目標頁數 | 說明 |
| --- | ---: | --- |
| 繁中單欄 | 6 | 至少兩份文件，含不同字型／字級 |
| 繁中與英文混合 | 6 | 英文代碼、日期、金額，包含標點與大小寫 |
| 橫排雙欄 | 6 | 中央／非中央欄縫、跨欄標題分開標示 |
| 低品質掃描／照片 | 6 | 傾斜、低對比、模糊或不均勻背景 |

這是 24 頁收集計畫，並非已存在的 24 份樣本。每頁只算一次；同一來源的畫質變體不得充當獨立真實頁數。
需保留 documentId，調參和最終驗收以來源文件分開，避免同文件內容洩漏。

## 候選來源查核（2026-10-30）

| 來源 | 用途與目前限制 |
| --- | --- |
| 使用者有權使用的去識別掃描文件 | 最接近實際用途；本次沒有取得文件或上傳公開授權 |
| [Taiwan-LegislativeYuanPublication](https://huggingface.co/datasets/andynoodles/Taiwan-LegislativeYuanPublication) | 掃描裁圖可作候選；標註來自模型及 OpenCC，不能直接當人工真值。需逐頁確認原始來源、授權及版面，不能把裁圖當完整頁 |
| [OCR Berrutti Dataset](https://github.com/camilomarino/ocr_berrutti_dataset) | 真實西語歷史文件與人工轉錄；可補外部控制組，但不能代替繁中／英文混合，也不能因程式庫公開就認定資料同為 MIT；另附資料授權 |
| [PureDocBench](https://github.com/zhihengli-casia/PureDocBench) | 程式 MIT、資料 CC BY 4.0；適合配對畫質實驗，內容源自 HTML/CSS，另列合成／翻拍組，不收進本真實內容基準 |
| [traditional-chinese-ocr-synthetic](https://huggingface.co/datasets/ZihCiLin/traditional-chinese-ocr-synthetic) | 合成且 CC BY-NC 4.0，不納入真實掃描基準 |

## 樣本格式

樣本及轉錄檔放在 manifest 所在目錄下；沒有來源授權的私人文件不要提交到公開儲存庫。
`manifest.local.json`、`private/` 與本機產出已排除於版本控制。樣本路徑不得跳出 manifest 目錄。

每筆 `samples` 必須有以下欄位（下面是格式示意，不能直接當成已校對資料）：

```json
{
  "id": "document-01-page-01",
  "documentId": "document-01",
  "sourceUrl": "https://原始來源/文件",
  "license": "實際資料授權與署名要求；非程式庫授權",
  "language": "chi_tra+eng",
  "layout": "two-column-off-center",
  "quality": "low-contrast",
  "acquisition": "physical-scan",
  "review": {"status": "human-reviewed", "reviewer": "實際校對者", "date": "2026-10-30"},
  "image": {"path": "private/page-01.png", "sha256": "64位實際SHA256"},
  "groundTruth": {"path": "private/page-01.gt.json", "sha256": "64位實際SHA256"}
}
```

`acquisition` 只接受 `physical-scan` 或 `camera`。請先由人工逐字核對原圖，再填校對紀錄。
工具驗證宣告與檔案完整性，無法自動證明來源權利或人工作業確曾完成。
ground truth JSON 為 `{"text":"完整原文", "fields":[{"id":"amount-1","value":"1,200"}], "blockOrder":["title","left-1","right-1"]}`。
欄位值、區塊與順序需由原圖標註；無該標註時省略欄位，報告會顯示未量測。

## 取得辨識輸出

以目前正式 UI 逐一跑自動、單欄與雙欄模式，保留**校對前**完整逐行結果，不可用 ground truth 覆寫後再評分。
記錄正式來源提交、瀏覽器版本、引擎／語言檔版本及 SHA-256、硬體、是否冷啟動。
使用相同頁面和語言。若來源是 PDF，先固定顯示方向與裁切，將實際 OCR 輸入影像另存並固定雜湊。
目前工具只評分輸出，不自動執行瀏覽器、不讀取私人工作區，也不自動把 OCR 行對應到真值區塊。

預測檔的頂層：`{"schemaVersion":1,"run":{"sourceCommit":"...","engine":"...","browser":"...","hardware":"...","languageData":"版本與雜湊"},"predictions":[...]}`。
每個樣本需三筆：`mode` 為 `auto`、`single-column`、`two-column`。
每筆有 `sampleId`、`mode`、`language`、`imageSha256`、`text`、`elapsedMs`、`peakMemoryBytes`、`coldStart`。
未量測的時間／記憶體與冷啟動填 `null`，不能填 0。量測記憶體時必須提供 `memoryScope`，例如 browser-process RSS；JS heap 不等於整個程序記憶體。
可選 `fields` 是以真值欄位 ID 對應的字串 map，`blockOrder` 是獨立核對映射後的辨識區塊 ID 陣列，保留重複／缺失；這兩項映射不得按 GT 排序或用 GT 值取代預測。

```sh
npm run test:ocr:benchmark
npm run ocr:benchmark -- tests/real-scans/manifest.local.json tests/real-scans/predictions.local.json tests/real-scans/report.local.json
```

## 指標與解讀

- 嚴格 CER：只統一 CRLF／CR 換行；以 Unicode code point 的 Levenshtein 距離除以真值字元數。保留大小寫、空白、符號、全半形；未作繁簡轉換。
- 舊 CER：直接沿用 `scans.mjs` 的 NFKC、去空白／標點／符號與小寫規則，不更改歷史數據。正規化後真值為空時保留舊分母 1 的規則；micro 合計也使用此有效分母。兩種 CER 都可能超過 1。
- 每模式 CER 為總編輯距離／總真值字元數（micro），不是頁 CER 的平均。跨語言／版面仍須看逐頁分層，不能只用單一總分選預設值。
- 關鍵欄位：精確相符數／真值欄位數，是欄位正確率，不是資訊檢索 precision。缺少與額外 ID 分開報告；沒有標註／預測就顯示未量測，不能說成 100%。這不是論文 Coverage@k 的重現。
- 閱讀順序：區塊序列編輯距離／真值區塊數，另報缺失、額外、重複及共同區塊的逆序率。沒有共同配對時逆序率是 null，不能以 0 假裝順序正確。這不是 OmniDocBench ROEdit 的同一實作。
- 程式會拒絕缺少任一模式、重複樣本／影像、輸入雜湊或語言不一致、未校對／合成來源、檔案雜湊不符。報告包含 manifest／預測檔 SHA-256 與來源文件數。

所有結果 informational；未設 CER pass/fail，未宣稱完成 24 頁驗收。
完整驗收還要核對 TXT／PDF 隱藏層順序與座標、漏字／重複、原圖像素不變、取消反應；本工具不代替現有瀏覽器功能測試。
