/* Synthetic turnover and consolidation cases. Runs the shipped functions. */
const fs=require("fs"), assert=require("assert");
const src=fs.readFileSync("app/index.html","utf8");
function lift(n){
 const at=src.indexOf("\nfunction "+n+"(");if(at<0)return "";
 let d=0,start=src.indexOf("{",at);
 for(let j=start;j<src.length;j++){if(src[j]==="{")d++;else if(src[j]==="}"&&!--d)return src.slice(at+1,j+1);}
 throw Error(n);
}
const names=["sameName","nameWordSet","nameLike","isCutOf","nameTextIn","sameGuestLabel","nameHit","expandReceiptName","receiptFullName","receiptName","guestFor","dateNum","dateNum2","pillRoom","statusRows","departureRows","capturedGuestName","censusNameOf","otherNames","isLeaving"];
const old="MORGAN/BRIGGS DAVID/ELENA", fresh="KELLER/STONE ANNA/MORGAN";
const run=(rooms,receipts,rivals={"120":["MORGAN/BRIGGS DAVID/ELENA"]})=>new Function("ROOMS","MODEL","STATE","LEAVING",
 names.map(lift).join("\n")+ '\nconst rState=r=>STATE[r.sn]||{}; const effRoom=r=>r.roomMain; let ARRIVING={}; return {guestFor,receiptName,nameHit,isLeaving,otherNames};'
)(rooms,{reportDate:"4/9/2026",receipts},{},rivals);
let bad=0;
const check=(name,condition)=>{console.log((condition?"PASS ":"FAIL ")+name);if(!condition)bad++;};
const r={sn:"1",roomMain:"120",guest:fresh};
let api=run({"120":{guest:old,liveKey:20260904}},[r]);
check("same-day old room cache cannot rename the new receipt",api.guestFor("120",r)===fresh);
api=run({"120":{guest:fresh,liveKey:20260904}},[r]);
check("new guest sharing one name word is not LEFT TODAY",!api.isLeaving("120",fresh));
check("one shared word cannot validate unmatched receipt characters",!api.nameHit(fresh,old,[]));
check("the complete printed first-name fragment can match inside the full name",api.nameHit("ANNA/MORG",fresh,[]));
check("characters in another order cannot match",!api.nameHit("MORGAN/ANNA",fresh,[]));
check("a fragment matching two guests is ambiguous",!api.nameHit("MORGAN",old,[fresh]));
const partial={sn:"2",roomMain:"120",guest:"ANNA/MORG"};
check("middle-of-name text expands to the in-house full name",api.guestFor("120",partial)===fresh&&api.receiptName(partial)===fresh);
check("unmatched characters are never discarded",api.guestFor("120",{...partial,guest:"ANNA/MORT"})==="ANNA/MORT");
check("a fragment shared with the captured departure is not expanded to the new guest",api.receiptName({sn:"3",roomMain:"120",guest:"MORGAN"})==="MORGAN");
check("the original departing guest still matches",api.isLeaving("120",old));
const oldPaper={sn:"4",roomMain:"120",guest:old}, shortPaper={sn:"5",roomMain:"120",guest:"MORGAN"};
api=run({"120":{guest:fresh,liveKey:20260904}},[oldPaper,shortPaper]);
check("the first receipt fallback cannot assign an ambiguous fragment to the previous guest",api.guestFor("120",shortPaper)==="MORGAN");
for(const [full,printed] of [["SMITH ALEX/TAYLOR","ALEX/TAYLOR SMIT"],["SMITH ALEX MARIE/TAYLOR","ALEX MARIE/TAYLOR SMIT"],["SMITH/JONES ALEX/TAYLOR","ALEX/TAYLOR SMITH/JO"]]){
 const paper={sn:"10",roomMain:"120",guest:printed};
 const a=run({"120":{guest:full,liveKey:20260904}},[paper],{});
 check("unique reordered complete receipt text expands for display: "+printed,a.guestFor("120",paper)===full);
 check("reordered display does not broaden receipt identity or departure decisions",a.receiptName(paper)===printed&&!a.nameHit(printed,full,[]));
}
{
 const full="SMITH ALEX/TAYLOR",paper={sn:"11",roomMain:"120",guest:"ALEX/TAYLOR SMIT"};
 const rooms={"120":{guest:full,liveKey:20260904}};
 check("two matching captured surnames remain ambiguous",run(rooms,[paper],{"120":["SMITHSON ALEX/TAYLOR"]}).guestFor("120",paper)===paper.guest);
 check("another room cannot supply the full name",run({"121":rooms["120"]},[paper],{}).guestFor("120",paper)===paper.guest);
 for(const printed of ["ALEX/OTHER SMIT","TAYLOR/ALEX SMIT","ALEX-TAYLOR SMIT","ALEX/TAYLOR JONE"]){
  const p={...paper,guest:printed};check("reordered match retains every character: "+printed,run(rooms,[p],{}).guestFor("120",p)===printed);
 }
 const other={...paper,sn:"12",guest:"SMITH ALEX"};
 check("conflicting printed fragments remain unexpanded",run(rooms,[paper,other],{}).guestFor("120",paper)===paper.guest);
 const rivalPaper={...paper,sn:"13",guest:"ALEX/TAYLOR SMITHSON"};
 check("a longer printed surname rival blocks a shorter rotated match",run(rooms,[paper,rivalPaper],{}).guestFor("120",paper)===paper.guest);
}
process.exitCode=bad?1:0;
