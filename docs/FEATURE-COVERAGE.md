# 紙間功能與自動驗收範圍

這份清單逐項對照目前 32 個工具入口及會實際操作對應控制項的驗收案例。它表示安排了哪些檢查，當次是否成功以 [GitHub Actions](https://github.com/koviankevin/pdf-image-studio/actions/workflows/tests.yml) 紀錄為準。

網頁的「所有功能與狀態」依本機文件、勾選頁與操作狀態提示可用條件，沒有加入使用者行為追蹤。可開啟不等於輸出內容已經驗收；保留原有輸出前預覽流程。

基準：45472609c0b9f966add9fd3a481a83521508905e。公開工具應先登錄名錄，再提供入口、前置條件與實際控制項的驗收對照。

## 加入與保存

| 功能入口 | 使用範圍 | 實際操作驗收 |
| --- | --- | --- |
| 加入 PDF／圖片 (`import`) | 多檔加入、圖片轉 PDF；加密 PDF 會提示輸入密碼。 | [multi-pdf.spec.mjs](../tests/browser/multi-pdf.spec.mjs)、[tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs)、[autosave.spec.mjs](../tests/browser/autosave.spec.mjs) |
| 圖片轉 PDF 設定 (`image-import`) | A4 或原尺寸、方向與留白，套用於接著加入的圖片。 | [tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs) |
| 工作區與專案備份 (`workspaces`) | 新增、切換工作區；下載或匯入專案接續編輯。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs)、[productivity-regression.spec.mjs](../tests/browser/productivity-regression.spec.mjs) |
| 自動儲存與草稿 (`autosave`) | 查看本機儲存狀態、立即儲存及草稿管理。 | [autosave.spec.mjs](../tests/browser/autosave.spec.mjs) |
| 我的工作範本 (`templates`) | 保存常用輸出、頁碼與 A4 版型設定。 | [studio.spec.mjs](../tests/browser/studio.spec.mjs) |
| 預覽合併 PDF (`pdf-preview`) | 依目前勾選頁序檢查輸出，再下載新 PDF。 | [multi-pdf.spec.mjs](../tests/browser/multi-pdf.spec.mjs)、[workflow.spec.mjs](../tests/browser/workflow.spec.mjs) |
| 下載新 PDF (`pdf-download`) | 合併目前選取頁與已儲存的裁切、文字和 OCR。 | [multi-pdf.spec.mjs](../tests/browser/multi-pdf.spec.mjs)、[native-text.spec.mjs](../tests/browser/native-text.spec.mjs)、[replacement.spec.mjs](../tests/browser/replacement.spec.mjs) |

## 頁面整理

| 功能入口 | 使用範圍 | 實際操作驗收 |
| --- | --- | --- |
| 選頁、排序與移動 (`page-order`) | 勾選頁碼、拖曳排序或輸入移動位置。 | [multi-pdf.spec.mjs](../tests/browser/multi-pdf.spec.mjs) |
| 復原／重做 (`undo`) | 保留整理、文字與排版操作的復原入口及快捷鍵。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs)、[workflow.spec.mjs](../tests/browser/workflow.spec.mjs) |
| 複製頁面 (`duplicate`) | 在原頁後加入副本，保留頁面編輯。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs) |
| 插入空白頁 (`blank`) | 選 A4 方向，再插入空白頁。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs) |
| 替換單頁 (`replace-page`) | 以另一份 PDF 的指定頁或圖片取代勾選單頁。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs)、[productivity-regression.spec.mjs](../tests/browser/productivity-regression.spec.mjs) |
| 旋轉與裁切 (`crop`) | 調整單頁方向與可見範圍，也能批次套用。 | [studio.spec.mjs](../tests/browser/studio.spec.mjs)、[productivity-regression.spec.mjs](../tests/browser/productivity-regression.spec.mjs)、[replacement.spec.mjs](../tests/browser/replacement.spec.mjs)、[safety-performance.spec.mjs](../tests/browser/safety-performance.spec.mjs) |
| 拆分 PDF (`split`) | 每頁一份，或依自訂範圍拆成多份。 | [tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs) |
| 頁碼／頁首頁尾 (`labels`) | 為勾選頁批次加入頁碼與文字。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs) |
| 比對兩份 PDF (`compare`) | 逐頁比對畫面差異，可掃描全部或停止。 | [studio.spec.mjs](../tests/browser/studio.spec.mjs)、[studio-performance.spec.mjs](../tests/browser/studio-performance.spec.mjs) |

## 文字編輯與辨識

