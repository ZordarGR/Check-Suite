const assert=require("assert"), A=require("../app/arrangement"), {InvoiceState,layout}=require("../app/arrangement-live");
let tests=0;
const test=(name,fn)=>{fn();tests++;console.log("ok "+name);};
const row=(label,amount,date="14/09/26")=>({label,amount,date,currency:"EUR"});
const inv=(title="INDIVIDUAL",rows=[row("*Arrangement","150,00")])=>({complete:true,name:"TEST GUEST",room:"101",arr:"14/09/26",dep:"21/09/26",currency:"EUR",title,rows});
const acceptInvoice=(s,m,now)=>{
 if(!s.meta)s.accept({kind:"metadata",id:m.id,epoch:1,fields:m.data.fields},now);
 s.accept({...m,epoch:s.epoch},now);
};
const ref=(price="150,00",agency="DIRECT")=>({name:"GUEST TEST",room:"101",arr:"14/09/26",dep:"21/09/26",price,agency,currency:"EUR",at:1});
test("cent parser accepts Greek display, refuses ambiguous formats",()=>{
 assert.equal(A.cents("-1.167,25"),-116725);assert.equal(A.cents("259,25"),25925);
 for(const s of ["1,234.56","1.234","1,2","","NaN","12.34,56"])assert.equal(A.cents(s),null);
});
test("calendar nights include arrival, exclude departure across DST",()=>{
 assert.equal(A.day("30/03/26")-A.day("28/03/26"),2);assert.equal(A.day("31/02/26"),null);
});
test("Booking split advance/check-in deposits, not running balance",()=>{
 const i=inv("BOOKING.COM/R.Nr.1234(1)",[row("Deposit CC Cards","-1.166,00","10/07/26"),row("*Arrangement","259,25","11/09/26"),row("Deposit CC Cards","-1.167,25","12/09/26")]);
 i.arr="11/09/26";i.dep="20/09/26";i.balance="-1.296,25";
 const r={...ref("259,25"),arr:i.arr,dep:i.dep};
 const x=A.evaluate(i,[r]);assert.equal(x.state,"paid");assert.equal(x.expected,233325);assert.equal(x.nights,9);
});
test("Expedia paid on first night",()=>{
 const i=inv("EXPEDIA LODGING PARTNER SERVICES SARL/R.Nr.55(1)",[row("Deposit CC Cards","-1.322,44"),row("*Arrangement","188,92")]);
 assert.equal(A.evaluate(i,[ref("188,92")]).state,"paid");
});
test("Webhotelier lists qualify a different B agency",()=>{
 const i=inv("FICTIONAL AGENCY/R.Nr.33(1)",[row("Deposit CC Cards","-646,80"),row("Deposit CC Cards","-1.509,20"),row("*Arrangement","308,00")]);
 assert.equal(A.evaluate(i,[ref("308,00","WEBHOTELIER")]).state,"paid");
 assert.equal(A.evaluate(i,[ref("308,00","TOUR OPERATOR")]).state,"outside");
 assert.equal(A.evaluate(i,[]).state,"unknown");
 i.title="WEBHOTELIER/R.Nr.33(1)";
 assert.equal(A.evaluate(i,[ref("308,00","TOUR OPERATOR")]).state,"outside");
});
test("checkout Price 0 uses B normal charge; unpaid tint ignores A/C and notes",()=>{
 const i=inv();i.remarks="FULLY PREPAID!!!";i.overallPayments=36000;i.a=[row("Deposit Cash","-270,00")];i.c=[row("Deposit Cash","-90,00")];
 const x=A.evaluate(i,[ref("0,00")]);assert.equal(x.state,"unpaid");assert.equal(x.expected,105000);assert.equal(x.tint,true);
});
test("late arrival first-night double uses positive list rate and +1 exactly once",()=>{
 const i=inv("INDIVIDUAL",[row("Deposit Cash","-1.200,00"),row("*Arrangement","300,00")]);
 const x=A.evaluate(i,[ref()]);assert.equal(x.state,"paid");assert.equal(x.nights,8);assert.equal(i.arr,"14/09/26");
});
test("late arrival checkout zero rate uses smaller subsequent charge",()=>{
 const i=inv("INDIVIDUAL",[row("NATIONAL BANK","-1.200,00"),row("*Arrangement","300,00"),row("*Arrangement","150,00","15/09/26")]);
 assert.equal(A.evaluate(i,[ref("0,00")]).nights,8);
});
test("ordinary rate, exact cent difference",()=>{
 const x=A.evaluate(inv("INDIVIDUAL",[row("*Arrangement","150,00"),row("Deposit Cash","-1.049,99")]),[ref()]);
 assert.equal(x.diff,-1);assert.equal(x.state,"difference");assert.match(x.text,/Under €0.01/);
});
test("refunds reduce paid instead of counting absolute values",()=>{
 const i=inv("INDIVIDUAL",[row("*Arrangement","150,00"),row("Deposit Cash","-1.100,00"),row("Deposit Cash","50,00")]);
 assert.equal(A.evaluate(i,[ref()]).state,"paid");
});
test("any B payment label counts, while incomplete data never produces a verdict",()=>{
 const i=inv("INDIVIDUAL",[row("*Arrangement","150,00"),row("UNMAPPED","-1.050,00")]);
 assert.equal(A.evaluate(i,[ref()]).state,"paid");
 i.complete=false;assert.equal(A.evaluate(i,[ref()]).tint,false);
});
test("dates, refunds, abnormal arrangements and currency fail honestly",()=>{
 for(const rows of [[row("*Arrangement","-150,00")],[row("*Arrangement","450,00")],[row("*Arrangement","150,00"),row("*Arrangement","300,00","15/09/26")],[row("Deposit Cash","150,00")]]){
  const i=inv("INDIVIDUAL",rows.concat(row("Deposit Cash","-1,00")));assert.equal(A.evaluate(i,[ref()]).state,"unknown");
 }
 const i=inv();i.currency="USD";assert.equal(A.evaluate(i,[ref()]).state,"unknown");
});
test("reference cannot cross to another guest, room or stay",()=>{
 for(const change of [{name:"OTHER GUEST"},{room:"102"},{arr:"13/09/26"},{dep:"22/09/26"}])
  assert.equal(A.reference(inv(),[{...ref(),...change}]),null);
 assert.equal(A.reference(inv(),[ref(),{...ref("300,00")}]),null);
});
test("RATE protocol keeps original dates and leaves unrelated records alone",()=>{
 const text="TITLE\tGuests inhouse: 15/09/26\nIH\tTEST GUEST\t101\t2\t14/09/26\t21/09/26\tCI\nRATE\tIH\tTEST GUEST\t101\t14/09/26\t21/09/26\t150,00\tWEBHOTELIER\tEUR\tCI\nDONE\t1\t1\t12\t5\tunicode\tcomplete\n";
 const r=A.capture(text,"IH",1);assert.equal(r.length,1);assert.equal(r[0].arr,"14/09/26");
 assert.equal(A.capture(text.replace("complete","cut-short"),"IH",1).length,0);
 assert.equal(A.capture(text,"AR",1).length,0);
 const ar="TITLE\tArrival Report for the 14/09/26\nRATE\tAR\tTEST GUEST\t101\t\t21/09/26\t150,00\tDIRECT\tEUR\tCI\nDONE\t1\t1\t12\t5\tunicode\tcomplete\n";
 assert.equal(A.capture(ar,"AR",1)[0].arr,"14/09/26");
});
test("live state clears on a reused invoice and hides when geometry goes stale",()=>{
 const s=new InvoiceState(), g={kind:"geometry",id:"one",rect:{x:80,y:300,width:1767,height:603},strip:{x:688,y:420,width:370,height:18}};
 s.accept(g,100);acceptInvoice(s,{kind:"invoice",id:"one",complete:true,data:{fields:["TEST GUEST","101","14/09/26","21/09/26","","INDIVIDUAL","","EUR","CI"],rows:[row("*Arrangement","150,00")]}},110);
 assert.equal(s.display([ref()],200).result.state,"unpaid");assert.equal(s.display([],1000),null);
 s.accept({kind:"reset",id:"one"},210);assert.equal(s.display([],220),null);
 s.accept({kind:"hide"},230);assert.equal(s.display([],240),null);
 s.accept({...g,id:"two"},250);assert.equal(s.display([],260),null);
});
test("overlay coordinates follow resize, movement and DPI through parent mapping",()=>{
 const a=layout({rect:{x:2000,y:100,width:1800,height:900},strip:{x:2600,y:250,width:600,height:30},grid:{x:2600,y:290,width:800,height:650}},r=>({x:1400,y:66,width:1200,height:600}));
 assert.equal(a.strip.x,400);assert.equal(a.strip.y,100);assert.equal(a.strip.width,400);
 assert.equal(layout({rect:{x:0,y:0,width:100,height:100},strip:{x:200,y:5,width:20,height:10}},r=>r),null);
});
test("duplicate contradictory list rows survive storage as ambiguity",()=>{
 const list=A.mergeRefs([],[{...ref(),tag:"IH"},{...ref("200,00"),tag:"IH"}],Date.UTC(2026,8,15));
 assert.equal(list.length,2);assert.equal(A.reference(inv(),list),null);
});
test("missing list price cannot turn a first doubled charge into a false green",()=>{
 const i=inv("INDIVIDUAL",[row("*Arrangement","300,00"),row("Deposit Cash","-2.100,00")]);
 assert.equal(A.evaluate(i,[]).state,"unknown");
});
test("new list metadata changes an open Invoice verdict, and malformed rows are refused",()=>{
 const s=new InvoiceState();
 s.accept({kind:"geometry",id:"x",rect:{},strip:{}},100);
 const m={kind:"invoice",id:"x",complete:true,data:{fields:["TEST GUEST","101","14/09/26","21/09/26","","INDIVIDUAL","","EUR","CI"],rows:[row("*Arrangement","150,00"),row("PAYMENT","-1.050,00")]}};
 acceptInvoice(s,m,110);assert.equal(s.display([],150).result.state,"unknown");
 assert.equal(s.display([ref()],160).result.state,"paid");
 acceptInvoice(s,{...m,data:{...m.data,rows:[null]}},170);assert.equal(s.display([ref()],180).result.state,"unknown");
});
test("four-digit invoice dates are preserved",()=>{
 const i=inv("INDIVIDUAL",[row("*Arrangement","150,00","14/09/2026"),row("PAYMENT","-1.050,00","13/09/2026")]);
 assert.equal(A.evaluate(i,[ref()]).state,"paid");
});
test("a completely read empty B is unpaid; an incomplete empty B stays uncertain",()=>{
 const i=inv("INDIVIDUAL",[]);assert.equal(A.evaluate(i,[ref()]).tint,true);
 i.complete=false;assert.equal(A.evaluate(i,[ref()]).state,"unknown");
});

