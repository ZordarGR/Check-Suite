/* THE EXACT PRINT, through the real page in Chromium (1.17.59). His ask, 08/09:
   "everything ... an exact protel document print with the sole exclusion of the names".
   What it holds the line on: REPORTS' preview of a departure list that carries its pages
   shows protel's pages themselves (two of them), the note beside the paper says what was
   cut, no fixture name is anywhere in the preview or on the print root; Print arms the
   job and the PDF has exactly TWO pages, both A4 landscape, edge to edge (no third blank
   page from a rounding overflow — the sheet is sized to the page); a departure list
   WITHOUT pages still prints the tabular sheet; and the corrections print after it is
   portrait again with its margins. page.pdf() does not fire beforeprint, so the print stub
   dispatches it as Electron's window.print() does. */
require("./fresh.js")();
const {chromium} = require("playwright-core");
const path = require("path"), fs = require("fs"), os = require("os");
const {PAGE1, PAGE2, NAMES} = require("../fixtures/dep0809.js");
const src = fs.readFileSync(path.resolve(__dirname, "..", "..", "app", "index.html"), "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n); let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };
const line = re => { const m = src.match(re); if(!m) throw new Error(String(re)); return m[0]; };
const P = new Function("xmls", [line(/^const SPLIT_GAP = .*$/m), line(/^const DEFAULT_ADV = .*$/m), line(/^const DEPLIST_HEAD = [\s\S]*?\];$/m),
  lift("xmlDecode"), lift("parseIndices"), lift("pageTokens"), lift("parseDepList")].join("\n") + "\nreturn parseDepList(xmls);")([PAGE1, PAGE2]);
