const {app, BrowserWindow, ipcMain, shell, dialog} = require("electron");
const path = require("path");
const {pathToFileURL} = require("url");
const {Updater} = require("./updater.js");
const {FileHub} = require("./files.js");

const PKG_VERSION = require("./package.json").version;
const REPO_RAW = "https://raw.githubusercontent.com/ZordarGR/Check-Suite/main";
const ISSUES_URL = "https://github.com/ZordarGR/Check-Suite/issues";

let win = null, updater = null, hub = null;

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
  hub = new FileHub({
    configPath: path.join(app.getPath("userData"), "config.json"),
    onDirEvent: () => { if(win && !win.isDestroyed()) win.webContents.send("reccheck-dir-event"); }
  });
  hub.startWatch();
  const eff = updater.effective();
  createWindow(eff.file);
  updater.check().then(info => {
    if(info && win && !win.isDestroyed())
      win.webContents.send("reccheck-update-ready", info);
  });
});

ipcMain.handle("reccheck-apply-update", () => {
  if(!updater || !updater.pending) return false;
  if(updater.pending.full){ shell.openExternal(updater.pending.url); return true; }
  if(!updater.promote()) return false;
  app.relaunch();
  app.exit(0);
  return true;
});
ipcMain.handle("reccheck-get-version", () => updater ? updater.effective().version : PKG_VERSION);

ipcMain.handle("files-get-dir", () => hub ? hub.getDir() : null);
ipcMain.handle("files-pick-dir", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Choose the folder where the protel reports are saved"
  });
  if(r.canceled || !r.filePaths[0]) return hub.getDir();
  return hub.setDir(r.filePaths[0]);
});
ipcMain.handle("files-list", () => hub ? hub.list() : {dir: null, files: []});
ipcMain.handle("files-read", (_e, p) => hub.read(p));
ipcMain.handle("open-help", () => { shell.openExternal(ISSUES_URL); return true; });

app.on("window-all-closed", () => app.quit());