test("hyphenated room rates survive IH, AR and DP with their full identifier",()=>{
 const samples=[
  ["IH","Guests inhouse: 15/09/26","14/09/26","28/09/26"],
  ["AR","Arrival Report for the 14/09/26","","28/09/26"],
  ["DP","Departure Report for the 28/09/26","14/09/26",""]
 ];
 for(const [tag,title,arr,dep] of samples){
  const text="TITLE\t"+title+"\nRATE\t"+tag+"\tTEST GUEST\t101-2\t"+arr+"\t"+dep+"\t150,00\tINDIVIDUAL\tEUR\tCI\nDONE\t1\t1\t12\t5\tunicode\tcomplete\n";
  const captured=A.capture(text,tag,1);
  assert.equal(captured.length,1);assert.equal(captured[0].room,"101-2");
  assert.equal(captured[0].arr,"14/09/26");assert.equal(captured[0].dep,"28/09/26");
  const stored=A.mergeRefs([],captured,Date.UTC(2026,8,15));
  const i={...inv("INDIVIDUAL",[row("PAYMENT","-2.100,00"),...Array.from({length:11},(_,n)=>row("*Arrangement","150,00",String(14+n)+"/09/26"))]),room:"101-2",dep:"28/09/26"};
  const x=A.evaluate(i,stored);
  assert.equal(x.state,"paid");assert.equal(x.rate,15000);assert.equal(x.expected,210000);assert.equal(x.nights,14);
  assert.equal(A.reference({...i,room:"101"},stored),null);
  assert.equal(A.reference({...i,room:"101-3"},stored),null);
  assert.equal(A.reference({...i,name:"OTHER GUEST"},stored),null);
  assert.equal(A.reference({...i,arr:"13/09/26"},stored),null);
 }
});
test("different room suffixes remain separate reservation references",()=>{
 const a={...ref(),tag:"IH",room:"101-2"},b={...ref("200,00"),tag:"IH",room:"101-3"};
 const stored=A.mergeRefs([],[a,b],Date.UTC(2026,8,15));
 assert.equal(stored.length,2);
 assert.equal(A.reference({...inv(),room:"101-2"},stored).price,"150,00");
 assert.equal(A.reference({...inv(),room:"101-3"},stored).price,"200,00");
});
test("rate capture accepts numeric room suffixes and rejects malformed identifiers",()=>{
 const capture=room=>A.capture("TITLE\tGuests inhouse: 15/09/26\nRATE\tIH\tTEST GUEST\t"+room+"\t14/09/26\t21/09/26\t150,00\tINDIVIDUAL\tEUR\tCI\nDONE\t1\t1\t12\t5\tunicode\tcomplete\n","IH",1);
 for(const room of ["51","101-2","414-15","9017-2"])assert.equal(capture(room)[0].room,room);
 for(const room of ["101-","101-A","101--2","101-2-3","101/2","101-23456"])assert.equal(capture(room).length,0);
});


