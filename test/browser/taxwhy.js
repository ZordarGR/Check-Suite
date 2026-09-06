/* A DIAGNOSTIC, not a harness: it asserts nothing, it prints numbers. It still refuses to
   run against a stale copy — printing measurements of a page that no longer exists is the
   "passed three times in one night while proving nothing" fault in its quietest form. */
require("./fresh.js")();
const {chromium} = require("playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  for (const W of [760, 880, 909, 1000, 1090, 1200]) {
    const p = await b.newPage();
    await p.setViewportSize({width: W, height: 620});
    await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
    await p.waitForTimeout(250);
    await p.evaluate(() => window.__t.showScreen("tax"));
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      const wrap = document.querySelector("#taxScreen .wrap");
      const cs = wrap ? getComputedStyle(wrap) : null;
      const tb = document.querySelector("#taxScreen .topbar");
      return {
        bodyClass: document.body.className || "(none)",
        over: de.scrollWidth - de.clientWidth,
        wrapML: cs && cs.marginLeft, wrapMR: cs && cs.marginRight, wrapMax: cs && cs.maxWidth,
        wrapW: wrap && Math.round(wrap.getBoundingClientRect().width),
        wrapRight: wrap && Math.round(wrap.getBoundingClientRect().right),
        topbarWrap: tb && getComputedStyle(tb).flexWrap
      };
    });
    console.log(String(W).padEnd(6) + "over=" + String(r.over).padEnd(5)
      + " body='" + r.bodyClass + "'  wrap ml=" + r.wrapML + " mr=" + r.wrapMR
      + " max=" + r.wrapMax + " w=" + r.wrapW + " right=" + r.wrapRight + "  topbar flex-wrap=" + r.topbarWrap);
    await p.close();
  }
  await b.close();
})();
