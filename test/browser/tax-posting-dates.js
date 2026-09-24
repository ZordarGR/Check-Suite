require("./fresh.js")();
const {chromium}=require("playwright-core"),assert=require("assert"),path=require("path");
(async()=>{
 const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
  const p=await browser.newPage(),errors=[];p.on("pageerror",e=>errors.push(e.message));
  await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));await p.waitForFunction(()=>window.__tx);
  await p.evaluate(()=>window.__t.showScreen("tax"));
  const upload=(name,mixed=false,reversals=0)=>p.evaluate(async({name,mixed,reversals})=>{
   const zip=new JSZip(),g=(x,y,t)=>'<Glyphs OriginX="'+x+'" OriginY="'+y+'" UnicodeString="'+t+'" />';
   for(let n=1;n<=(reversals?3:2);n++){
    const day=mixed&&n===2?'23/09/26':'24/09/26';
    const room=n===3?'9010':String(100+n),negative=n===3||(reversals===2&&n===2),amount=negative?'-10,00':'10,00';
    const content=g(184,97.6,'25/9/2026')+g(40,145.6,room)+g(52.8,164,'Date')+g(104,164,'Time')+
     g(42.56,181.6,day+(n>=2?'02:04100,00SYNTHETIC':''))+g(178.08,181,'*Arrangement')+
     g(42.56,196.64,day+(n>=2?'02:04'+amount+'SYNTHETIC':''))+g(178.08,196,'*ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ');
    zip.file('Documents/1/Pages/'+n+'.fpage','<FixedPage>'+content+'</FixedPage>');
   }
   const file=new File([await zip.generateAsync({type:'uint8array'})],name),dt=new DataTransfer();dt.items.add(file);
   const input=document.getElementById('file-tax');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  },{name,mixed,reversals});
  const mem=()=>p.evaluate(()=>localStorage.getItem('ta_check_memory_v2'));
  await upload("25-9.oxps");await p.waitForFunction(()=>document.getElementById('fn-tax').textContent==='25-9.oxps');
  const before=await mem(),m=JSON.parse(before);assert(m['101']['24/09/26']);assert(m['102']['24/09/26']);
  for(const room of ['101','102']){assert.equal(m[room]['24/09/26'].arr,1);assert.equal(m[room]['24/09/26'].auto,1);assert(!m[room]['25/09/26']);}
  await upload("25-09.oxps");await p.waitForFunction(()=>document.getElementById('fn-tax').textContent==='25-09.oxps');
  assert.equal(await mem(),before,'equivalent filename cannot change dated tax memory');
  await upload("mixed.oxps",true);await p.waitForFunction(()=>document.getElementById('err').textContent.includes('one valid posting date'));
  assert.equal(await mem(),before,'rejected mixed dates preserve all saved history');
  assert.equal(await p.locator('#fn-tax').textContent(),'25-09.oxps');
  await upload("account-reversals.oxps",false,1);
  await p.waitForFunction(()=>document.getElementById('fn-tax').textContent==='account-reversals.oxps');
  assert(!await p.locator('#err').isVisible());assert(!/Reversed charges/.test(await p.locator('#taxScreen').innerText()),'9xxx accounts produce no tax warning');
  assert(JSON.parse(await mem())['9010']['24/09/26'].reversal,'account source evidence remains saved');
  await upload("room-reversals.oxps",false,2);
  await p.waitForFunction(()=>document.getElementById('fn-tax').textContent==='room-reversals.oxps');
  assert(!await p.locator('#err').isVisible(),'report opens despite normal-room reversal');
  const after=await mem(),saved=JSON.parse(after);assert(saved['102']['24/09/26'].reversal&&saved['102']['24/09/26'].uncertain);
  assert(!saved['101']['24/09/26'].uncertain);assert(saved['102']['24/09/26'].versions.length===1);
  const warnings=p.locator('#taxScreen .row').filter({hasText:'Reversed charges'});
  assert(await warnings.count()>0);for(const room of await warnings.locator('.rm').allTextContents())assert.equal(room,'102');
  assert(!await p.locator('#taxScreen').innerText().then(s=>/9010/.test(s)),'9xxx account remains outside tax views');
  await p.reload();await p.waitForFunction(()=>window.__tx);await p.evaluate(()=>window.__t.showScreen('tax'));
  assert.equal(await mem(),after);assert.match(await p.locator('#acc').innerText(),/Reversed charges/,'room warning survives reload');
  assert.deepEqual(errors,[]);
  console.log('PASS actual OXPS upload: print vs posting date, joined glyphs, both filename formats, exact room counts, invalid import preserves prior tax memory and loaded report; normal-room reversal warning persists without blocking, account reversals excluded');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
