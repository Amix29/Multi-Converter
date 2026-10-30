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

 await goto();await page.getByRole('button',{name:'Suivant',exact:true}).click();await shot(20,'accueil-parametres');await page.getByRole('button',{name:'Suivant',exact:true}).click();await shot(21,'accueil-fin');await page.keyboard.press('Escape');
 await goto('?mockWelcomeSeen=1');await page.locator('[data-testid=feedback-launcher]').click();await page.getByRole('alertdialog').waitFor();await page.waitForTimeout(250);await shot(22,'confidentialite-signalement');check('feedbackPrivacyText',await page.locator('[role=dialog],[role=alertdialog]').innerText());
 const accept=page.locator('[role=alertdialog] .primary-button');await page.waitForTimeout(5100);await accept.click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(250);await shot(23,'signalement');
 await page.keyboard.press('Escape');await goto('?mockWelcomeSeen=1&mockUpdate=1');await page.getByRole('button',{name:'Paramètres',exact:true}).click();await page.waitForTimeout(500);await shot(24,'parametres-mise-a-jour');
 check('updateButtons',await page.locator('[role=dialog] button,[role=alertdialog] button').allTextContents());
 await page.keyboard.press('Escape');await page.setViewportSize({width:940,height:640});await goto('?mockWelcomeSeen=1&mockSingleFile=1');await page.getByRole('button',{name:'Parcourir',exact:true}).click();await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();await page.locator('.format-card').first().click();await page.mouse.wheel(0,1500);await page.waitForTimeout(300);check('footerAfterWheel940',await page.getByRole('button',{name:'Lancer la conversion',exact:true}).evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),rootScroll:document.documentElement.scrollHeight,bodyScroll:document.body.scrollHeight,scrollY,rootOffset:document.querySelector('#root').scrollTop})));await shot(25,'formats-min-apres-defilement');
 check('consoleErrors',results.errors);
 await browser.close();server.close();
 fs.writeFileSync(path.join(output,'preuves-interface-annexes.json'),JSON.stringify(results,null,2));
})().catch(error=>{results.failure=error.stack;fs.writeFileSync(path.join(output,'preuves-interface-annexes.json'),JSON.stringify(results,null,2));console.error(error);server.close();process.exitCode=1;});
