require("./fresh.js")();          // refuse to run against a stale copy
const {chromium} = require("playwright-core");
const path = require("path");
const bridge = `window.reccheckShortcuts={get:()=>Promise.resolve({profiles:[{id:"p1",name:"D",binds:{}}],active:"p1",
 seq:{keys:[],gap:25},focus:{on:true,needle:"PROT32"},tauEnter:{on:true,delay:50},boot:{on:true,available:true,running:true},available:true}),
 detect:()=>Promise.resolve(null),cancel:()=>Promise.resolve(true),clear:()=>Promise.resolve(true),
 helper:()=>Promise.resolve({state:"started"}),tauLog:()=>Promise.resolve(null),diag:()=>Promise.resolve(null),
 scan:()=>Promise.resolve(null),watchLog:()=>Promise.resolve(null),focusSet:()=>Promise.resolve({}),
 tauEnterSet:()=>Promise.resolve({}),bootSet:()=>Promise.resolve({on:true,available:true,running:true})};`;
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  const p = await b.newPage();
  await p.addInitScript(bridge);
  await p.addInitScript(() => { try{ localStorage.setItem("reccheck_moves_v2",
    JSON.stringify({"110":{20260826:{d:20260902,n:"MUELLER",seen:20260901}},
                    "116":{20260826:{d:20260902,n:"SCHAFERL",seen:20260901}}})); }catch(e){} });
  await p.setViewportSize({width:1100, height:760});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(350);
  let bad = 0; const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

  await p.evaluate(() => window.__t.showScreen("menu"));
  await p.waitForTimeout(200);
  ck("it is under OPTIONS", await p.evaluate(() => { const b=document.querySelector("#mLedger");
      return !!b && b.closest(".mcat").querySelector(".mcatBtn").id === "mcOptionsBtn"; }));
  ck("it shows what the ledger holds",
     /2 rooms, 2 stays/.test(await p.evaluate(() => document.querySelector("#mLedger .mSub").textContent)));

  await p.evaluate(() => { window.__t.openShortcuts(); });
  await p.waitForTimeout(400);
  ck("it is NOT in PROTEL SHORTCUTS any more",
     await p.evaluate(() => !document.querySelector("#scLedgerClear") && !document.querySelector("#scLedgerBox")));
  await p.evaluate(() => window.__t.closeModal());
  await p.waitForTimeout(200);

  // one click arms, does not clear
  await p.evaluate(() => document.querySelector("#mLedger").click());
  await p.waitForTimeout(150);
  ck("one click only arms it", await p.evaluate(() => /Sure\?/i.test(document.querySelector("#mLedger .mLabel").textContent)));
  ck("and the ledger is still there", await p.evaluate(() => !!localStorage.getItem("reccheck_moves_v2")));

  // second click clears
  await p.evaluate(() => document.querySelector("#mLedger").click());
  await p.waitForTimeout(200);
  ck("the second click clears it", await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") === null));
  ck("and it says so", /[Cc]leared/.test(await p.evaluate(() => document.querySelector("#mLedger .mSub").textContent)));
  ck("the label goes back", await p.evaluate(() => !/Sure\?/i.test(document.querySelector("#mLedger .mLabel").textContent)));
  ck("the page does not side-scroll",
     await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  await b.close();
})();
