const {app, BrowserWindow} = require("electron");

function createWindow(){
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    autoHideMenuBar: true,
    backgroundColor: "#0a0e14",
    title: "REC CHECK",
    webPreferences: { contextIsolation: true }
  });
  win.loadFile("index.html");
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
