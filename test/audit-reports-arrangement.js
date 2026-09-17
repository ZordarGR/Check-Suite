/* Adversarial audit: production functions only, synthetic guest data only.
   Run in the cloud: node test/audit-reports-arrangement.js
   Failures are preservation/safety invariants, not assertions of the current bugs. */
"use strict";
const fs=require("fs"),assert=require("assert");
const src=fs.readFileSync("app/index.html","utf8");
const A=require("../app/arrangement"),{InvoiceState}=require("../app/arrangement-live");
function lift(n){
  const at=src.indexOf("\nfunction "+n+"(");assert(at>=0,"Missing function "+n);
  let depth=0,b=src.indexOf("{",at);
  for(let j=b;j<src.length;j++){if(src[j]==="{")depth++;else if(src[j]==="}"&&!--depth)return src.slice(at+1,j+1);}
  throw Error("Unclosed function "+n);
}
const constant=re=>{const m=src.match(re);assert(m,String(re));return m[0];};
const depSource=["dateNum2","pillRoom","sameName","nameWordSet","nameLike","nameHit","statusRows","depReportKey","depReportDate","depReportRows"].map(lift).join("\n");
const D=new Function(depSource+";return {rows:depReportRows,key:depReportKey};")();
const repSource=[constant(/^const SPLIT_GAP = .*$/m),constant(/^const DEFAULT_ADV = .*$/m),constant(/^const DEPLIST_HEAD = [\s\S]*?\];$/m),
  ...["xmlDecode","parseIndices","pageTokens","parseDepList","isDepList","xpsDeobfuscate","ttfMetrics","parseGlyphIndices","xpsPageSvg","xpsFontCss","xpsFontKey","buildDepExact"].map(lift)].join("\n");
const R=new Function(repSource+";return {parse:parseDepList,is:isDepList,exact:buildDepExact};")();
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log("PASS "+name);}catch(e){failed++;console.error("FAIL "+name+"\n  "+e.message);}}
const stay=(name="ALPHA GUEST",more={})=>({d:20260918,n:name,seen:20260917,...more});
const ih=(room,name="ALPHA GUEST",more={})=>({room,name,arr:"10/09/26",dep:"18/09/26",status:"CI",...more});
const rows=(ledger,status={},history={})=>D.rows(ledger,status,history,20260918,20260918);

test("DR-01 a different guest with the same room and arrival cannot erase the saved departure",()=>{
  const result=rows({"101":{"20260910":stay("ALPHA GUEST")}}, {IH:{key:20260918,rows:[ih("101","BETA PERSON")]}});
  assert.deepStrictEqual(result.map(r=>r.name).sort(),["ALPHA GUEST","BETA PERSON"]);
});
test("DR-02 full adjoining identifiers survive in-house projection",()=>{
  const result=rows({}, {IH:{key:20260918,rows:[ih("101-2","ALPHA GUEST"),ih("101-3","BETA PERSON")]}});
  assert.deepStrictEqual(result.map(r=>r.room).sort(),["101-2","101-3"]);
});
test("DR-03 distinct adjoining identifiers cannot merge merely because guest and departure match",()=>{
  const result=rows({"101-2":{"20260910":stay()},"101-3":{"20260910":stay()}});
  assert.deepStrictEqual(result.map(r=>r.room).sort(),["101-2","101-3"]);
});
test("DR-04 same-day contradictory saved departure dates remain explicit",()=>{
  const result=rows({"101":{"20260910":stay()}}, {IH:{key:20260917,rows:[ih("101","ALPHA GUEST",{dep:"19/09/26"})]}});
  assert(result.some(r=>r.dep===20260918||r.departures?.includes(20260918)),"A same-day conflicting departure silently removed today's backup entry");
});
test("DR-05 an older census cannot replace a newer ledger fact",()=>{
  const result=rows({"101":{"20260910":stay()}},{IH:{key:20260916,rows:[ih("101","ALPHA GUEST",{dep:"19/09/26"})]}});
  assert.equal(result.length,1);assert.equal(result[0].name,"ALPHA GUEST");
});
test("DR-06 known moves retain earlier-room receipts without losing the destination",()=>{
  const ledger={"101":{"20260910":stay("ALPHA GUEST",{mv:true})},"102":{"20260910":stay("ALPHA GUEST",{from:"101"})}};
  const result=rows(ledger,{}, {20260911:[["101","ALPHA GUEST"]]});
  assert.equal(result.length,1);assert.equal(result[0].room,"102");assert.equal(result[0].extras,true);
});
test("DR-07 a common surname in a later source-room occupant cannot prove the moved guest's extras",()=>{
  const ledger={"101":{"20260910":stay("BETA SMITH")},"102":{"20260910":stay("ALPHA SMITH",{from:"101"})}};
  const result=rows(ledger,{}, {20260917:[["101","BETA SMITH"]]});
  assert.equal(result.find(r=>r.room==="102").extras,false,"BETA's receipt was attributed to ALPHA solely via SMITH");
});
test("DR-08 arrival-date ambiguity keeps uncertain extras uncertain",()=>{
  const result=rows({"101":{"20260910":stay(),"20260911":stay()}},{},{20260910:[["101","ALPHA GUEST"]]});
  assert.equal(result.length,1);assert.deepStrictEqual(result[0].arrivals,[20260910,20260911]);
  assert.equal(result[0].extras,false);assert.equal(result[0].extrasUncertain,true);
});
test("DR-09 cyclic recorded moves terminate and retain eligible evidence",()=>{
  const mv={};for(let i=101;i<=130;i++)mv[i]={from:String(i),to:String(i===130?101:i+1),arr:"10/09/26",dep:"18/09/26",name:"ALPHA GUEST",x:"X"};
  const result=rows({"101":{"20260910":stay()}},{MV:{20260911:{rows:mv}}},{20260912:[["130","ALPHA GUEST"]]});
  assert.equal(result.length,1);assert.equal(result[0].extras,true);
});
test("DR-10 repeated report building does not mutate captured inputs",()=>{
  const ledger={"101":{"20260910":stay(),"20260911":stay()}},status={IH:{key:20260917,rows:[ih("101")]}},history={20260917:[["101","ALPHA GUEST"]]};
  const before=JSON.stringify({ledger,status,history});for(let i=0;i<5;i++)rows(ledger,status,history);
  assert.equal(JSON.stringify({ledger,status,history}),before);
});
test("DR-11 dates accept valid leap day and reject impossible days",()=>{
  for(const d of ["29/02/2027","31/04/2026","00/09/2026","18/00/2026"])assert.equal(D.key(d),0);
  assert.equal(D.key("29/02/2028"),20280229);assert.equal(D.key("2026-09-18"),20260918);
});

