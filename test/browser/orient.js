/* THE PAGE ORIENTATION, proven by rendering to PDF and reading the MediaBox — the only
   way to see the shape of the printed page, not just the content. protel prints the
   Departure List by Time LANDSCAPE (his screenshot, 07/09; "i give you a landscape, why is
   it portrait?"), and thirteen columns do not fit a portrait page. Everything else the app
   prints — the corrections sheet, the Tax Check's warnings — is portrait.

   A NAMED @page (page:dlLand on #printSheet) was tried and does NOT hold: the element
   computes page:dlLand and Chromium's print still falls back to portrait Letter. So the
   orientation is a GLOBAL @page written into a <head> style by setPrintLandscape(), toggled
   by the beforeprint listener from the same intent that picks the sheet. This harness fails
   if that toggling breaks in any of the four directions. page.pdf() does not fire
   beforeprint, so the print stub dispatches it exactly as Electron's window.print() does. */
require("./fresh.js")();
const {chromium} = require("playwright-core");
const path = require("path"), fs = require("fs"), os = require("os");
const size = f => { const m=[...fs.readFileSync(f).toString("latin1").matchAll(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  const w=+m[0][1],h=+m[0][2]; return {s:Math.round(w)+"x"+Math.round(h), land:w>h}; };
const DEP={title:"Departure List by Time",listDate:"07/09/26",printed:"x 03:08",printedShort:"7/9/2026",station:"220067",
  hotel:"K",id:"departroom1time 2",page:"1",pages:1,guests:1,
  columns:[["room","Δωμάτιο"],["guest","Πελάτης"],["arr","Άφιξη"]].map(([key,head],i)=>({key,head,x:i*70})),
  groups:[{time:"16:35",rows:[{room:"210",type:"SSV",guest:"SECRET",arr:"03/09/26",notes:[]}]}],totals:[]};
const BRD={kind:"boarding",title:"Boarding List",id:"mealplandetail",station:"220067",hotel:"K",page:"1",printed:"x 03:55",printedShort:"7/9/2026",
  dayLabel:"\u0394\u03b5\u03c5, 07",dayArrDep:"54/39",dayTotals:{bf:"266",lunch:"6",dinner:"562",table:"552"},summe:{bf:"266",lunch:"6",dinner:"562",table:""},persLine:"270/195/2.760",
  rows:[{name:"\u2014",room:"201",bf:"1",lunch:"",dinner:"1",table:""},{name:"\u2014",room:"414-15",bf:"1",lunch:"",dinner:"2",table:""}]};
let bad=0; const ck=(l,ok)=>{ if(!ok)bad++; console.log("  "+(ok?"ok  ":"FAIL")+"  "+l); };
const tmp = () => path.join(os.tmpdir(), "rc-orient-"+Math.random().toString(36).slice(2)+".pdf");
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  const pg = await b.newPage();
  await pg.addInitScript(`window.reccheckFiles={list:()=>Promise.resolve({dir:"D",rel:"",dirs:[],files:[]}),read:()=>Promise.reject(new Error("x")),stat:()=>Promise.resolve(null),getDir:()=>Promise.resolve("D"),pickDir:()=>Promise.resolve(null),trash:()=>Promise.resolve(true),onDirEvent:()=>{}};
    window.print=function(){ window.dispatchEvent(new Event("beforeprint")); };`);
  await pg.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await pg.waitForTimeout(300);
  await pg.evaluate(() => { window.__t.setModel({reportDate:"7/9/2026",receipts:[]});
    window.__t.setState({receipts:{},extras:[{dept:"BAR",room:"305",guest:"X",sn:"7",v24:1,v13:0}]});
    window.__t.setStateKey("20260907"); });
  const shot = async () => { const f=tmp(); await pg.pdf({path:f,preferCSSPageSize:true,printBackground:true}); return size(f); };

  await pg.evaluate(d => window.__t.openDepPreview({name:"dep.oxps",path:"D/x",mtimeMs:Date.now()}, d), DEP);
  await pg.waitForTimeout(80); await pg.click("#pvGo"); await pg.waitForTimeout(200);
  ck("the departures sheet prints LANDSCAPE", (await shot()).land);

  // the BOARDING list is portrait (protel prints it so); its print must not be landscape
  await pg.evaluate(b => window.__t.openDepPreview({name:"boarding.oxps",path:"D/b",mtimeMs:Date.now()}, b, "board"), BRD);
  await pg.waitForTimeout(80); await pg.click("#pvGo"); await pg.waitForTimeout(200);
  const brd=await shot();
  ck("the boarding sheet prints portrait, not landscape", !brd.land);
  const noname=await pg.evaluate(()=>!/[A-Za-z]{3,}/.test((document.querySelector("#printSheet").innerText||"").replace(/Name|Breakfast|Lunch|Dinner|Table|Print Date|protel|Boarding List|Station|Pers|Arrivals|Departures|Inhouse|Guest names withheld|Summe fur Zeitraum|Kernos|Malia|mealplandetail|boarding|oxps/g,"")));
  ck("no guest name text on the boarding print", noname);

  await pg.evaluate(() => { document.querySelector("#printSheet").innerHTML=""; window.__t.printCorrections(); });
  await pg.waitForTimeout(80); await pg.click("#pvGo"); await pg.waitForTimeout(200);
  ck("the corrections sheet prints portrait", !(await shot()).land);

  await pg.evaluate(() => { document.body.classList.add("taxPrint");
    document.querySelector("#print-mount").innerHTML="<h1>TAX</h1>"; window.dispatchEvent(new Event("beforeprint")); });
  await pg.waitForTimeout(80);
  ck("a Tax Check print is portrait, even after a landscape one", !(await shot()).land);
  await pg.evaluate(() => document.body.classList.remove("taxPrint"));

  await pg.evaluate(d => window.__t.openDepPreview({name:"dep.oxps",path:"D/x",mtimeMs:Date.now()}, d), DEP);
  await pg.waitForTimeout(60); await pg.click("#pvGo"); await pg.waitForTimeout(120);
  await pg.evaluate(() => window.__t.showScreen("menu"));                    // clearPrintJob → clears orientation
  await pg.evaluate(() => { document.querySelector("#printSheet").innerHTML=""; window.__t.printCorrections(); });
  await pg.waitForTimeout(60); await pg.click("#pvGo"); await pg.waitForTimeout(120);
  ck("after leaving REPORTS, the next print is portrait", !(await shot()).land);

  await b.close();
  console.log(bad?"\n"+bad+" FAILED":"\nall pass"); process.exit(bad?1:0);
})();
