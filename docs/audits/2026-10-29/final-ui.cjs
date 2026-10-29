const fs = require('node:fs');
let source = fs.readFileSync(__dirname + '/annexes-ui.cjs', 'utf8');
const start = source.indexOf(" await goto();await page.getByRole");
const end = source.indexOf(" check('consoleErrors'");
source = source.slice(0, start) + `
 await goto('?mockWelcomeSeen=1&mockLargeBatch=2000');
 await page.getByRole('button',{name:'Parcourir',exact:true}).click();
 await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();
 await page.locator('[data-testid=virtual-format-rail]').waitFor();
 await page.waitForTimeout(500);
 await shot(13,'grand-lot');
 await goto('?mockWelcomeSeen=1&mockSingleFile=1');
 await page.getByRole('button',{name:'Parcourir',exact:true}).click();
 await page.getByRole('button',{name:'Préparer la conversion',exact:true}).click();
 await page.locator('.format-card').first().click();
 await page.getByRole('button',{name:'Lancer la conversion',exact:true}).click();
 await page.getByRole('button',{name:'Choisir un dossier',exact:true}).click();
 await page.getByRole('button',{name:'Ouvrir le dossier',exact:true}).waitFor();
 await page.waitForTimeout(200);
 check('exportButtonHitTest', await page.getByRole('button',{name:'Ouvrir le dossier',exact:true}).evaluate(el=>{
  const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {rect:r.toJSON(),hit:hit?.outerHTML.slice(0,400),clickable:el===hit||el.contains(hit)};
 }));
` + source.slice(end);
source = source.replaceAll('preuves-interface-annexes.json','preuves-interface-final.json');
eval(source);
