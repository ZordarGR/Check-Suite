/* Run only in cloud after test/harness.js. Browser checks the shipped print boundary,
   including direct click-handler invocation, Ctrl+P and a queued stale print. */
require("./fresh.js")();
const {chromium}=require("playwright-core"),fs=require("fs"),path=require("path"),assert=require("assert");
const src=fs.readFileSync(path.resolve(__dirname,"../../app/index.html"),"utf8");
function lift(n){const at=src.indexOf("\nfunction "+n+"(");assert(at>=0,n);let d=0,b=src.indexOf("{",at);for(let j=b;j<src.length;j++){if(src[j]==="{")d++;else if(src[j]==="}"&&!--d)return src.slice(at+1,j+1);}}
const c=re=>{const m=src.match(re);assert(m,String(re));return m[0];};
const parse=new Function("pages",[c(/^const SPLIT_GAP = .*$/m),c(/^const DEFAULT_ADV = .*$/m),c(/^const DEPLIST_HEAD = [\s\S]*?\];$/m),...["xmlDecode","parseIndices","pageTokens","parseDepList"].map(lift)].join("\n")+";return parseDepList(pages);");
const glyph=(x,y,s)=>'<Glyphs OriginX="'+x+'" OriginY="'+y+'" FontRenderingEmSize="10" UnicodeString="'+s+'" />';
const head=(offset=0)=>glyph(64+offset,100,"Δωμάτιο")+glyph(224+offset,100,"Πελάτης")+glyph(448+offset,100,"Άφιξη");
const row=(room,name,offset=0)=>glyph(72+offset,140,room)+glyph(232+offset,140,name)+glyph(450+offset,140,"10/09/26");
const page=body=>'<FixedPage Width="1122.56" Height="793.76">'+body+'</FixedPage>';
const first=page(glyph(500,50,"Departure List by Time")+head()+row("101","ALPHASECRET"));
(async()=>{
 const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
  const p=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
  p.on("pageerror",e=>errors.push(e.message));
  await p.addInitScript(()=>{
   window.__printCount=0;
   window.print=()=>{window.__printCount++;window.dispatchEvent(new Event("beforeprint"));window.dispatchEvent(new Event("beforeprint"));};
  });
  await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));
  await p.waitForFunction(()=>!!window.__t);
  const open=pages=>p.evaluate(({parsed,pages})=>window.__t.openDepPreview({name:"synthetic.oxps",path:"synthetic.oxps"},parsed,"dep",{pages,fonts:{}}),{parsed:parse(pages),pages});
  for(const pages of [[first,page(row("102","UNPARSEDSECRET"))],[first.replace("</FixedPage>",'<Image Source="omitted.png" /></FixedPage>')],
   [first.replace('OriginX="232"','RenderTransform="1,0,0,1,240,0" OriginX="232"')]]){
   await open(pages);
   assert(await p.locator("#pvGo").isDisabled());
   assert.match(await p.locator("#pvPaper").innerText(),/Cannot print safely/);
   assert(!/ALPHASECRET|UNPARSEDSECRET/.test(await p.locator("#pvPaper").innerText()));
   await p.evaluate(()=>document.querySelector("#pvGo").onclick());
   await p.keyboard.press("Control+p");
   await p.waitForTimeout(120);
   assert.equal(await p.evaluate(()=>window.__printCount),0);
   assert.equal(await p.evaluate(()=>window.__t.armedPrint()),null);
   await p.click("#pvNames");
   assert(await p.locator("#pvGo").isDisabled(),"An unsafe file cannot become printable by toggling names");
   await p.click("#pvCancel");
  }
  await open([first,page(head(240)+row("102","SHIFTEDSECRET",240))]);
  assert(!await p.locator("#pvGo").isDisabled());
  assert(!/ALPHASECRET|SHIFTEDSECRET/.test(await p.locator("#pvPaper").innerText()));
  assert.equal(await p.locator("#pvPaper .xpsPage").count(),2);
  await p.evaluate(()=>{document.querySelector("#pvGo").onclick();window.__t.showScreen("menu");});
  await p.waitForTimeout(120);
  assert.equal(await p.evaluate(()=>window.__printCount),0,"A queued old print must not fire after navigation changes intent");
  await open([first]);
  await p.click("#pvGo");
  await p.waitForTimeout(120);
  assert.equal(await p.evaluate(()=>window.__printCount),1);
  assert(!/ALPHASECRET/.test(await p.locator("#printSheet").innerText()));
  await p.pdf({path:path.resolve(__dirname,"audit-reports.pdf"),format:"A4",landscape:true,printBackground:true});
  const {pages:joinedPages}=require('../fixtures/dep-joined-headings');
  await open(joinedPages);
  assert(!await p.locator("#pvGo").isDisabled(),'joined headings must permit the complete redacted preview');
  assert.equal(await p.locator("#pvPaper .xpsPage").count(),3);
  const {NAMES}=require('../fixtures/dep0809');
  const preview=await p.locator("#pvPaper").innerText();assert(NAMES.every(n=>!preview.includes(n)));
  await p.click("#pvGo");await p.waitForTimeout(120);
  assert.equal(await p.locator("#printSheet .xpsPage").count(),3);
  const printed=await p.locator("#printSheet").innerText();assert(NAMES.every(n=>!printed.includes(n)));
  assert.deepStrictEqual(errors,[]);
  console.log("PASS REPORTS browser: unsafe page/unsupported element blocked for both previews, direct handler and Ctrl+P blocked, shifted columns redacted, stale timer canceled, normal repeated print and PDF preserved");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
