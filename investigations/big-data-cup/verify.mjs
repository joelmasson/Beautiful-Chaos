// Standalone Chromium diagnostic checks, using Node's built-in WebSocket/CDP.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const profile = await mkdtemp(join(tmpdir(), "bdc-diagnostic-"));
const chrome = spawn(process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const exited = once(chrome, "exit");
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not expose DevTools within 15 seconds")), 15000);
    chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
    chrome.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(new URL(match[1])); }
    });
  });
  const target = await (await fetch(`http://${endpoint.host}/json/new?http://127.0.0.1:3041`, { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, "open");
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
    if (!pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer); pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send("Page.bringToFront");
  await evaluate(`new Promise((resolve,reject)=>{
    const start=performance.now(); const timer=setInterval(()=>{
      if(!document.querySelector('#play')?.disabled){clearInterval(timer);resolve(true);}
      else if(performance.now()-start>10000){clearInterval(timer);reject(new Error('Data not ready'));}
    },20);
  })`);
  const seek = (index) => evaluate(`(()=>{const s=document.querySelector('#timeline');s.value=${index};s.dispatchEvent(new Event('input'));return s.value;})()`);
  const hash = () => evaluate("document.querySelector('canvas').toDataURL()");
  const initial = await hash();
  await seek(480);
  const expected = await hash();
  await seek(182);
  assert.match(await evaluate("document.querySelector('#status').textContent"), /1 rows missing XY/);
  await seek(720);
  await seek(480);
  assert.equal(await hash(), expected);
  await evaluate("document.querySelector('#reset').click()");
  assert.equal(await hash(), initial);
  await evaluate("document.querySelector('#play').click()");
  await new Promise((resolve) => setTimeout(resolve, 600));
  await evaluate("document.querySelector('#play').click()");
  const advanced = Number(await evaluate("document.querySelector('#timeline').value"));
  assert.ok(advanced > 0, "Playback must advance real browser frames");
  const paused = await hash();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await hash(), paused);
  await evaluate("document.querySelector('#reset').click()");
  assert.equal(await hash(), initial);
  const screenshots = fileURLToPath(new URL("./screenshots/", import.meta.url));
  await mkdir(screenshots, { recursive: true });
  await evaluate("document.querySelector('#ids').click()");
  const captures = [];
  for (const [frame, name] of [[240, "08s"], [480, "16s"], [720, "24s"]]) {
    await seek(frame);
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(join(screenshots, `${name}.png`), Buffer.from(data, "base64"));
    captures.push(await evaluate("document.querySelector('#status').textContent"));
  }
  await evaluate("document.querySelector('#puck').click()");
  const hidden = await hash();
  await evaluate("document.querySelector('#puck').click()");
  assert.notEqual(await hash(), hidden);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, advancedFrames: advanced, repeatedSeek: "pixel-identical",
    missingXY: "explicit", reset: "exact", pause: "stable", captures }, null, 2));
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await exited;
  await rm(profile, { recursive: true, force: true });
}
