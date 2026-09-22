// Cloud fixture only: exercise the same Node child-process pipes used by the app.
"use strict";
const {spawn}=require("child_process");
const child=spawn(process.argv[2],["invoice",process.argv[3]],{windowsHide:true,stdio:["pipe","pipe","inherit"]});
child.stdout.pipe(process.stdout);
let buffer="";
process.stdin.setEncoding("utf8");
process.stdin.on("data",chunk=>{
 buffer+=chunk;
 if(buffer.length>4096)throw Error("fixture scope input exceeded its bound");
 let end;
 while((end=buffer.indexOf("\n"))>=0){
  // .NET's fixture StreamWriter emits a UTF-8 preamble even before raw writes.
  const line=buffer.slice(0,end).replace(/^\uFEFF/,"").trim();
  buffer=buffer.slice(end+1);
  if(!line)continue;
  if(!/^scope \d+ (?:read|skip)(?: [1-9]\d*)?$/.test(line))throw Error("invalid fixture scope command");
  child.stdin.write(line+"\n");
 }
});
child.stdin.on("error",err=>{throw err;});
child.on("error",err=>{throw err;});
child.on("exit",code=>process.exit(code===null?1:code));
