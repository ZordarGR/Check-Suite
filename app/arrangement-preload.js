const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("arrangement",{
  onPaint: cb=>ipcRenderer.on("arrangement-paint",(_e,p)=>cb(p)),
  painted:p=>ipcRenderer.send("arrangement-painted",p)
});
