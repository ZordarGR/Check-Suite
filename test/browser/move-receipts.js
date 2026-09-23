require("./fresh.js")();
const {chromium}=require("playwright-core"),path=require("path"),assert=require("assert");
(async()=>{
 const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 const page=await browser.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const D=Date,pin=new D(2026,8,25,1).getTime();window.Date=class extends D{constructor(...a){super(...(a.length?a:[pin]));}static now(){return pin;}};
  localStorage.setItem("reccheck_legacy","0");
 });
 await page.goto("file://"+path.resolve(__dirname,"h-sweep.html"));
 const move=(from,to,name="ALPHA GUEST")=>({from,to,name,arr:"20/09/26",dep:"24/09/26",x:"X"});
 const receipt=(room,guest="ALPHA GUEST",extra={})=>({room,roomMain:room,guest,sn:"80001",dept:"RESTAURANT",total:10,rates:{"24%":10},entries:[],time:"21:00",cancelled:false,voided:false,...extra});
 const hist=(room,guest="ALPHA GUEST",meta={id:"old|"+room,live:true,uncertain:false})=>[room,guest,meta];
 async function render({moves=[move("9010","82")],receipts=[],history={},previous=[],departures=[],arrivals=[],legacy=false}={}){
  return page.evaluate(({moves,receipts,history,previous,departures,arrivals,legacy})=>{
   localStorage.setItem("reccheck_legacy",legacy?"1":"0");
   localStorage.setItem("reccheck_rooms","{}");
   localStorage.setItem("reccheck_receipts_v1",JSON.stringify(history));
   const rows=a=>Object.fromEntries(a.map((r,i)=>[i,r]));
   const status={MV:{"20260924":{rows:rows(moves)},"20260923":{rows:rows(previous)}},DP:{"20260924":{rows:rows(departures)}},AR:{"20260924":{rows:rows(arrivals)}}};
   localStorage.setItem("reccheck_status_v1",JSON.stringify(status));
   const ledger={};for(const m of moves)ledger[m.to]={"20260924":{d:20260930,n:m.name,from:m.from,seen:20260924}};
   localStorage.setItem("reccheck_moves_v2",JSON.stringify(ledger));
   const depts={};for(const d of ["RESTAURANT","CAFETERIA","TAVERNAKI","KAFENIO","BAR"])depts[d]={list:d==="RESTAURANT"?receipts:[],other:[]};
   window.__t.setModel({reportDate:"24/9/2026",receipts,depts,validation:[]});window.__t.setState({date:"24/9/2026",receipts:{},extras:[]});window.__t.setStateKey("reccheck_24/9/2026");window.__t.showScreen("app");window.__rcMovesChanged();
   const pills=kind=>[...document.querySelectorAll("#moves .mv-"+kind+".mvPill")].map(n=>({text:n.textContent,dot:n.classList.contains("rec"),title:n.title}));
   return {moves:pills("move"),departures:pills("dep"),arrivals:pills("arr"),history:JSON.parse(localStorage.getItem("reccheck_receipts_v1")),status:JSON.parse(localStorage.getItem("reccheck_status_v1")),model:window.__t.getModel().receipts};
  },{moves,receipts,history,previous,departures,arrivals,legacy});
 }
 for(const [from,to] of [["9010","82"],["53","91"],["117","102"]]){
  const moves=[move(from,to)];
  let r=await render({moves,receipts:[receipt(to)]});assert.deepEqual(r.moves.map(p=>p.dot),[false],"destination alone must not dot "+from);
  r=await render({moves,receipts:[receipt(from)]});assert.deepEqual(r.moves.map(p=>p.dot),[true],"old room must dot "+from);assert.match(r.moves[0].title,/old room/);
  for(const legacy of [false,true])for(const room of [from,to]){
   const pair=legacy?[room,"ALPHA GUEST"]:hist(room);
   r=await render({moves,history:{"20260923":[pair]}});
   assert.equal(r.moves[0].dot,room===from,"saved "+(legacy?"legacy":"identified")+" receipt uses only old room");
   assert.deepEqual(r.history["20260923"][0].slice(0,2),pair.slice(0,2),"source room/name preserved");
   if(legacy){assert.equal(r.history["20260923"][0][2].legacy,true);assert.equal(r.history["20260923"][0][2].uncertain,true);}
  }
 }
 console.log("PASS current and saved identified/legacy receipts use exact old room for ordinary and 9xxx moves");
 for(const extra of [{cancelled:true},{voided:true},{guest:"OTHER GUEST"}])assert.equal((await render({receipts:[receipt("9010","ALPHA GUEST",extra)]})).moves[0].dot,false);
 for(const date of ["20260919","20260925"])assert.equal((await render({history:{[date]:[hist("9010")]}})).moves[0].dot,false,"outside stay history");
 for(const meta of [{id:"old|9010",live:false},{id:"old|9010",live:true,uncertain:true},{id:"old|9010",live:true,versions:[["9010","ALPHA GUEST",false]]}]){
  assert.equal((await render({history:{"20260923":[hist("9010","ALPHA GUEST",meta)]}})).moves[0].dot,false,"cancelled/conflicted history");
  assert.equal((await render({history:{"20260923":[["9010","ALPHA GUEST"],hist("9010","ALPHA GUEST",meta)]}})).moves[0].dot,false,"legacy evidence cannot bypass conflict");
 }
 assert.equal((await render({moves:[move("9010","82","ALPHA GUEST/ONE")],receipts:[receipt("9010")],arrivals:[{room:"82",name:"ALPHA GUEST/TWO",dep:"30/09/26"}]})).moves[0].dot,false,"ambiguous guest stays blocked");
 console.log("PASS date, guest, cancellation, void, uncertainty and conflicting legacy safeguards");
 const chain={moves:[move("53","91")],previous:[move("44","53")],departures:[{room:"91",name:"ALPHA GUEST",arr:"20/09/26",last:500}]};
 for(const room of ["44","53","91"]){
  const r=await render({...chain,receipts:[receipt(room)]});
  assert.equal(r.moves[0].dot,room==="53","a move only accepts its own displayed old room");
  assert.equal(r.departures[0].dot,true,"departure still accepts reservation's full room history");
  assert.equal(Object.keys(r.status.MV["20260923"].rows).length,1,"prior movement is retained");
 }
 console.log("PASS departure and move dots remain independent; prior chain evidence only dots departures");
 const moves=[move("9020","146","GUEST SIX"),move("117","102","GUEST TWO"),move("325","147","GUEST FIVE"),move("9010","82","GUEST THREE"),move("94","254","GUEST FOUR"),move("53","91","GUEST ONE"),move("53","90","GUEST SEVEN")];
 const receipts=[receipt("53","GUEST ONE"),receipt("117","GUEST TWO",{sn:"80002"}),receipt("9010","GUEST THREE",{sn:"80003"}),receipt("53","GUEST SEVEN",{sn:"80004"}),receipt("146","GUEST SIX",{sn:"80005"})];
 for(const legacy of [false,true]){
  let r=await render({moves,receipts,legacy});
  assert.deepEqual(r.moves.map(p=>p.text),["53 → 90","53 → 91","117 → 102","9010 → 82","94 → 254","325 → 147","9020 → 146"]);
  assert.deepEqual(r.moves.map(p=>p.dot),[true,true,true,true,false,false,false]);
  assert.deepEqual(r.model,receipts,"sort never mutates report receipts");
  r=await render({moves,legacy});assert.deepEqual(r.moves.map(p=>p.text),["53 → 90","53 → 91","94 → 254","117 → 102","325 → 147","9010 → 82","9020 → 146"],"without dots all old rooms sort numerically");
 }
 console.log("PASS dotted-first numeric old-room order, numeric destination ties, rerender and legacy mode");
 assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
