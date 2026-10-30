const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const repo = path.resolve(__dirname, '../../..');
const { chromium } = require(path.join(repo, 'node_modules/playwright'));
const output = __dirname;
const preview = path.join(output, 'preview');
const results = { started: new Date().toISOString(), runtime: 'Chromium preview with mock API; no native conversion or OCR inference', steps: [], checks: {}, errors: [] };
const server = http.createServer((req,res) => {
  let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (name === '/') name = '/index.html';
  const file = path.resolve(preview, '.' + name);
  if (!file.startsWith(preview + path.sep)) {res.writeHead(403); return res.end();}
  try { const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}; res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file)); }
  catch {res.writeHead(404);res.end();}
});
function check(name,value){results.checks[name]=value;console.log(name+': '+JSON.stringify(value));}
(async()=>{
 await new Promise(resolve=>server.listen(4187,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1180,height:760},locale:'fr-FR',permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();
 page.on('pageerror',error=>results.errors.push(error.message));
 await page.emulateMedia({reducedMotion:'reduce'});
 async function shot(number,name){
  const file=`${String(number).padStart(2,'0')}-${name}.png`;
  await page.screenshot({path:path.join(output,'captures',file),fullPage:true});
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].filter(x=>x.getClientRects().length).map(x=>({name:x.getAttribute('aria-label')||x.textContent.trim(),w:Math.round(x.getBoundingClientRect().width),h:Math.round(x.getBoundingClientRect().height),disabled:x.disabled})),headings:[...document.querySelectorAll('h1,h2,h3')].filter(x=>x.getClientRects().length).map(x=>x.textContent)}));
  results.steps.push({number,name,file,metrics});console.log(`Captured ${number}: ${name}`);
 }
 async function goto(query=''){await page.goto('http://127.0.0.1:4187/'+query);await page.waitForTimeout(350);}

 for (const [width,height] of [[1180,760],[940,640],[1440,900]]) {
  await page.setViewportSize({width,height});await goto('?mockWelcomeSeen=1&mockSingleFile=1');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await page.locator('.format-card').first().click();
  check(`formatFooter-${width}x${height}`,await page.locator('.format-screen.is-active .screen-actions button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();let parent=el.parentElement,clips=[];while(parent){const c=getComputedStyle(parent),p=parent.getBoundingClientRect();if(/hidden|clip|auto/.test(c.overflowY)&&r.bottom>p.bottom)clips.push({className:parent.className,bottom:p.bottom});parent=parent.parentElement;}return {text:el.textContent,top:r.top,bottom:r.bottom,viewport:innerHeight,clippedBy:clips};})));
  await shot(width===1180?15:width===940?16:17,`formats-${width}x${height}`);
 }
 await page.setViewportSize({width:1180,height:760});await goto('?mockWelcomeSeen=1&mockLargeBatch=2000');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();
 const first=page.locator('.rail-button').first();await first.focus();const focusPath=[];
 for(let i=0;i<35;i++){await page.keyboard.press('Tab');await page.waitForTimeout(20);focusPath.push(await page.evaluate(()=>({tag:document.activeElement.tagName,className:document.activeElement.className,text:document.activeElement.textContent.slice(0,75),scroll:document.querySelector('.rail-scroll').scrollTop})));}
 check('keyboardVirtualRail',focusPath);
 await page.locator('.format-card').first().click();await shot(18,'application-lot');
 check('bulkApplyControls',await page.locator('.format-screen.is-active button').allTextContents());
 await goto('?mockWelcomeSeen=1&mockSingleFile=1');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await page.locator('.format-card').first().click();await page.getByRole('button',{name:'Lancer la conversion',exact:true}).click();await page.getByRole('button',{name:'Choisir un dossier',exact:true}).waitFor();await page.getByRole('button',{name:'Choisir un dossier',exact:true}).click();await page.waitForTimeout(300);await shot(19,'export');
 check('afterExportButtons',await page.locator('.progress-screen.is-active button').allTextContents());
 await goto('?mockWelcomeSeen=1&mockConversionFailure=once&mockSingleFile=1');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await page.locator('.format-card').first().click();await page.getByRole('button',{name:'Lancer la conversion',exact:true}).click();await page.getByRole('button',{name:'Réessayer',exact:true}).waitFor();
 check('errorDetailPresent',await page.getByText('Échec de conversion simulé',{exact:false}).count());check('errorRowText',await page.locator('.job-row').innerText());
 check('consoleErrors',results.errors);
 await browser.close();server.close();
 fs.writeFileSync(path.join(output,'preuves-interface-supplement.json'),JSON.stringify(results,null,2));
})().catch(error=>{results.failure=error.stack;fs.writeFileSync(path.join(output,'preuves-interface-supplement.json'),JSON.stringify(results,null,2));console.error(error);server.close();process.exitCode=1;});