const boxes = f => [...fs.readFileSync(f).toString("latin1").matchAll(/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => ({w: +m[1], h: +m[2]}));
let bad = 0; const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
const tmp = () => path.join(os.tmpdir(), "rc-exact-" + Math.random().toString(36).slice(2) + ".pdf");
(async () => {
  const b = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"]});
  const pg = await b.newPage({viewport: {width: 1400, height: 900}});
  pg.on("pageerror", e => console.log("  page error: " + e.message));
  await pg.addInitScript(`window.reccheckFiles={list:()=>Promise.resolve({dir:"D",rel:"",dirs:[],files:[]}),read:()=>Promise.reject(new Error("x")),stat:()=>Promise.resolve(null),getDir:()=>Promise.resolve("D"),pickDir:()=>Promise.resolve(null),trash:()=>Promise.resolve(false),onDirEvent:()=>{}};
    window.print=function(){ window.dispatchEvent(new Event("beforeprint")); };`);
  await pg.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await pg.waitForTimeout(300);
  const f = {name: "dep.oxps", path: "D/dep.oxps", mtimeMs: Date.now()};
  const hasName = s => NAMES.some(n => String(s).indexOf(n) >= 0);

  await pg.evaluate(([f, p, pages]) => window.__t.openDepPreview(f, p, "dep", {pages, fonts: {}}), [f, P, [PAGE1, PAGE2]]);
  await pg.waitForTimeout(150);
  const pv = await pg.evaluate(() => ({
    pages: document.querySelectorAll("#pvPaper .xpsPage").length, svgs: document.querySelectorAll("#pvPaper svg").length,
    note: (document.querySelector(".pvNote") || {}).textContent || "", text: document.querySelector("#pvPaper").textContent,
    dashes: (document.querySelector("#pvPaper").textContent.match(/—/g) || []).length,
    wide: document.querySelector("#modal").classList.contains("land"),
    fits: document.querySelector("#pvPaper svg").getBoundingClientRect().width <= document.querySelector("#pvPaper").getBoundingClientRect().width + 1}));
  ck("the preview shows protel's two pages, as SVG",                    pv.pages === 2 && pv.svgs === 2);
  ck("the note beside the paper says how many characters were cut",   /\b\d+ characters withheld|\d+ χαρακτήρες/.test(pv.note) && !/could not be placed|cannot draw/.test(pv.note));
  ck("no fixture name in the preview; nine dashes; the page fits the modal", !hasName(pv.text) && pv.dashes === 9 && pv.wide && pv.fits);
  ck("everything else is on it — 427-2, the page numbers, departroom1time 2, Σύνολο", /427-2/.test(pv.text) && /Σελίδα/.test(pv.text) && /departroom1time 2/.test(pv.text) && /Σύνολο Ατόμων/.test(pv.text));

  /* THE BACKUP PRINT (1.17.66, reshaped 1.17.67). His ask, 10/09: "a backup print for the lists
     just like protel would print them ... in case a colleague fucks up and i see it too late" —
     then, shown that protel clips a wrapped name: "let's not do that though ... lets fit
     everything". A "With names" button on the redacted preview flips it to the TABULAR sheet
     with the names in full, wrapping in their cell; "Without names" flips back to protel's
     page; nothing is armed by the flip. */
  ck("the redacted preview offers With names",                        await pg.evaluate(() => !!document.querySelector("#pvNames") && !window.__t.armedPrint()));
  await pg.click("#pvNames"); await pg.waitForTimeout(150);
  const nv = await pg.evaluate(() => {
    const cells = [...document.querySelectorAll("#pvPaper .dlName")];
    const wrapped = cells.filter(c => c.getBoundingClientRect().height > 1.6 * parseFloat(getComputedStyle(c).fontSize)).length;
    const rows = cells.map(c => c.closest("tr"));
    const fits = cells.every(c => { const r = c.getBoundingClientRect(), t = c.closest("table").getBoundingClientRect(); return r.right <= t.right + 1; });
    return {pages: document.querySelectorAll("#pvPaper .xpsPage").length, dl: !!document.querySelector("#pvPaper .dlTbl"), title: document.querySelector("#modal h3").textContent,
      note: (document.querySelector(".pvNote") || {}).textContent || "", text: document.querySelector("#pvPaper").textContent,
      names: cells.map(c => c.textContent), namesHtml: cells.map(c => c.innerHTML), dashes: (document.querySelector("#pvPaper").textContent.match(/—/g) || []).length,
      btn: (document.querySelector("#pvNames") || {}).textContent || "", armed: !!window.__t.armedPrint(), wrapped, fits,
      foot: (document.querySelector("#pvPaper .dlFoot") || {}).textContent || ""}; });
  ck("With names: the tabular sheet, not protel's page; every fixture name in a guest cell; no dash", nv.dl && nv.pages === 0 && NAMES.every(n => nv.names.some(c => c.indexOf(n) >= 0)) && nv.dashes === 0);
  ck("253's wrapped second line is on 253's cell, its own line, and not on 270's", nv.namesHtml.some(c => /MU\/HO<br>TYA/.test(c)) && !nv.names.some(c => /TYA.*KOV/.test(c)));
  ck("every name cell stays inside the table, none cut",                nv.fits && nv.names.every(c => c.trim().length > 0));
  ck("the title says WITH NAMES, the note and the foot say backup",     /WITH NAMES|ΜΕ ΟΝΟΜΑΤΑ/.test(nv.title) && /Backup|Εφεδρική/.test(nv.note) && /Backup|Εφεδρική/.test(nv.foot) && !/withheld|αφαιρέθηκαν/.test(nv.note));
  ck("the button now reads Without names, and nothing is armed",        /Without names|Χωρίς ονόματα/.test(nv.btn) && !nv.armed);
  ck("everything else still on it — 427-2, the ΩΡΑ bands, Σύνολο",      /427-2/.test(nv.text) && /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ/.test(nv.text) && /Σύνολο Ατόμων/.test(nv.text));
  await pg.click("#pvNames"); await pg.waitForTimeout(150);
  const bk = await pg.evaluate(() => ({text: document.querySelector("#pvPaper").textContent, dashes: (document.querySelector("#pvPaper").textContent.match(/—/g) || []).length, title: document.querySelector("#modal h3").textContent}));
  ck("Without names: back to the redacted page, nine dashes, no name",  !hasName(bk.text) && bk.dashes === 9 && !/WITH NAMES|ΜΕ ΟΝΟΜΑΤΑ/.test(bk.title));

  await pg.click("#pvGo"); await pg.waitForTimeout(250);
  const armed = await pg.evaluate(() => { const j = window.__t.armedPrint(); return j && j.kind === "dep" && !!j.xps; });
  ck("Print arms the exact job",                                        armed);
  const pdf = tmp(); await pg.pdf({path: pdf, preferCSSPageSize: true, printBackground: true});
  const bx = boxes(pdf);
  ck("the PDF is exactly two pages, no blank third",                    bx.length === 2);
  ck("both A4 landscape, edge to edge",                                 bx.every(x => Math.round(x.w) === 842 && Math.round(x.h) === 595));
  await pg.emulateMedia({media: "print"});
  const pr = await pg.evaluate(() => { const s = document.querySelector("#printSheet"); const pgs = [...s.querySelectorAll(".xpsPage")];
    return {vis: getComputedStyle(s).display, n: pgs.length, w: pgs.map(x => Math.round(x.getBoundingClientRect().width)), h: pgs.map(x => Math.round(x.getBoundingClientRect().height)), text: s.textContent, dl: !!s.querySelector(".dlTbl")}; });
  await pg.emulateMedia({media: null});   // back to the default: an explicit "screen" would make page.pdf() ignore the print rules
  ck("under print media the print root holds the two pages, each 297×210mm, and no table", pr.vis === "block" && pr.n === 2 && pr.w.every(w => Math.abs(w - 1123) <= 2) && pr.h.every(h => Math.abs(h - 794) <= 2) && !pr.dl);
  ck("no fixture name on the print root",                               !hasName(pr.text) && /Σύνολο Δωματίων/.test(pr.text));

  /* and the backup print itself: what he previewed WITH names is what goes on paper */
  await pg.evaluate(([f, p, pages]) => window.__t.openDepPreview(f, p, "dep", {pages, fonts: {}}), [f, P, [PAGE1, PAGE2]]);
  await pg.waitForTimeout(150);
  await pg.click("#pvNames"); await pg.waitForTimeout(150);
  await pg.click("#pvGo"); await pg.waitForTimeout(250);
  ck("Print from the names preview arms the job WITH names",            await pg.evaluate(() => { const j = window.__t.armedPrint(); return !!(j && j.kind === "dep" && j.xps && j.names === true); }));
  const npdf = tmp(); await pg.pdf({path: npdf, preferCSSPageSize: true, printBackground: true});
  const nbx = boxes(npdf);
  ck("the backup prints landscape with the sheet's margins",           nbx.length >= 1 && nbx.every(x => x.w > x.h) && /margin:10mm/.test(await pg.evaluate(() => document.getElementById("dlOrient").textContent)));
  await pg.emulateMedia({media: "print"});
  const npr = await pg.evaluate(() => { const s = document.querySelector("#printSheet"); return {x: s.querySelectorAll(".xpsPage").length, dl: !!s.querySelector(".dlTbl"), text: s.textContent, dashes: (s.textContent.match(/—/g) || []).length}; });
  await pg.emulateMedia({media: null});
  ck("the print root is the tabular sheet with every name and no dash", npr.dl && npr.x === 0 && NAMES.every(n => npr.text.indexOf(n) >= 0) && npr.dashes === 0);
  /* and the redacted print after it is redacted again — the flag lives on the job, not on the page */
  await pg.evaluate(([f, p, pages]) => window.__t.openDepPreview(f, p, "dep", {pages, fonts: {}}), [f, P, [PAGE1, PAGE2]]);
  await pg.waitForTimeout(150);
  await pg.click("#pvGo"); await pg.waitForTimeout(250);
  await pg.emulateMedia({media: "print"});
  const rpr = await pg.evaluate(() => { const s = document.querySelector("#printSheet"); return {text: s.textContent, dashes: (s.textContent.match(/—/g) || []).length, x: s.querySelectorAll(".xpsPage").length}; });
  ck("and it is drawn as pages, not as the table",                      rpr.x === 2);
  await pg.emulateMedia({media: null});
  ck("the next redacted print is protel's page again: no name, nine dashes", !hasName(rpr.text) && rpr.dashes === 9);

  /* a departure list that carries no pages: the tabular sheet, as before */
  await pg.evaluate(() => window.__t.closeModal());
  await pg.evaluate(([f, p]) => window.__t.openDepPreview(f, p, "dep"), [f, P]);
  await pg.waitForTimeout(100);
  const fb = await pg.evaluate(() => ({dl: !!document.querySelector("#pvPaper .dlTbl"), x: document.querySelectorAll("#pvPaper .xpsPage").length, note: !!document.querySelector(".pvNote"), text: document.querySelector("#pvPaper").textContent}));
  ck("without pages the tabular sheet is still the preview, no note",   fb.dl && fb.x === 0 && !fb.note && !hasName(fb.text));
  await pg.click("#pvGo"); await pg.waitForTimeout(200);
  const fpdf = tmp(); await pg.pdf({path: fpdf, preferCSSPageSize: true, printBackground: true});
  ck("the tabular sheet still prints landscape with its margins",      boxes(fpdf).length >= 1 && boxes(fpdf)[0].w > boxes(fpdf)[0].h && /margin:10mm/.test(await pg.evaluate(() => document.getElementById("dlOrient").textContent)));

  /* the corrections after it: portrait, and the exact page's zero margin is gone */
  await pg.evaluate(() => { window.__t.setModel({reportDate: "8/9/2026", receipts: []}); window.__t.setState({receipts: {}, extras: [{dept: "BAR", room: "305", guest: "X", sn: "7", v24: 1, v13: 0}]}); window.__t.setStateKey("20260908"); });
  await pg.evaluate(() => window.__t.printCorrections()); await pg.waitForTimeout(100); await pg.click("#pvGo"); await pg.waitForTimeout(250);
  const cpdf = tmp(); await pg.pdf({path: cpdf, preferCSSPageSize: true, printBackground: true});
  const cb = boxes(cpdf);
  ck("the corrections print after it is portrait again",                cb.length >= 1 && cb[0].h > cb[0].w);
  const orient = await pg.evaluate(() => (document.getElementById("dlOrient") || {}).textContent || "");
  ck("and the zero margin did not outlive the exact job",               !/margin:0/.test(orient));
  await b.close();
  console.log(bad ? "\n" + bad + " FAILED" : "\nall pass");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
