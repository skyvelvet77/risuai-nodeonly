# Custom Branch Change Log: iOS WebKit Safari Fix

Date: 2026-03-23

Branch: `custom`

Purpose: maintain a NodeOnly branch that fixes the iPhone Safari / iOS WebKit V3 plugin bridge issue and automatically publishes a Docker image that can be used directly from GHCR.

## Why this branch exists

The upstream NodeOnly branch already has its own Node-only proxy and auth architecture, but it is still missing the WebKit iframe bridge workaround needed for iPhone Safari and similar iOS WebKit browsers.

Without this fix, a streaming plugin request can fail while returning `Response.body` across the iframe boundary and then trigger a second fallback request.

For providers that bill per request, that can create duplicate request charges.

## Carry-Forward Checklist For Future Upstream Updates

When upstream releases a new version and this custom branch has to be rebased or re-ported, these are the core items that must be checked first and kept unless upstream has clearly merged equivalent behavior:

1. Guest-side `collectTransferables()` must include `ReadableStream`, `WritableStream`, and `TransformStream`.
2. Host-side response serialization in `src/ts/plugins/apiV3/factory.ts` must use the Safari/WebKit `await result.text()` fallback for streamed `Response` objects.
3. `src/ts/plugins/apiV3/tests/nodeHostedPluginBridge.regression.test.ts` must remain present and passing so the bridge fix cannot silently regress.
4. `.github/workflows/docker-build.yml` must continue publishing `custom` branch images so the patched branch stays deployable without manual image building.

These are the branch's essential carry-forward items.

By contrast, provider-local SSE safe-read logic is useful synergy for self-modified plugins, but it is not the primary branch-level carry-forward requirement.

This checklist was revalidated while porting the branch onto upstream `v0.3.0` on 2026-03-23.

At that point upstream already included guest-side stream transferables, but it still did not include the host-side WebKit bridge workaround, the targeted regression test, or the custom-branch Docker publish behavior.

## Exact code changes

### 1. `src/ts/plugins/apiV3/factory.ts`

#### Guest-side transferable detection

Updated the guest-side `collectTransferables()` helper to treat the following as transferables:

- `ReadableStream`
- `WritableStream`
- `TransformStream`

Why:

- This keeps the guest bridge behavior consistent with the host-side stream handling
- It also matches the expected behavior encoded in the new regression test

#### Host-side Safari/WebKit fallback

Updated the host message handler so that when:

- the browser is Safari/WebKit-style
- `result instanceof Response`
- and `result.body` exists

the bridge does **not** try to send the `ReadableStream` body back as a transferable.

Instead it now:

1. reads the body with `await result.text()`
2. serializes the body as plain text
3. preserves:
   - `status`
   - `statusText`
   - `headers`
4. returns a `CALLBACK_STREAMS` payload that reconstructs into a `Response`

Why:

- WebKit can fail when a streamed `Response.body` is transferred through `postMessage(..., transferables)`
- when that transfer fails, the plugin can retry using a second non-streaming request
- pre-reading the response body avoids that bridge failure path

### 2. `src/ts/plugins/apiV3/tests/nodeHostedPluginBridge.regression.test.ts`

Added a targeted regression test covering the new custom-branch behavior.

The test checks:

- guest-side stream transferable support exists
- host-side Safari/WebKit fallback logic exists
- the fallback pre-reads `result.text()`
- the fallback preserves `Response` reconstruction shape

Why:

- this issue is easy to reintroduce during refactors
- a small source-level regression test is cheap and catches that regression early

### 3. `.github/workflows/docker-build.yml`

Updated the existing Docker publishing workflow so that:

- tag pushes continue to publish release images
- pushes to the `custom` branch also publish a reusable custom image

Custom branch image tags:

- `ghcr.io/skyvelvet77/risuai-nodeonly:custom`
- `ghcr.io/skyvelvet77/risuai-nodeonly:sha-<shortsha>`

Release tag behavior kept:

- `latest`
- `v<version>`
- `v<minor>`

Why:

- the branch should be directly consumable from Docker without waiting for upstream
- SHA tags make rollback and pinning easy

## What should be proposed upstream

These changes should be proposed to the NodeOnly maintainer for upstream merge:

1. host-side Safari/WebKit `Response.text()` fallback in `factory.ts`
2. the targeted regression test

As of upstream `v0.3.0`, guest-side `collectTransferables()` stream support was already present and no longer needed to be proposed separately.

## Provider-side synergy note

This custom branch fixes the NodeOnly host bridge itself, which is the primary problem.

But some provider plugins can still benefit from their own SSE-read fallback if they:

- directly call `response.body.getReader()`
- manually parse SSE
- do not have a fallback to `await response.text()`

That means the strongest real-world setup is often:

1. fix the NodeOnly iframe bridge in core
2. for customized provider plugins, add a safe SSE reader that can fall back from `getReader()` to `text()`

This is not limited to one named provider.

It applies to any plugin that manually parses streamed SSE output and assumes the stream reader path is always available.

Example helper pattern:

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

So if a user is running a self-modified provider plugin, the core branch fix and the provider-side safe-read fallback work well together.

## What is custom-branch specific

The GHCR branch-publish behavior is custom-branch infrastructure and does not have to be merged upstream unless the maintainer wants that behavior.

In other words:

- code fix and regression test: good upstream candidates
- `custom` branch image automation: local branch management choice

## Verification commands

Targeted regression test:

```bash
corepack pnpm vitest run src/ts/plugins/apiV3/tests/nodeHostedPluginBridge.regression.test.ts
```

Build:

```bash
corepack pnpm build
```

## Docker image references

Primary image for daily use:

```text
ghcr.io/skyvelvet77/risuai-nodeonly:custom
```

Pinned image for rollback or exact deployment:

```text
ghcr.io/skyvelvet77/risuai-nodeonly:sha-<shortsha>
```

## Docker usage

Example `docker-compose.yml` snippet:

```yaml
services:
  risuai-nodeonly:
    image: ghcr.io/skyvelvet77/risuai-nodeonly:custom
    ports:
      - "6001:6001"
```

## Upstream-facing summary

The upstream NodeOnly branch already solved the old local `/proxy2` routing issue in its own architecture.

The missing piece was specifically the iOS WebKit iframe bridge workaround in `src/ts/plugins/apiV3/factory.ts`.

On top of upstream `v0.3.0`, this custom branch keeps the missing host-side bridge fix, locks it down with a regression test, and publishes a ready-to-use Docker image from the `custom` branch.
