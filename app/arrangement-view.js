"use strict";
window.arrangement.onPaint(p=>{
  const {result:r,strip:s,grid:g}=p;
  const icon=document.getElementById("icon"), detail=document.getElementById("detail"), tint=document.getElementById("tint");
  const size=Math.min(22,Math.max(16,s.height));
  const x=Math.min(innerWidth-size-2,s.x+s.width-size-3);
  const y=s.y+(s.height-size)/2;
  icon.textContent=r.icon||"🤔";icon.className=r.state;
  Object.assign(icon.style,{left:x+"px",top:y+"px",width:size+"px",height:size+"px"});
  const tintOK=g&&[g.x,g.y,g.width,g.height].every(Number.isFinite)&&g.x>=0&&g.y>=0
    &&g.width>0&&g.height>0&&g.x+g.width<=innerWidth+.5&&g.y+g.height<=innerHeight+.5;
  if(r.tint&&tintOK){
    Object.assign(tint.style,{left:g.x+"px",top:g.y+"px",width:g.width+"px",height:g.height+"px"});
    tint.style.display="block";
  }else tint.style.display="none";
  detail.textContent=r.text||"Checking accommodation";
  detail.className=r.state;
  detail.style.display=r.state==="paid"?"none":"block";
  detail.style.maxWidth=Math.min(460,s.width)+"px";
  detail.style.left=Math.max(2,s.x+s.width-Math.min(460,s.width))+"px";
  detail.style.top=(s.y+s.height+3)+"px";
  // Two frames replace the old guest’s paint before main reveals the click-through window.
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.arrangement.painted(JSON.stringify(p))));
});
