import {test,expect} from './fixtures.mjs';
import {createFixtures} from '../support/pdfs.mjs';
import {inspectPdf} from '../support/ocr-pdf.mjs';
test('PDF inspection keeps its own page range when another document loads between page renders',{tag:'@compatibility'},async({page})=>{
 await page.goto('/');await expect(page.locator('#file-input')).toBeEnabled();const {sources}=await createFixtures();
 await page.evaluate(()=>{const digest=crypto.subtle.digest.bind(crypto.subtle);window.restoreInspectionDigest=()=>{crypto.subtle.digest=digest;};let first=true;crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(first){first=false;const {PDFDocument}=await import('/vendor/pdf-lib/pdf-lib.mjs'),pdfjs=await import('/vendor/pdfjs/pdf.mjs'),one=await PDFDocument.create();one.addPage([100,100]);window.otherInspectionTask=pdfjs.getDocument({data:await one.save(),isEvalSupported:false});await otherInspectionTask.promise;}return result;};});
 try{const pages=await inspectPdf(page,Buffer.from(sources.get('A').bytes));expect(pages).toHaveLength(2);expect(pages[1].text).toContain('SOURCE_A_PAGE_2');}finally{await page.evaluate(async()=>{restoreInspectionDigest();await window.otherInspectionTask?.destroy();});}
});
