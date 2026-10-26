# 安全問題回報

## 私人回報

如果你發現紙間可能外傳文件、執行文件內的程式、讓其他網站讀取草稿，或能繞過專案匯入的資源限制，請透過 [GitHub 私人漏洞回報](https://github.com/koviankevin/pdf-image-studio/security/advisories/new) 提交。這個儲存庫已啟用私人回報；需登入 GitHub，請在送出前確認頁面是 private vulnerability report。

請提供紙間版本／產物識別、瀏覽器類別、重現步驟、預期及實際影響，以及合成或去識別的最小範例。若使用站內診斷，先檢查內容；不要附上真實敏感文件、密碼、帳號憑證、原始錯誤堆疊或私人網址。

一般操作建議和非安全錯誤可使用 [公開 issue](https://github.com/koviankevin/pdf-image-studio/issues)。未修補漏洞細節請留在私人回報中，由維護者確認影響與修補後再協調公開。

## 維護範圍

優先檢查目前正式 GitHub Pages 版本。舊分頁可先從「版本與回報」確認產物識別；保存或下載專案備份後，再重新載入現行版本。不要為了排查先清空本機資料。

安全修補依問題影響選測並走現有發布閘門；需要回復版本時依 [發布與回復流程](docs/RELEASING.md) 處理。相依、CSP、本機資料與診斷的維護邊界見 [安全維護文件](docs/SECURITY-MAINTENANCE.md)。目前沒有提供固定回覆時間、SLA 或獎金方案。
