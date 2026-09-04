const {chromium} = require("playwright-core");
const path = require("path");
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  const p = await b.newPage();
  await p.setViewportSize({width:1000, height:640});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(350);
  await p.evaluate(() => window.__t.showScreen("menu"));
  await p.waitForTimeout(200);
  await p.hover("#mcOptionsBtn").catch(()=>{});
  await p.click("#mcOptionsBtn").catch(()=>{});
  await p.waitForTimeout(350);
  await p.screenshot({path: path.resolve(__dirname, "opts.png")});
  console.log(await p.evaluate(() => {
    const b = document.querySelector("#mLegacy");
    const cs = getComputedStyle(b), r = b.getBoundingClientRect();
    return "mLegacy display=" + cs.display + " w=" + Math.round(r.width) + " h=" + Math.round(r.height)
      + "\nlabel: " + b.querySelector(".mLabel").textContent
      + "\nsub  : " + b.querySelector(".mSub").textContent;
  }));
  await b.close();
})();
