# 版本發布與回復

1. 記錄差異基準與受影響流程；修改 `dist/product-core.mjs` 的版本／日期（功能交付才升版）。所有自有模組的快取版本需保持相容。
2. 修改完正式檔案後執行 `node scripts/release-manifest.mjs`。這會產生三份版本資訊；瀏覽器測試進行中不可覆寫 `dist/`。
3. 依 `tests/README.md` 選測並記錄來源 buildId、測試集合／環境／結果。`test:ci` 會驗證 manifest 與網站完整內容一致；修改正式檔案後必須重新產生。有效的既有結果可以沿用，必要 CI 門檻仍須滿足。
4. 檢查沒有私人文件、憑證或測試暫存加入版本控制。main 由既有 workflow 跑必要回歸及 Firefox／WebKit，再以同一 SHA 發布。PR 不發布，舊 SHA 不得覆蓋較新 main。
5. 確認 Actions 發布成功，核對正式 `release.json`／manifest 與該 SHA 的檔案，再在全新 context 驗收受影響流程。站內版本檢查不自動重載；需要保存成功，或在關閉保存時確認備份後才重載。

`release-manifest.json` 使用 UTF-8 文字 CRLF→LF、二進位原始位元組的規則；buildId 由全份資產清單計算，三份產生檔本身不參與雜湊，避免循環。它不包含 Git commit，Actions 與交付紀錄另外綁定 commit SHA。

## 回復版本

保留錯誤版本與重現步驟，找出最後一份已完成驗證的 SHA；以新 commit 回復造成問題的改動，不強制推送 main。重新產生該版本需要的 metadata、完成受影響測試並走相同發布閘門。若問題涉及資料格式，先驗證新草稿可由回復版本讀取，必要時先提供專案備份／匯出路徑；不能假設舊程式一定理解新資料。

正式回復仍須確認線上產物與該次 CI 來源相同。不要把重新執行舊 workflow 當作回復，因為過期 SHA 的發布保護會略過它，也不要移除發布閘門。
