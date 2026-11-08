// Firefox: after page.goto(), actions hang on "waiting for navigation to finish" when the document was cached by
// another page in the same context and is served with stale-while-revalidate.
// Usage: node repro.mjs [swr|control|swr-pref-off] [trials]
import http from "node:http";
import { expect, firefox } from "@playwright/test";

const mode = process.argv[2] ?? "swr";
const trials = Number(process.argv[3] ?? 10);
const cacheControl = mode === "control" ? "max-age=0, must-revalidate" : "s-maxage=900, stale-while-revalidate=31535100";

const server = http.createServer((req, res) => {
	const headers = { "content-type": "text/html; charset=utf-8", "cache-control": cacheControl, etag: '"v1"' };
	if (req.headers["if-none-match"] === '"v1"') {
		res.writeHead(304, headers);
		res.end();
		return;
	}
	res.writeHead(200, headers);
	res.end("<!doctype html><title>t</title><h1>Hello</h1>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await firefox.launch({
	firefoxUserPrefs: mode === "swr-pref-off" ? { "network.http.stale_while_revalidate.enabled": false } : {},
});
let hangs = 0;
for (let i = 0; i < trials; i++) {
	const context = await browser.newContext();
	const other = await context.newPage();
	await other.goto(url); // caches the document
	const page = await context.newPage();
	await page.goto(url);
	await page.waitForTimeout(1_000);
	try {
		await expect(page.locator("h1")).toHaveText("Hello", { timeout: 5_000 });
	} catch (error) {
		hangs++;
		if (hangs === 1) console.log(String(error).split("\n").slice(0, 10).join("\n") + "\n");
	}
	await context.close();
}
console.log(`${mode}: ${hangs} of ${trials} hung (Playwright ${(await import("playwright/package.json", { with: { type: "json" } })).default.version}, Firefox ${browser.version()})`);
await browser.close();
server.close();
