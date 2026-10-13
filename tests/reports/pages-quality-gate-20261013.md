# Pages 品質閘門驗證（2026-10-13）

## 基線與改動

基線 main：`d64dd5f7bb72d68a56278e251eadab04b7cba27f`（PR #6）。
既有測試與 Pages 皆成功，但分別於 05:24:20Z、05:21:17Z 完成，網站先於測試發布。

- [既有測試](https://github.com/koviankevin/pdf-image-studio/actions/runs/38350918334)
- [既有部署](https://github.com/koviankevin/pdf-image-studio/actions/runs/38350918455)
- [本次 PR #7](https://github.com/koviankevin/pdf-image-studio/pull/7)

選用單一 workflow + needs，刪除獨立發布入口，不使用跨 workflow 的 workflow_run、
完成事件搜尋或跨 run artifact 下載。PR 自動測試保留，main 手動發布亦須經完整回歸。
部署使用測試的 github.sha；Pages 寫入權限限部署 job。
發布鎖內檢查 main HEAD，過期提交略過，API 失敗則停止。

## 正式 YAML 契約驗證

`npm run test:ci`：53/53 通過。包含 48 組事件、ref、regression result 組合，
直接由官方 @actions/expressions 求值正式 workflow 的 if 表達式。
另驗證 mandatory steps／needs、權限、SHA、artifact 名稱、concurrency 與 HEAD 檢查。
本機既有 Node 測試：11/11 通過。正式 dist 與既有 unit/browser/support 測試皆未更動。
本機 Chromium 安裝遇到不完整下載，完整瀏覽器回歸以 PR 最終提交的 GitHub Actions 為準。

## GitHub 實際排程演練

演練提交：`d35236d94d1fc34c86dd144648cb1d5fa485c1fc`。
[演練 run](https://github.com/koviankevin/pdf-image-studio/actions/runs/38399112011)
／[驗證 job](https://github.com/koviankevin/pdf-image-studio/actions/runs/38399112011/job/115301942858)。

暫時 workflow 從正式 deploy job 複製 needs 與 if，僅替換依賴 job 名稱，
並以固定 main／push fixture 取代事件 context。上游兩個步驟用 exit 0／exit 1
模擬 Node、Chromium 的成功或失敗；下游使用無副作用的 publication sentinel。
這是 GitHub runner 實際執行及排程的 dependency 測試，並非實際 OCR 失敗或 Pages API 發布。

| 情境 | Node fixture | Chromium fixture | 發布 sentinel |
| --- | --- | --- | --- |
| 全部成功 | success | success | success |
| Node 失敗 | failure | skipped | skipped |
| Chromium 失敗 | success | failure | skipped |

`verify` job 核對六個 job 的實際結果，結果 **success**。
整個演練 run 顯示 failure 是刻意注入兩個上游失敗的預期結果，不代表此 PR 回歸測試失敗。
演練沒有 Pages 寫入權限、沒有呼叫部署 action、沒有變更正式網站；收集證據後移除暫時 workflow。

## 邊界與合併後確認

PR 的正式部署 job 應為 skipped；最終提交的完整 regression 應通過，詳見 PR checks。
此 PR 不自行合併，production Pages API／environment 的整合尚須合併後驗證：
確認同一 run 的 regression 成功後才進入 Publish tested website，且 checkout SHA 與該 main 提交一致。
手動測試請於 Regression tests 選 main；任何失敗會保留先前已發布網站。
不要將演練成功描述為 production 網站已發布。沒有修改 A4、OCR 功能或降低既有覆蓋率。
