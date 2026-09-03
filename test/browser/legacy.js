const {chromium} = require("playwright-core");
const path = require("path");
const bridge = `window.reccheckShortcuts={get:()=>Promise.resolve({profiles:[{id:"p1",name:"D",binds:{}}],active:"p1",
 seq:{keys:[],gap:25},focus:{on:true,needle:"PROT32"},tauEnter:{on:true,delay:50},boot:{on:true,available:true,running:true},available:true}),
 detect:()=>Promise.resolve(null),cancel:()=>Promise.resolve(true),clear:()=>Promise.resolve(true),
 helper:()=>Promise.resolve({state:"started"}),tauLog:()=>Promise.resolve(null),diag:()=>Promise.resolve(null),
 scan:()=>Promise.resolve(null),watchLog:()=>Promise.resolve(null),focusSet:()=>Promise.resolve({}),
 tauEnterSet:()=>Promise.resolve({}),bootSet:()=>Promise.resolve({on:true,available:true,running:true})};`;
const vis = sel => `getComputedStyle(document.querySelector("${sel}")).display`;
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  const p = await b.newPage();
  await p.addInitScript(bridge);
  await p.setViewportSize({width:1280, height:760});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(300);
  let bad = 0;
  const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

  // default: legacy on, slot visible
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(150);
  ck("ships ON — the Rate Check slot is on screen",
     await p.evaluate(() => getComputedStyle(document.querySelector("#slot-rate")).display) !== "none");

  // it lives under OPTIONS on the menu screen, not in PROTEL SHORTCUTS
  await p.evaluate(() => window.__t.showScreen("menu"));
  await p.waitForTimeout(250);
  ck("it is under OPTIONS on the menu screen",
     await p.evaluate(() => { const b = document.querySelector("#mLegacy");
       return !!b && b.closest(".mcat").querySelector(".mcatBtn").id === "mcOptionsBtn"; }));
  await p.evaluate(() => { window.__t.openShortcuts(); });
  await p.waitForTimeout(400);
  ck("it is NOT in PROTEL SHORTCUTS any more",
     await p.evaluate(() => !document.querySelector("#scLegacyOn") && !document.querySelector("#scLegacyBox")));
  await p.evaluate(() => window.__t.closeModal());
  await p.waitForTimeout(150);
  ck("its label reads as an option, not a shortcut",
     /LEGACY MODE/i.test(await p.evaluate(() => document.querySelector("#mLegacy .mLabel").textContent)));

  // turn it off
  await p.evaluate(() => document.querySelector("#mLegacy").click());
  await p.waitForTimeout(200);
  const sub = await p.evaluate(() => document.querySelector("#mLegacy .mSub").textContent);
  ck("the item says which way it is set", /^off/i.test(sub));
  await p.evaluate(() => { window.__t.showScreen("tax"); });
  await p.waitForTimeout(200);
  ck("unticked -> the Rate Check slot is gone",
     await p.evaluate(() => getComputedStyle(document.querySelector("#slot-rate")).display) === "none");
  ck("the Tax Check slot is still there",
     await p.evaluate(() => getComputedStyle(document.querySelector("#slot-tax")).display) !== "none");
  ck("and the tax page still does not side-scroll",
     await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);

  // it survives a reload
  await p.reload();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(200);
  ck("still hidden after a restart",
     await p.evaluate(() => getComputedStyle(document.querySelector("#slot-rate")).display) === "none");

  // tick it again
  await p.evaluate(() => window.__t.showScreen("menu"));
  await p.waitForTimeout(250);
  await p.evaluate(() => document.querySelector("#mLegacy").click());
  await p.waitForTimeout(150);
  ck("and says so", /^on/i.test(await p.evaluate(() => document.querySelector("#mLegacy .mSub").textContent)));
  await p.evaluate(() => { window.__t.showScreen("tax"); });
  await p.waitForTimeout(200);
  ck("ticking it again brings the slot straight back",
     await p.evaluate(() => getComputedStyle(document.querySelector("#slot-rate")).display) !== "none");
  ck("the ledger key was never touched",
     await p.evaluate(() => localStorage.getItem("reccheck_moves_v2")) === null);

  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  await b.close();
})();
