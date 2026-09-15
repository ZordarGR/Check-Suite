const assert=require("assert"), A=require("../app/arrangement"), {InvoiceState,layout}=require("../app/arrangement-live");
let tests=0;
const test=(name,fn)=>{fn();tests++;console.log("ok "+name);};
const row=(label,amount,date="14/09/26")=>({label,amount,date,currency:"EUR"});
const inv=(title="INDIVIDUAL",rows=[row("*Arrangement","150,00")])=>({complete:true,name:"TEST GUEST",room:"101",arr:"14/09/26",dep:"21/09/26",currency:"EUR",title,rows});
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
 s.accept(g,100);s.accept({kind:"invoice",id:"one",complete:true,data:{fields:["TEST GUEST","101","14/09/26","21/09/26","","INDIVIDUAL","","EUR","CI"],rows:[row("*Arrangement","150,00")]}},110);
 assert.equal(s.display([ref()],200).result.state,"unpaid");assert.equal(s.display([],1000),null);
 s.accept({kind:"reset",id:"one"},210);assert.equal(s.display([],220).result.state,"unknown");
 s.accept({kind:"hide"},230);assert.equal(s.display([],240),null);
 s.accept({...g,id:"two"},250);assert.equal(s.display([],260).result.state,"unknown");
});
test("overlay coordinates follow resize, movement and DPI through parent mapping",()=>{
 const a=layout({rect:{x:2000,y:100,width:1800,height:900},strip:{x:2600,y:250,width:600,height:30}},r=>({x:1400,y:66,width:1200,height:600}));
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
 s.accept(m,110);assert.equal(s.display([],150).result.state,"unknown");
 assert.equal(s.display([ref()],160).result.state,"paid");
 s.accept({...m,data:{...m.data,rows:[null]}},170);assert.equal(s.display([ref()],180).result.state,"unknown");
});
test("four-digit invoice dates are preserved",()=>{
 const i=inv("INDIVIDUAL",[row("*Arrangement","150,00","14/09/2026"),row("PAYMENT","-1.050,00","13/09/2026")]);
 assert.equal(A.evaluate(i,[ref()]).state,"paid");
});
test("a completely read empty B is unpaid; an incomplete empty B stays uncertain",()=>{
 const i=inv("INDIVIDUAL",[]);assert.equal(A.evaluate(i,[ref()]).tint,true);
 i.complete=false;assert.equal(A.evaluate(i,[ref()]).state,"unknown");
});
console.log(tests+" arrangement tests passed");