const G=(x,y,s)=>'<Glyphs OriginX="'+x+'" OriginY="'+y+'" FontRenderingEmSize="10" UnicodeString="'+String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" />';
const heading=(offset=0)=>G(64+offset,100,"Δωμάτιο")+G(224+offset,100,"Πελάτης")+G(448+offset,100,"Άφιξη");
const row=(room,name,offset=0)=>G(72+offset,140,room)+G(232+offset,140,name)+G(450+offset,140,"10/09/26");
const page=body=>'<FixedPage Width="1122" Height="794">'+body+'</FixedPage>';
const first=page(G(500,50,"Departure List by Time")+heading()+row("101","ALPHANAME"));
function exact(pages){const p=R.parse(pages);assert(R.is(p));return {p,ex:R.exact(p,{pages,fonts:{}},false)};}
test("REP-01 normal multi-page exact reports redact every guest",()=>{
  const r=exact([first,page(heading()+row("102","BETANAME"))]);
  assert.equal(r.p.guests,2);assert(!/ALPHANAME|BETANAME/.test(r.ex.html));
});
test("REP-02 a missing second-page heading cannot print an unredacted guest",()=>{
  const r=exact([first,page(row("102","SECONDPAGESECRET"))]);
  assert(!r.ex.html.includes("SECONDPAGESECRET"),"Unrecognized page body reached the redacted exact print intact");
});
test("REP-03 second-page column shifts cannot silently move names outside redaction",()=>{
  const r=exact([first,page(heading(240)+row("102","SHIFTEDPAGESECRET",240))]);
  assert(!r.ex.html.includes("SHIFTEDPAGESECRET"),"Only first-page column positions were used for every page");
});
test("REP-04 incomplete page parsing must be detectable before producing the named backup",()=>{
  const r=exact([first,page(row("102","MISSINGBACKUPNAME"))]);
  assert(r.p.guests===2||r.p.incomplete||r.p.errors?.length,"Backup silently contains 1 of 2 rooms with no parse-incomplete flag");
});
test("REP-05 unsupported render elements cannot be called an exact complete printable sheet",()=>{
  const r=exact([first.replace("</FixedPage>",'<Image Source="omitted.png" /></FixedPage>')]);
  assert(r.ex.unknown.length>0,"Renderer should record an unsupported element");
  const preview=lift("openDepPreview");
  assert(/\.disabled\s*=.*unknown|throw.*unknown|if\([^\n]*unknown[^\n]*\)[^\n]*(return|throw)/.test(preview),"Print remains enabled with unsupported content omitted");
});

