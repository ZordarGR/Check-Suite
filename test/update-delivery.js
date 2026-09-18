/* Public release delivery verification. Cloud only; downloads but never installs.
 * RELEASE_VERSION defaults to 1.17.81. Uses the immutable released 1.17.76 updater,
 * so this also checks the update path already installed on users' machines.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const EXPECTED = process.env.RELEASE_VERSION || "1.17.81";
const OLD_COMMIT = "41485a87f5904f562585418c4c43833207596d4f";
const ROOT = "https://raw.githubusercontent.com/ZordarGR/Check-Suite/";
const MANIFEST = ROOT + "main/update/latest.json";
const OLD_UPDATER = ROOT + OLD_COMMIT + "/app/updater.js";
const MAX_INSTALLER = 256 * 1024 * 1024;
const MAX_TEXT = 4 * 1024 * 1024;
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

async function main(){
  assert.equal(process.env.CI, "true", "Cloud-only test: CI=true is required; do not run on the hotel PC");
  assert.match(EXPECTED, /^\d+\.\d+\.\d+$/, "Invalid RELEASE_VERSION");
  assert.equal(typeof fetch, "function", "Node.js 20 or later is required");
  const nativeFetch = global.fetch, overall = new AbortController();
  const timer = setTimeout(() => overall.abort(new Error("Delivery verification exceeded five minutes")), 300000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reccheck-delivery-"));
  let setupUrl = "", htmlUrl = "", requests = 0, lastFailure = "";
  // Limit both headers and the streamed response. The old updater's own network
  // calls use this wrapper too; a stalled or oversized installer cannot hang CI.
  global.fetch = async (url, options = {}) => {
    const u = new URL(String(url)), canonical = u.origin + u.pathname;
    assert([MANIFEST, OLD_UPDATER, setupUrl, htmlUrl].includes(canonical), "Unexpected delivery URL: " + canonical);
    assert(++requests <= 6, "Unexpected repeated download attempts");
    const limit = canonical === setupUrl ? MAX_INSTALLER : MAX_TEXT;
    try{
      const response = await nativeFetch(url, {...options, redirect:"follow", cache:"no-store",
        signal:AbortSignal.any([overall.signal, AbortSignal.timeout(180000)])});
      assert(response.ok, "HTTP " + response.status + " from " + canonical);
      const length = Number(response.headers.get("content-length") || 0);
      assert(length <= limit, "Download exceeds size limit: " + canonical);
      assert(response.body, "Empty response stream: " + canonical);
      let bytes = 0;
      const limited = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller){
          bytes += chunk.byteLength;
          if(bytes > limit){lastFailure = "Stream exceeds size limit: " + canonical;throw new Error(lastFailure);}
          controller.enqueue(chunk);
        }
      }));
      return new Response(limited, {status:response.status, statusText:response.statusText, headers:response.headers});
    }catch(e){lastFailure = e.message;throw e;}
  };
  try{
    const manifestResponse = await fetch(MANIFEST + "?_delivery=" + Date.now());
    const manifest = await manifestResponse.json();
    assert.equal(manifest.version, EXPECTED, "Public main manifest has the wrong version");
    assert.equal(manifest.type, "full", "This release must advertise a full installer");
    assert.match(manifest.setupSha256 || "", /^[a-f0-9]{64}$/i, "Missing installer SHA-256");
    assert.match(manifest.sha256 || "", /^[a-f0-9]{64}$/i, "Missing HTML SHA-256");
    assert.match(manifest.setup || "", new RegExp("^https://github\\.com/ZordarGR/Check-Suite/releases/download/v" + EXPECTED.replace(/\./g,"\\.") + "/[^/?#]+\\.exe$"), "Installer URL is not pinned to the expected release");
    assert.match(manifest.html || "", /^https:\/\/raw\.githubusercontent\.com\/ZordarGR\/Check-Suite\/[a-f0-9]{40}\/Departments%20Check\.html$/i, "HTML URL must use an immutable source commit");
    setupUrl = manifest.setup;htmlUrl = manifest.html;

    const updaterSource = await (await fetch(OLD_UPDATER)).text();
    const updaterPath = path.join(dir, "released-updater.cjs");
    fs.writeFileSync(updaterPath, updaterSource);
    const {Updater} = require(updaterPath);
    assert.equal(typeof Updater, "function", "Released updater does not export Updater");
    const updater = new Updater({userDataDir:path.join(dir,"profile"), packagedDir:dir,
      pkgVersion:"1.17.76", updateUrl:MANIFEST,
      fallbackReleaseUrl:"https://github.com/ZordarGR/Check-Suite/releases/latest"});
    const pending = await updater.check();
    assert(pending && pending.full && pending.downloaded, "Released updater did not download the installer" + (lastFailure ? ": " + lastFailure : ""));
    assert.equal(pending.version, EXPECTED, "Released updater selected the wrong version");
    assert.equal(typeof pending.setupPath, "string", "Released updater did not return an installer path");
    assert(path.resolve(pending.setupPath).startsWith(path.resolve(dir) + path.sep), "Installer must stay in the temporary cloud directory");
    const installer = fs.readFileSync(pending.setupPath);
    assert(installer.length >= 1048576 && installer.length <= MAX_INSTALLER, "Unexpected installer size");
    assert.equal(installer.subarray(0,2).toString("latin1"), "MZ", "Installer is not a Windows executable");
    const installerSha = sha(installer);
    assert.equal(installerSha, manifest.setupSha256.toLowerCase(), "Downloaded installer SHA-256 differs from the public manifest");

    const html = Buffer.from(await (await fetch(htmlUrl)).arrayBuffer());
    assert(html.length >= 10000, "Published HTML is unexpectedly short");
    assert(html.subarray(0,200).toString("utf8").includes("<!DOCTYPE html"), "Published artifact is not app HTML");
    const htmlSha = sha(html);
    assert.equal(htmlSha, manifest.sha256.toLowerCase(), "Pinned HTML SHA-256 differs from the public manifest");
    const version = html.toString("utf8").match(/\bconst\s+APP_VERSION\s*=\s*["']([^"']+)["']/);
    assert(version, "Published HTML has no APP_VERSION");
    assert.equal(version[1], EXPECTED, "Pinned HTML declares the wrong version");
    console.log("DELIVERY_VERIFIED " + JSON.stringify({version:EXPECTED, updaterVersion:"1.17.76",
      updaterCommit:OLD_COMMIT, installerBytes:installer.length, installerSha256:installerSha,
      htmlBytes:html.length, htmlSha256:htmlSha, htmlCommit:new URL(htmlUrl).pathname.split("/")[3],
      requests, installed:false}));
  }finally{
    clearTimeout(timer);overall.abort();global.fetch = nativeFetch;
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
main().catch(e => {console.error("DELIVERY_FAILED: " + (e.stack || e.message || e));process.exitCode = 1;});
