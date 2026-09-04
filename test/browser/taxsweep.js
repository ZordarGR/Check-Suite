require("./fresh.js")();          // refuse to run against a stale copy
const {chromium} = require("playwright-core");
const path = require("path");
const bridge = `window.reccheckShortcuts={get:()=>Promise.resolve({profiles:[],active:null,available:true}),helper:()=>Promise.resolve({state:"started"})};`;
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  for (const screen of ["menu","audit","tax","files","app"]) {
    for (const W of [420, 760, 909, 1600]) {
      const p = await b.newPage();
      await p.addInitScript(bridge);
      await p.setViewportSize({width: W, height: 620});
      await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
      await p.waitForTimeout(250);
      let note = "";
      try { await p.evaluate(s => window.__t.showScreen(s), screen); } catch(e){ note = " (showScreen threw)"; }
      if (screen === "tax") {
        // the tax half's own dialog
        await p.evaluate(() => { try { window.__taSimulate(20260901, 20260901); } catch(e){} }).catch(()=>{});
      }
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => {
        const de = document.documentElement;
        const bad = [];
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const q = el.getBoundingClientRect();
          if (q.width === 0) continue;
          if (el.id === "drawer" || el.closest("#drawer")) continue;   // parked off-screen by design
          if (q.right > de.clientWidth + 1)
            bad.push((el.id ? "#"+el.id : el.tagName.toLowerCase()) + " right=" + Math.round(q.right));
        }
        return {over: de.scrollWidth - de.clientWidth, bad: bad.slice(0,5)};
      });
      console.log(screen.padEnd(7) + String(W).padEnd(6) + (r.over > 0 ? "+" + r.over + " PAGE SIDE-SCROLLS" : "ok") + note);
      r.bad.forEach(x => console.log("        past the right edge: " + x));
      await p.close();
    }
  }
  await b.close();
})();
