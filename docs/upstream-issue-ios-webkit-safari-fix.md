# Upstream Issue Draft: iOS WebKit V3 Plugin Bridge Fix

Use this document when opening an upstream issue or PR request against the NodeOnly maintainer.

## Suggested issue title

```text
iOS WebKit: V3 plugin streaming can trigger a second fallback request because Response.body is still transferred across the iframe bridge
```

## Suggested issue body

```md
## Summary

I tested `Risuai-NodeOnly` on iPhone and confirmed that the streaming request can fail across the V3 plugin iframe bridge, after which a second fallback request is sent.

In practice this means one user action can turn into two provider requests.

This is especially important for providers/plugins that bill per request.

## Reproduction result

Observed behavior:

1. a streaming request is sent
2. the bridge path fails when returning the streamed `Response`
3. the plugin falls back to a non-streaming request
4. a second provider request is sent

So the issue is not just "Safari has a rendering bug" or "streaming is flaky" — it can directly cause duplicate billable requests.

## Why this happens

`src/ts/plugins/apiV3/factory.ts` still posts streamed `Response.body` objects back across the iframe bridge.

On WebKit-based iOS browsers, transferring `ReadableStream` objects through this `postMessage(..., transferables)` path is fragile and can fail. When that happens, the plugin receives an error and retries through a fallback path.

That matches the behavior seen on iPhone.

## Important scope note

This does **not** look like the old Node-hosted `/proxy2` routing problem.

`Risuai-NodeOnly` already routes `fetchNative()` through local `/proxy2`, so the missing piece appears to be the WebKit bridge workaround itself.

## Likely affected browsers

This is confirmed on iPhone Safari.

It may also affect Chrome on iPhone, because Chrome on iOS still uses WebKit rather than Blink:

- https://chromium.googlesource.com/chromium/src/+/main/ios/web/
- https://chromium.googlesource.com/chromium/src.git/+/master/docs/ios/user_agent.md

So this is probably best treated as an iOS WebKit bridge issue rather than a Safari-brand-only issue.

## Main missing pieces

From comparing against a branch where this problem is already fixed, upstream `Risuai-NodeOnly` `v0.3.0` appears to be missing one remaining functional fix in `src/ts/plugins/apiV3/factory.ts` and one regression guard:

1. Host-side response serialization should add a WebKit fallback:
   - detect Safari/WebKit-style environment
   - if `result instanceof Response && result.body`
   - pre-read with `await result.text()`
   - send plain text plus response metadata instead of trying to transfer the stream itself

2. A targeted regression test should remain present so the WebKit bridge workaround cannot silently regress during refactors.

Guest-side `collectTransferables()` stream support is already present upstream as of `v0.3.0`.

Revalidated on 2026-03-23 against upstream `v0.3.0` (`a96f9ec4`): the host-side WebKit fallback and targeted regression test were still not present in upstream NodeOnly.

## Provider-side note

The host-side bridge fix is the main upstream issue and should be addressed in NodeOnly itself.

However, there is a second class of improvement that can create good synergy for individual providers:

- if a provider plugin reads SSE responses only with `response.body.getReader()`
- and does not have a fallback to `await response.text()`
- then it can still be more fragile in proxy or body-lock edge cases even after the bridge is fixed

In other words:

- **host bridge fix**: prevents the iframe/WebKit transfer failure that can trigger a duplicate fallback request
- **provider SSE fallback**: makes an individual plugin more tolerant when reading streamed responses

So the host bridge fix should still be treated as the primary upstream fix, but provider plugins that manually parse SSE can benefit from an additional safe-read pattern.

## Optional provider-side SSE hardening pattern

This is **not** meant as a NodeOnly core patch requirement for every plugin, and it is not tied to one specific provider implementation.

It is a general pattern that plugin authors can apply if their plugin manually parses SSE and currently assumes `response.body.getReader()` is always the only valid path.

Suggested pattern:

```js
async function safeReadResponseSSE(response) {
  let reader;

  try {
    if (response.body && typeof response.body.getReader === 'function') {
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }

      result += decoder.decode();
      return result;
    }
  } catch (e) {
    try { reader?.releaseLock(); } catch (_) {}
  }

  return await response.text();
}
```

This kind of helper is useful for provider plugins that:

- parse OpenAI-style SSE
- parse Claude-style SSE
- parse Responses API SSE
- or otherwise directly consume `ReadableStream` chunks

## Why mention provider-side changes here

The bridge fix and the provider-side SSE fallback solve different layers of the request flow.

The bridge fix solves the main NodeOnly/WebKit problem.

The provider-side fallback is an additional compatibility improvement for plugins that are customized or self-maintained. It is especially relevant in setups where users are running hand-modified provider scripts rather than only stock upstream plugins.

## Suggested patch

### 1. Guest-side `collectTransferables()` update

File:
- `src/ts/plugins/apiV3/factory.ts`

Suggested diff:

```diff
diff --git a/src/ts/plugins/apiV3/factory.ts b/src/ts/plugins/apiV3/factory.ts
--- a/src/ts/plugins/apiV3/factory.ts
+++ b/src/ts/plugins/apiV3/factory.ts
@@
     function collectTransferables(obj, transferables = []) {
         if (!obj || typeof obj !== 'object') return transferables;
 
         if (obj instanceof ArrayBuffer ||
             obj instanceof MessagePort ||
             obj instanceof ImageBitmap ||
+            obj instanceof ReadableStream ||
+            obj instanceof WritableStream ||
+            obj instanceof TransformStream ||
             (typeof OffscreenCanvas !== 'undefined' && obj instanceof OffscreenCanvas)) {
             transferables.push(obj);
         }
         else if (ArrayBuffer.isView(obj) && obj.buffer instanceof ArrayBuffer) {
             transferables.push(obj.buffer);
```

### 2. Host-side WebKit fallback before posting `Response` objects back to the iframe

File:
- `src/ts/plugins/apiV3/factory.ts`

Suggested diff:

```diff
diff --git a/src/ts/plugins/apiV3/factory.ts b/src/ts/plugins/apiV3/factory.ts
--- a/src/ts/plugins/apiV3/factory.ts
+++ b/src/ts/plugins/apiV3/factory.ts
@@
-                    response.result = this.serialize(result);
+                    // WebKit on iOS can fail when Response.body (ReadableStream)
+                    // is transferred through postMessage transferables.
+                    // Pre-read the body and send plain text instead.
+                    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent);
+                    if (isSafari && result instanceof Response && result.body) {
+                        try {
+                            const bodyText = await result.text();
+                            response.result = {
+                                __type: 'CALLBACK_STREAMS',
+                                __specialType: 'Response',
+                                value: bodyText,
+                                init: {
+                                    status: result.status,
+                                    statusText: result.statusText,
+                                    headers: Array.from(result.headers.entries())
+                                }
+                            };
+                        } catch (_) {
+                            response.result = this.serialize(result);
+                        }
+                    } else {
+                        response.result = this.serialize(result);
+                    }
 
                 } catch (err: any) {
                     response.error = err.message || "Host execution error";
                 } finally {
                     for (const id of usedAbortIds) this.abortControllers.delete(id);
```

## Optional regression test

Suggested file:
- `src/ts/plugins/apiV3/tests/nodeHostedPluginBridge.regression.test.ts`

Suggested content:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../../../..')
const factorySource = readFileSync(resolve(repoRoot, 'src/ts/plugins/apiV3/factory.ts'), 'utf8')

describe('node-hosted V3 plugin bridge regressions', () => {
  test('guest bridge transfers stream bodies back to the host', () => {
    const guestCollectTransferables = factorySource.match(/function collectTransferables\\(obj, transferables = \\[\\]\\) \\{[\\s\\S]*?return transferables;\\n    \\}/)

    expect(guestCollectTransferables?.[0]).toContain('obj instanceof ReadableStream')
    expect(guestCollectTransferables?.[0]).toContain('obj instanceof WritableStream')
    expect(guestCollectTransferables?.[0]).toContain('obj instanceof TransformStream')
  })

  test('host bridge includes a WebKit fallback for streamed Response objects', () => {
    expect(factorySource).toContain('const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent);')
    expect(factorySource).toContain('if (isSafari && result instanceof Response && result.body)')
    expect(factorySource).toContain('const bodyText = await result.text();')
    expect(factorySource).toContain(\"__specialType: 'Response'\")
  })
})
```

## Verification steps

1. start NodeOnly in normal node-hosted mode
2. open from desktop Chrome and confirm streaming still works normally
3. open from iPhone Safari and trigger the same plugin/provider streaming request
4. confirm only one provider request is issued
5. optionally repeat on Chrome for iPhone

## Why this matters

This is currently user-visible as a compatibility issue, but it also has a cost impact because it can duplicate billable requests.
```