test("arrival list compares payments before the first Arrangement posting",()=>{
 const text="TITLE\tArrival Report for the 14/09/26\nRATE\tAR\tTEST GUEST\t101\t\t21/09/26\t150,00\tWEBHOTELIER\tEUR\tRES\nDONE\t1\t1\t12\t5\tunicode\tcomplete\n";
 const refs=A.mergeRefs([],A.capture(text,"AR",1),Date.UTC(2026,8,14));
 for(const title of ["INDIVIDUAL","BOOKING.COM/R.Nr.12(1)","EXPEDIA LODGING PARTNER SERVICES SARL/R.Nr.13(1)","FICTIONAL AGENCY/R.Nr.14(1)"]){
  const i=inv(title,[row("Deposit Cash","-300,00","01/09/26"),row("PAYMENT","-750,00")]);
  const x=A.evaluate(i,refs);
  assert.equal(x.state,"paid","arrival payments must compare before the first Arrangement posting");
  assert.equal(x.expected,105000);assert.equal(x.paid,105000);assert.equal(x.nights,7);assert.equal(x.rate,15000);
  assert.equal(i.arr,"14/09/26");assert.equal(i.dep,"21/09/26");
 }
});
test("pre-posting comparisons retain cent differences and signed refunds",()=>{
 for(const [rows,state,diff] of [
  [[row("Deposit Cash","-1.049,99")],"difference",-1],
  [[row("NATIONAL BANK","-1.050,01")],"difference",1],
  [[row("PAYMENT","-1.100,00"),row("REFUND","50,00")],"paid",0]
 ]){
  const x=A.evaluate(inv("INDIVIDUAL",rows),[ref()]);
  assert.equal(x.state,state);assert.equal(x.diff,diff);assert.equal(x.expected,105000);
  if(diff)assert.match(x.text,diff<0?/Under €0.01/:/Over €0.01/);
 }
});
test("pre-posting arrivals require an unambiguous positive matching list price",()=>{
 const i=inv("INDIVIDUAL",[row("PAYMENT","-1.050,00")]);
 const invalid=[[],[ref("0,00")],[ref("-150,00")],[ref("")],[ref("bad")],[{...ref(),currency:"USD"}],
  [ref(),ref("200,00")],...[{name:"OTHER GUEST"},{room:"102"},{arr:"13/09/26"},{dep:"22/09/26"}].map(c=>[{...ref(),...c}])];
 for(const refs of invalid){
  const x=A.evaluate(i,refs);assert.equal(x.state,"unknown");assert.equal(x.expected,undefined);assert.equal(x.tint,false);
 }
 const agency=inv("FICTIONAL AGENCY",i.rows);
 assert.equal(A.evaluate(agency,[ref("150,00","TOUR OPERATOR")]).state,"outside");
 assert.equal(A.evaluate(agency,[]).state,"unknown");
});
test("empty B uses list price for the unpaid amount but incomplete reads stay uncertain",()=>{
 const i=inv("INDIVIDUAL",[]);
 let x=A.evaluate(i,[ref()]);assert.equal(x.state,"unpaid");assert.equal(x.expected,105000);assert.equal(x.diff,-105000);assert.equal(x.tint,true);assert.match(x.text,/under €1,050.00/);
 x=A.evaluate(i,[ref("0,00")]);assert.equal(x.state,"unpaid");assert.equal(x.expected,undefined);
 i.complete=false;x=A.evaluate(i,[ref()]);assert.equal(x.state,"unknown");assert.equal(x.tint,false);assert.equal(x.expected,undefined);
});
test("live arrival updates on list capture and only adds a late night after a double posting",()=>{
 const s=new InvoiceState();
 s.accept({kind:"geometry",id:"arrival",rect:{},strip:{}},100);
 const packet=rows=>({kind:"invoice",id:"arrival",complete:true,data:{fields:["TEST GUEST","101","14/09/26","21/09/26","","INDIVIDUAL","","EUR","CI"],rows}});
 const payments=[row("PAYMENT","-1.050,00")];
 acceptInvoice(s,packet(payments),110);
 assert.equal(s.display([],120).result.state,"unknown");
 let x=s.display([ref()],130).result;assert.equal(x.state,"paid");assert.equal(x.nights,7);
 acceptInvoice(s,packet([...payments,row("*Arrangement","150,00")]),140);
 x=s.display([ref()],150).result;assert.equal(x.state,"paid");assert.equal(x.nights,7);
 acceptInvoice(s,packet([...payments,row("*Arrangement","300,00")]),160);
 x=s.display([ref()],170).result;assert.equal(x.state,"difference");assert.equal(x.nights,8);assert.equal(x.diff,-15000);
 acceptInvoice(s,packet([...payments,row("*Arrangement","300,00"),row("*Arrangement","150,00","15/09/26")]),180);
 x=s.display([ref()],190).result;assert.equal(x.nights,8);assert.equal(x.diff,-15000);
});


