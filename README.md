# Firefox: actions hang on "waiting for navigation to finish" after a stale-while-revalidate background revalidation

When a document was cached by another page in the same browser context, and is served with `stale-while-revalidate`,
Firefox serves it from the cache and revalidates it in the background. Playwright reports that revalidation as a
navigation of the page, and later actions wait for it to finish, which it never does:

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('h1')
Expected: "Hello"
Received: ""
Timeout:  5000ms

Call log:
  - Expect "toHaveText" locator('h1') with timeout 5000ms
  - waiting for locator('h1')
    - waiting for "http://127.0.0.1:42039/" navigation to finish...
```

## Reproduce

```sh
npm install
npx playwright install firefox
node repro.mjs swr 20           # Cache-Control: s-maxage=900, stale-while-revalidate=31535100
node repro.mjs control 20       # Cache-Control: max-age=0, must-revalidate
node repro.mjs swr-pref-off 20  # stale-while-revalidate, with network.http.stale_while_revalidate.enabled = false
```

`repro.mjs` serves a static page with an `ETag`, opens it in one page to cache it, then opens it in a second page of
the same context, waits a second, and asserts on the heading.

## Results

Playwright 1.65.0, Firefox 159.0, Node 26.13.0, Linux. One browser, trials run one after another.

| Mode           | Hung     |
| -------------- | -------- |
| `swr`          | 19 of 20 |
| `control`      | 0 of 20  |
| `swr-pref-off` | 0 of 20  |

## Observations

- Without the wait, the assertion usually runs before the revalidation is reported, and passes. In a test suite, any
  later action hangs instead: a click, an assertion after the click, and so on.
- `locator.textContent()` in place of `expect(locator).toHaveText()` did not hang (0 of 10).
- A single `page.goto()` reports two requests with `request.isNavigationRequest() === true`: the cached `200`, and a
  conditional request with `cache-control: max-age=0` that gets a `304`. Only one document is loaded.
- Chromium and WebKit do not revalidate documents this way, and are not affected.
- Found in a Next.js app: Next.js sends this `Cache-Control` header for prerendered pages that revalidate. A Firefox test
  that opens such a page in two tabs, and toggles a setting that syncs between them, failed in 29 of 30 runs.
- Possibly related: [#42183](https://github.com/microsoft/playwright/issues/42183) (same symptom, closed without a
  repro) and [#42731](https://github.com/microsoft/playwright/issues/42731) (same symptom, triggered by COOP).

## Workaround

Disable stale-while-revalidate in Firefox:

```js
launchOptions: {
  firefoxUserPrefs: { "network.http.stale_while_revalidate.enabled": false },
},
```
