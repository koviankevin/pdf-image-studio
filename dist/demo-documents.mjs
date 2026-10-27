import {PDFDocument,rgb} from './vendor/pdf-lib/pdf-lib.mjs';
import {embedChineseFont} from './document-model.mjs?v=20261028-hub2';
import {checkpoint} from './cancellation.mjs';

export async function createDemoDocuments(kind,{signal}={}){
  const teacher=kind==='handout';if(!teacher&&kind!=='office')throw Error('找不到這個教學範例。');
  const specs=teacher?[
    ['紙間範例_課堂講義.pdf',[['課堂講義｜第一頁','先閱讀，再整理成自己的講義。','練習一：在主畫面選取兩頁，開啟 A4 拼版。'],['課堂講義｜第二頁','把兩頁排成一張 A4，保留原有文字與畫質。','練習二：調整間距，預覽後下載 PDF。']]],
    ['紙間範例_補充資料.pdf',[['補充資料','這一頁可以拖曳到其他頁面之間。','練習三：框選這段文字，複製清晰圖片。']]],
  ]:[
    ['紙間範例_會議資料.pdf',[['會議摘要','這是可自由試用的合成範例，沒有真實個人資料。','練習一：把會議摘要與附件合併為一份 PDF。'],['待辦事項','一、確認頁面順序。','二、在「文字／標記」新增日期或備註。']]],
    ['紙間範例_附件.pdf',[['會議附件','練習二：將附件拖曳到需要的位置。','練習三：預覽輸出，下載整理後的 PDF。']]],
  ];
  const files=[];
  for(const [name,pages]of specs){
    await checkpoint(signal);const doc=await PDFDocument.create(),font=await embedChineseFont(doc);await checkpoint(signal);
    for(const [index,lines]of pages.entries()){
      const page=doc.addPage([595.28,841.89]);page.drawRectangle({x:0,y:0,width:595.28,height:841.89,color:rgb(1,.996,.98)});
      page.drawRectangle({x:42,y:754,width:5,height:38,color:rgb(.23,.34,.52)});
      page.drawText(lines[0],{x:62,y:766,size:23,font,color:rgb(.18,.2,.23)});
      lines.slice(1).forEach((line,i)=>page.drawText(line,{x:50,y:690-i*55,size:15,font,color:rgb(.28,.29,.3)}));
      page.drawText('紙間示範文件｜可以安心編輯、刪除及下載',{x:50,y:82,size:11,font,color:rgb(.42,.42,.42)});
      page.drawText(String(index+1),{x:535,y:48,size:11,font,color:rgb(.42,.42,.42)});
      await checkpoint(signal);
    }
    doc.setTitle(teacher?'紙間講義整理範例':'紙間辦公整理範例');doc.setCreator('紙間');const bytes=await doc.save();await checkpoint(signal);
    files.push(new File([bytes],name,{type:'application/pdf'}));
  }
  return files;
}
