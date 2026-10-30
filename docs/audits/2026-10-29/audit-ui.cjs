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
 await goto();await shot(1,'accueil');
 await page.keyboard.press('Escape');await shot(2,'fichiers-vides');
 await page.getByRole('button',{name:'Paramètres',exact:true}).click();await shot(3,'parametres');
 check('notificationsCheckboxName',await page.locator('input[type=checkbox]').evaluate(el=>({labels:[...el.labels].map(x=>x.textContent.trim()),ariaLabel:el.getAttribute('aria-label'),ariaLabelledby:el.getAttribute('aria-labelledby')})));
 check('modalBackground',await page.evaluate(()=>({inertCount:document.querySelectorAll('[inert]').length,navInert:document.querySelector('nav')?.closest('[inert]')!==null,navHidden:document.querySelector('nav')?.closest('[aria-hidden=true]')!==null})));
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Parcourir',exact:true}).click();await shot(4,'lot-importe');
 await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await shot(5,'formats');
 check('formatControls',await page.locator('.format-screen.is-active button').allTextContents());
 check('formatSearchLabel',await page.locator('.format-screen.is-active input').evaluateAll(els=>els.map(el=>({type:el.type,placeholder:el.placeholder,labels:[...(el.labels||[])].map(x=>x.textContent.trim()),ariaLabel:el.getAttribute('aria-label')}))));
 await goto('?mockWelcomeSeen=1&mockSingleFile=1&mockSlowConversion=1&mockConversionFailure=once');
 await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await page.locator('.format-card').first().click();await shot(6,'format-selectionne');
 await page.getByRole('button',{name:'Lancer la conversion',exact:true}).click();await page.waitForTimeout(300);await shot(7,'conversion-en-cours');
 await page.getByRole('button',{name:'Réessayer',exact:true}).waitFor();await shot(8,'erreur-conversion');
 await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('button',{name:'Exporter vers un dossier',exact:false}).waitFor({timeout:5000}).catch(()=>{});await page.waitForTimeout(1800);await shot(9,'conversion-terminee');
 check('resultControls',await page.locator('.progress-screen.is-active button').allTextContents());
 await goto('?mockWelcomeSeen=1&mockOcrImage=1');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Extraire le texte',exact:true}).click();await page.getByRole('textbox',{name:'Texte reconnu'}).waitFor();await shot(10,'ocr-resultat');
 await page.getByRole('button',{name:'Copier',exact:true}).click();check('ocrClipboard',await page.evaluate(()=>navigator.clipboard.readText()));await page.keyboard.press('Escape');
 await goto('?mockWelcomeSeen=1&mockUnsupportedFiles=1');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await shot(11,'formats-non-pris-en-charge');
 await page.setViewportSize({width:320,height:760});await shot(12,'mobile-320');check('overflow320',await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth})));
 await page.setViewportSize({width:1180,height:760});await goto('?mockWelcomeSeen=1&mockLargeBatch=2000');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.waitForTimeout(500);await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await shot(13,'grand-lot');
 check('virtualization',await page.locator('[data-testid=virtual-format-rail]').evaluate(el=>({total:el.dataset.totalCount,buttons:el.querySelectorAll('button').length,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,tabIndex:el.getAttribute('tabindex')})));
 await page.getByRole('button',{name:'Appliquer à tous les fichiers compatibles',exact:false}).count().then(n=>check('bulkApplyButton',n));
 check('visibleControlContrast',await page.locator('.format-screen.is-active .label,.format-screen.is-active .format-card small,.topbar .process-step').evaluateAll(els=>els.filter(el=>el.getClientRects().length).slice(0,15).map(el=>{const c=getComputedStyle(el);return {text:el.textContent.trim().slice(0,80),color:c.color,background:c.backgroundColor,fontSize:c.fontSize,fontWeight:c.fontWeight,parentBackground:getComputedStyle(el.parentElement).backgroundColor};})));
 await page.setViewportSize({width:1440,height:900});await goto('?mockWelcomeSeen=1&mockUpdate=1');await page.waitForTimeout(1200);await shot(14,'mise-a-jour');
 check('consoleErrors',results.errors);
 await browser.close();server.close();
 fs.writeFileSync(path.join(output,'preuves-interface.json'),JSON.stringify(results,null,2));
})().catch(error=>{results.failure=error.stack;fs.writeFileSync(path.join(output,'preuves-interface.json'),JSON.stringify(results,null,2));console.error(error);server.close();process.exitCode=1;});
