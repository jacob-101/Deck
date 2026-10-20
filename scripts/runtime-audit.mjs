import { _electron as electron } from "playwright";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const temp = await mkdtemp(join(tmpdir(), "openpdf-audit-"));
const output = resolve("test-results/runtime-audit");
await mkdir(output, { recursive: true });
const executable = resolve(
  "release/mac-arm64/Deck.app/Contents/MacOS/Deck",
);
const app = await electron.launch({
  executablePath: executable,
  env: { ...process.env, OPENPDF_TEST_USER_DATA: join(temp, "profile") },
});
const page = await app.firstWindow();
const report = { network: [], console: [], pageErrors: [] };
page.on("pageerror", (error) => report.pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.console.push(message.text());
});
page.on("request", (request) => {
  report.network.push({
    method: request.method(),
    url: request.url(),
    type: request.resourceType(),
  });
});
await page.getByRole("button", { name: /Take a look around/ }).click();
await page.locator('.page-stage .pdf-page[data-ready="true"]').waitFor();
await page.waitForTimeout(3000);
const pid = app.process().pid;
let sockets = [];
try {
  sockets = execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", String(pid), "-i"], {
    encoding: "utf8",
  })
    .split("\n")
    .slice(1)
    .filter(Boolean);
} catch {
  sockets = [];
}
const childPids = execFileSync("/usr/bin/pgrep", ["-P", String(pid)], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const childSockets = [];
for (const child of childPids) {
  try {
    childSockets.push(
      execFileSync("/usr/sbin/lsof", ["-nP", "-a", "-p", child, "-i"], {
        encoding: "utf8",
      })
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => `pid ${child}: ${line}`),
    );
  } catch {
    /* no sockets */
  }
}
const traversal = await page.evaluate(async () => {
  const results = [];
  for (const target of [
    "studio://app/../../../../etc/passwd",
    "studio://app/%2e%2e%2f%2e%2e%2fetc/passwd",
    "studio://app/index.html",
    "studio://evil/index.html",
  ]) {
    try {
      const response = await fetch(target);
      const text = await response.text();
      results.push({ target, status: response.status, head: text.slice(0, 60) });
    } catch (cause) {
      results.push({ target, error: String(cause) });
    }
  }
  return results;
});
const webPreferences = await app.evaluate(({ BrowserWindow }) => {
  const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
  return {
    sandbox: prefs.sandbox,
    contextIsolation: prefs.contextIsolation,
    nodeIntegration: prefs.nodeIntegration,
    nodeIntegrationInWorker: prefs.nodeIntegrationInWorker,
    nodeIntegrationInSubFrames: prefs.nodeIntegrationInSubFrames,
    webSecurity: prefs.webSecurity,
    allowRunningInsecureContent: prefs.allowRunningInsecureContent,
    experimentalFeatures: prefs.experimentalFeatures,
    spellcheck: prefs.spellcheck,
    plugins: prefs.plugins,
  };
});
await page.screenshot({ path: join(output, "packaged-app.png") });
await app.close();
report.sockets = sockets;
report.childSockets = childSockets.flat();
report.traversal = traversal;
report.webPreferences = webPreferences;
console.log(JSON.stringify(report, null, 2));