test("B grid maps with its Invoice across DPI and rejects missing or escaped geometry",()=>{
 const rect={x:2000,y:100,width:1800,height:900},strip={x:2600,y:250,width:600,height:30},grid={x:2600,y:290,width:780,height:600};
 const x=layout({rect,strip,grid},()=>({x:1400,y:66,width:1200,height:600}));
 assert.equal(x.grid.x,400);assert(Math.abs(x.grid.y-126.6666667)<0.000001);assert.equal(x.grid.width,520);assert.equal(x.grid.height,400);
 assert.deepEqual(x.strip,{x:400,y:100,width:400,height:20});
 for(const q of [undefined,null,{...grid,x:1999},{...grid,y:99},{...grid,width:1300},{...grid,height:800},{...grid,width:0},{...grid,y:NaN}]){
  assert.equal(layout({rect,strip,grid:q},r=>r),null);
 }
});


test("excluded metadata stays outside even before B rows are read",()=>{
 const i={...inv("FICTIONAL AGENCY"),complete:false,rows:[]};
 assert.equal(A.evaluate(i,[ref("150,00","TOUR OPERATOR")]).state,"outside","excluded incomplete metadata must remain outside");
 assert.equal(A.evaluate(i,[]).state,"unknown","missing eligibility is not a confirmed exclusion");
 assert.equal(A.evaluate(i,[ref("150,00","WEBHOTELIER")]).state,"unknown","eligible incomplete B cannot become paid");
});
test("metadata gates rows and invalidates old generations on reused invoices",()=>{
 const s=new InvoiceState(), refs=[ref("150,00","TOUR OPERATOR")];
 const fields=["TEST GUEST","101","14/09/26","21/09/26","","FICTIONAL AGENCY","0,00","EUR","CI"];
 s.accept({kind:"geometry",id:"same",rect:{},strip:{}},100);
 assert.equal(s.display(refs,110),null,"no emoji before eligibility metadata");
 const meta={kind:"metadata",id:"same",epoch:1,fields};
 s.accept(meta,120);assert.equal(s.readScope(refs),false);
 assert.equal(s.display(refs,130).result.state,"outside");
 s.accept({...meta,epoch:2,fields:fields.map((v,i)=>i===6?"-50,00":i===8?"CO":v)},140);
 assert.equal(s.display(refs,150).result.state,"outside","checkout must not flash unknown");
 const qualifying=[ref("150,00","WEBHOTELIER")];
 assert.equal(s.readScope(qualifying),true,"later list agency can activate B reads");
 assert.equal(s.display(qualifying,160).result.state,"unknown");
 const paid={kind:"invoice",id:"same",epoch:2,complete:true,data:{fields:s.meta?JSON.parse(s.fields):[],rows:[row("PAYMENT","-1.050,00")]}};
 s.accept(paid,170);assert.equal(s.display(qualifying,180).result.state,"paid");
 assert.equal(s.readScope(refs),false);assert.equal(s.display(refs,190).result.state,"outside");
 s.accept(paid,200); // in-flight rows cannot keep their value after re-enabling
 assert.equal(s.readScope(qualifying),true);
 assert.equal(s.display(qualifying,210).result.state,"unknown","resume needs fresh rows");
 s.accept({...meta,epoch:3,fields:fields.map((v,i)=>i===0?"OTHER GUEST":v)},220);
 s.accept(paid,230);
 assert.equal(s.inv.complete,false,"stale prior-generation rows are ignored");
 assert.equal(s.display(qualifying,240).result.state,"unknown");
});

console.log(tests+" arrangement tests passed");
