const {app, BrowserWindow, ipcMain, shell} = require("electron");
const path = require("path");
const {pathToFileURL} = require("url");
const {Updater} = require("./updater.js");

const PKG_VERSION = require("./package.json").version;
const REPO_RAW = "https://raw.githubusercontent.com/ZordarGR/Check-Suite/main";

let win = null;
let updater = null;

function createWindow(file){
  win = new BrowserWindow({
    width: 1180,
    height: 860,
    autoHideMenuBar: true,
    backgroundColor: "#0a0e14",
    title: "REC CHECK",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.loadURL(pathToFileURL(file).toString());
  win.webContents.once("did-finish-load", () => {
    if(updater && updater.pending)
      win.webContents.send("reccheck-update-ready", updater.pending);
  });
}

app.whenReady().then(() => {
  updater = new Updater({
    userDataDir: app.getPath("userData"),
    packagedDir: __dirname,
    pkgVersion: PKG_VERSION,
    updateUrl: (process.env.RECCHECK_UPDATE_URL || REPO_RAW + "/update/latest.json"),
    fallbackReleaseUrl: "https://github.com/ZordarGR/Check-Suite/releases/latest"
  });
  const eff = updater.effective();
  createWindow(eff.file);
  updater.check().then(info => {
    if(info && win && !win.isDestroyed())
      win.webContents.send("reccheck-update-ready", info);
  });
});

ipcMain.handle("reccheck-apply-update", () => {
  if(!updater || !updater.pending) return false;
  if(updater.pending.full){
    shell.openExternal(updater.pending.url);
    return true;
  }
  if(!updater.promote()) return false;
  app.relaunch();
  app.exit(0);
  return true;
});
ipcMain.handle("reccheck-get-version", () => updater ? updater.effective().version : PKG_VERSION);

app.on("window-all-closed", () => app.quit());