const charge=(label,amount,date="10/09/26")=>({label,amount,date,currency:"EUR"});
const invoice=(more={})=>({complete:true,name:"ALPHA GUEST",room:"101",arr:"10/09/26",dep:"18/09/26",currency:"EUR",title:"INDIVIDUAL",rows:[charge("*Arrangement","100,00"),charge("Deposit Cash","-800,00")],...more});
const rate=(more={})=>({tag:"IH",at:100,name:"ALPHA GUEST",room:"101",arr:"10/09/26",dep:"18/09/26",price:"100,00",agency:"DIRECT",currency:"EUR",...more});
test("ARR-01 exact cents preserve under/exact/over verdicts",()=>{
  for(const [amt,diff,state] of [["-799,99",-1,"difference"],["-800,00",0,"paid"],["-800,01",1,"difference"]]){
    const v=A.evaluate(invoice({rows:[charge("*Arrangement","100,00"),charge("PAYMENT",amt)]}),[rate()]);
    assert.equal(v.diff,diff);assert.equal(v.state,state);
  }
});
test("ARR-02 contradictory references never choose an arbitrary price",()=>{
  assert.equal(A.evaluate(invoice(),[rate(),rate({price:"200,00"})]).state,"unknown");
});
test("ARR-03 partial captures do not introduce reservation references",()=>{
  const title="TITLE\tGuests inhouse: 17/09/26\nRATE\tIH\tALPHA GUEST\t101\t10/09/26\t18/09/26\t100,00\tDIRECT\tEUR\tCI\n";
  for(const tail of ["", "DONE\t2\t1\t0\t0\tunicode\tcomplete\n", "DONE\t1\t1\t0\t0\tunicode\tcut-short\n", "ERR\tread\nDONE\t1\t1\t0\t0\tunicode\tcomplete\n"])assert.deepStrictEqual(A.capture(title+tail,"IH",100),[]);
});
test("ARR-04 names in mixed scripts cannot collapse to an unrelated reference",()=>{
  assert.equal(A.reference(invoice({name:"SMITH/ИВАНОВ"}),[rate({name:"SMITH/ПЕТРОВ",price:"200,00"})]),null);
});
test("ARR-05 a checkout zero price cannot erase an earlier positive rate needed for one doubled charge",()=>{
  const refs=A.mergeRefs([], [rate({at:100}),rate({at:200,price:"0,00"})],Date.UTC(2026,8,18));
  const i=invoice({rows:[charge("*Arrangement","200,00"),charge("PAYMENT","-1600,00")]});
  const v=A.evaluate(i,refs);
  assert(v.state!=="paid","Green at 1600: saved daily rate was 100 and first charge was 200, so expected was 900, but checkout discarded the only positive reference");
});
test("ARR-06 delayed invoice packets cannot restore a previous reservation",()=>{
  const s=new InvoiceState(),fields=["ALPHA GUEST","101","10/09/26","18/09/26","","INDIVIDUAL","0,00","EUR","CI"];
  s.accept({kind:"geometry",id:"one"},100);s.accept({kind:"metadata",id:"one",epoch:1,fields},101);
  s.accept({kind:"invoice",id:"one",epoch:1,complete:true,data:{fields,rows:invoice().rows}},102);
  assert.equal(s.display([rate()],103).result.state,"paid");
  const other=fields.map((f,i)=>i===0?"BETA PERSON":f);
  s.accept({kind:"metadata",id:"one",epoch:2,fields:other},104);
  s.accept({kind:"invoice",id:"one",epoch:1,complete:true,data:{fields,rows:invoice().rows}},105);
  assert.equal(s.display([rate()],106).result.state,"unknown");
});
test("ARR-07 incomplete zero-row invoices remain uncertain",()=>{
  assert.equal(A.evaluate(invoice({complete:false,rows:[]}),[rate()]).state,"unknown");
  assert.equal(A.evaluate(invoice({complete:true,rows:[]}),[rate()]).state,"unpaid");
});
test("ARR-08 refunds, reversed amounts and malformed numbers never create a false green",()=>{
  assert.equal(A.evaluate(invoice({rows:[charge("*Arrangement","100,00"),charge("PAYMENT","-900,00"),charge("REFUND","100,00")]}),[rate()]).state,"paid");
  for(const amount of ["1,00 EUR","800.00","1.00,00","NaN","", "999999999999999999999,00"])
    assert.equal(A.evaluate(invoice({rows:[charge("PAYMENT",amount)]}),[rate()]).state,"unknown");
});
console.log(JSON.stringify({suite:"audit-reports-arrangement",passed,failed}));
process.exitCode=failed?1:0;