| 功能入口 | 使用範圍 | 實際操作驗收 |
| --- | --- | --- |
| 原文編輯 (`native`) | 修改 Word 類 PDF 的單行原文區塊；字型可能不同。 | [native-text.spec.mjs](../tests/browser/native-text.spec.mjs) |
| 掃描文字替換 (`replace-text`) | 框住舊字，以底色與新文字覆蓋外觀。 | [replacement.spec.mjs](../tests/browser/replacement.spec.mjs) |
| 文字／螢光筆／箭頭／方框 (`annotations`) | 加註、移動、刪除與復原標記。 | [tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs)、[autosave.spec.mjs](../tests/browser/autosave.spec.mjs)、[workflow.spec.mjs](../tests/browser/workflow.spec.mjs) |
| 中文 OCR／擷取文字 (`ocr`) | 自動擷取或強制辨識，支援一般、單欄與雙欄。 | [scanned-ocr.spec.mjs](../tests/browser/scanned-ocr.spec.mjs)、[scan-conditions.spec.mjs](../tests/browser/scan-conditions.spec.mjs)、[two-column-ocr.spec.mjs](../tests/browser/two-column-ocr.spec.mjs) |
| 檢視／校對辨識文字 (`ocr-review`) | 辨識完成後校對、複製或加入可搜尋 PDF。 | [scanned-ocr.spec.mjs](../tests/browser/scanned-ocr.spec.mjs)、[two-column-ocr.spec.mjs](../tests/browser/two-column-ocr.spec.mjs) |
| 框選區域 OCR (`regional-ocr`) | 開啟框選，拖曳後選「辨識框選區域的文字」。 | [safety-performance.spec.mjs](../tests/browser/safety-performance.spec.mjs)、[ease.spec.mjs](../tests/browser/ease.spec.mjs) |
| 搜尋文件文字 (`search`) | 搜尋原文、OCR 與新增文字，點結果定位頁面。 | [productivity.spec.mjs](../tests/browser/productivity.spec.mjs)、[productivity-regression.spec.mjs](../tests/browser/productivity-regression.spec.mjs)、[native-text.spec.mjs](../tests/browser/native-text.spec.mjs) |

## 圖片與截圖

| 功能入口 | 使用範圍 | 實際操作驗收 |
| --- | --- | --- |
| 框選複製／下載 (`capture`) | 拖曳選取局部，依 DPI 與長邊設定輸出圖片。 | [tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs)、[safety-performance.spec.mjs](../tests/browser/safety-performance.spec.mjs) |
| 高解析度圖片 (`images`) | PNG／JPG、DPI、長邊上限與常用方案。 | [multi-pdf.spec.mjs](../tests/browser/multi-pdf.spec.mjs)、[workflow.spec.mjs](../tests/browser/workflow.spec.mjs) |
| 預估圖片大小 (`estimate`) | 依目前圖片設定估算檔案大小。 | [tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs) |
| 圖片預覽／全部下載 (`image-download`) | 轉換後預覽、複製圖片或下載 ZIP。 | [tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs)、[multi-pdf.spec.mjs](../tests/browser/multi-pdf.spec.mjs) |

## A4 排版

| 功能入口 | 使用範圍 | 實際操作驗收 |
| --- | --- | --- |
| A4 拼版 (`impose`) | 多頁拼成一張，調整格數、方向、間距與頁序。 | [imposition.spec.mjs](../tests/browser/imposition.spec.mjs) |
| A4 自由排版 (`free-layout`) | 多張紙、框選片段、標題、多選對齊與磁吸。 | [workflow.spec.mjs](../tests/browser/workflow.spec.mjs)、[ease.spec.mjs](../tests/browser/ease.spec.mjs)、[ease-performance.spec.mjs](../tests/browser/ease-performance.spec.mjs) |

## 說明與檢查

| 功能入口 | 使用範圍 | 實際操作驗收 |
| --- | --- | --- |
| 使用說明與範例 (`help`) | 教師、辦公兩種操作路線與合成示範文件。 | [product.spec.mjs](../tests/browser/product.spec.mjs) |
| 資料管理 (`storage`) | 查看本機工作區、儲存空間與備份狀態。 | [product.spec.mjs](../tests/browser/product.spec.mjs) |
| 版本與問題診斷 (`diagnostics`) | 核對網站版本，預覽不含文件內容的診斷。 | [product.spec.mjs](../tests/browser/product.spec.mjs) |

## 盤點補強

[tool-coverage.spec.mjs](../tests/browser/tool-coverage.spec.mjs) 補驗圖片轉 PDF 尺寸、逐頁及指定範圍拆分 ZIP、JPG 容量預估與圖片 ZIP、框選複製 PNG 的尺寸／DPI、權限失敗提示，以及文字、螢光筆、箭頭和方框的實際 PDF 畫面。

[tool-hub.spec.mjs](../tests/browser/tool-hub.spec.mjs) 核對全部入口、前置條件、搜尋與定位、三種原文直接入口及手機版面，並確認導航不誤寫文件草稿。

[tool-catalog.test.mjs](../tests/unit/tool-catalog.test.mjs) 要求名錄中的每項工具都有分類、目標、測試與清單記錄，且所列測試實際提到對應控制項；單純指定一個存在的檔案不算完成對照。

[pdf-inspection.spec.mjs](../tests/browser/pdf-inspection.spec.mjs) 驗證讀頁檢查不受另一份不同頁數文件干擾，原有像素與文字斷言保持不變。自動化仍不取代真人、實機剪貼簿授權及複雜文件校對。
