/**
 * Chrome resolution for the PDF and PNG backends.
 *
 * Puppeteer normally downloads its own Chrome from a postinstall script. An OS
 * package installs with that script disabled and expects a system browser
 * instead, so the download never happens and puppeteer's default path points at
 * nothing.
 */

import { existsSync } from "node:fs";

const SYSTEM_BROWSERS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
];

/** Launch Chrome, preferring puppeteer's own download and falling back to a system install. */
export async function launchBrowser() {
  const puppeteer = (await import("puppeteer")).default;

  // Puppeteer reads PUPPETEER_EXECUTABLE_PATH itself.
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return puppeteer.launch();

  if (existsSync(puppeteer.executablePath())) return puppeteer.launch();

  const system = SYSTEM_BROWSERS.find(existsSync);
  if (!system) {
    throw new Error(
      "No Chrome available to render PDF or PNG output. Install a system Chrome or " +
        "Chromium, run `npx puppeteer browsers install chrome`, or point " +
        "PUPPETEER_EXECUTABLE_PATH at a browser.",
    );
  }
  return puppeteer.launch({ executablePath: system });
}
