require("./fresh.js")();          // refuse to run against a stale copy
const {chromium} = require("playwright-core");
const path = require("path");
/* REPORTS is swept with a FILE BRIDGE, or it is not swept at all: without
   window.reccheckFiles, renderReports takes its first early return and #repList holds one
   line of text — "Only inside the desktop app." — which of course fits at every width.
   This screen has been in the loop since 1.17.50 and had never had a row measured. The
   folder name is deliberately long and unbroken: that is what escapes a column. */
const bridge = `window.reccheckShortcuts={get:()=>Promise.resolve({profiles:[],active:null,available:true}),helper:()=>Promise.resolve({state:"started"})};
window.reccheckFiles={
  list:(pr,rel)=>Promise.resolve({dir:"D:\\\\Departure_Lists_Exported_From_Protel\\\\2026",rel:String(rel||""),
    dirs:[{name:"2026-08",rel:"2026-08"},{name:"Nightly_XPS_Archive_September_2026_Unbroken",rel:"long"}],files:[]}),
  read:()=>Promise.reject(new Error("x")),stat:()=>Promise.resolve(null),
  getDir:()=>Promise.resolve("D:\\\\Departure_Lists_Exported_From_Protel\\\\2026"),
  pickDir:()=>Promise.resolve(null),trash:()=>Promise.resolve(true),onDirEvent:()=>{}};`;
let bad = 0;
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  for (const screen of ["menu","audit","tax","files","app","reports"]) {
    for (const W of [420, 760, 909, 1600]) {
      const p = await b.newPage();
      await p.addInitScript(bridge);
      await p.setViewportSize({width: W, height: 620});
      await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
      await p.waitForTimeout(250);
      let note = "";
      if (screen === "reports") await p.evaluate(() => { window.__t.FB().p.rep.dir = "D:\\Departure_Lists_Exported_From_Protel\\2026"; }).catch(()=>{});
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
      /* AND IT COUNTS. This printed "PAGE SIDE-SCROLLS" and the elements past the right
         edge and then exited 0 — only the home-button check below fed `bad`. A sweep that
         reports a fault and passes anyway is worse than no sweep, because a clean exit is
         what anyone actually reads. Found by the 1.17.53 audit. */
      if(r.over > 0 || r.bad.length) bad++;
      console.log(screen.padEnd(7) + String(W).padEnd(6) + (r.over > 0 ? "+" + r.over + " PAGE SIDE-SCROLLS" : "ok") + note);
      r.bad.forEach(x => console.log("        past the right edge: " + x));
      /* THE HOME BUTTONS LINE UP WITH THE CARD ABOVE THEM.
         Side-scroll is not the only way out of bounds. REPORTS (1.17.50) was added
         without the three rules that size the other home buttons, so it spanned the whole
         window — and every check above passed, because #landing is 96vw and the page
         still did not scroll. A button that is wider than the column it belongs to is
         what this looks for, and it is the check that was missing. */
      if (screen === "menu") {
        const m = await p.evaluate(() => {
          const card = document.querySelector("#checklist").getBoundingClientRect();
          return [...document.querySelectorAll("#menuScreen > .mItem")].map(el => {
            const q = el.getBoundingClientRect();
            return {id: el.id, off: Math.round(Math.abs(q.left - card.left) + Math.abs(q.width - card.width))};
          });
        });
        const off = m.filter(x => x.off > 1);
        bad += off.length;
        console.log("        " + (off.length ? "OUT OF THE COLUMN: " + off.map(x => "#" + x.id + " by " + x.off + "px").join(", ")
                                             : m.length + " home button(s) line up with the checklist card"));
      }
      /* REPORTS' rows line up with the column too — the same question as the home
         buttons, on the screen that grew rows in 1.17.53. */
      if (screen === "reports") {
        const m = await p.evaluate(() => {
          const back = document.querySelector("#repBack").getBoundingClientRect();
          return [...document.querySelectorAll("#repList > *")].map(el => {
            const q = el.getBoundingClientRect();
            return {t: (el.className || el.tagName), off: Math.round(Math.abs(q.left - back.left) + Math.abs(q.width - back.width))};
          });
        });
        const off = m.filter(x => x.off > 1);
        bad += off.length;
        console.log("        " + (off.length ? "OUT OF THE COLUMN: " + off.map(x => x.t + " by " + x.off + "px").join(", ")
                                             : m.length + " REPORTS row(s) line up with the back button"));
      }
      await p.close();
    }
  }
  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
