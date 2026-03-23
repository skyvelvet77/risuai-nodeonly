import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../../../..')
const factorySource = readFileSync(resolve(repoRoot, 'src/ts/plugins/apiV3/factory.ts'), 'utf8')

describe('node-hosted V3 plugin bridge regressions', () => {
  test('guest bridge transfers stream bodies back to the host', () => {
    const guestCollectTransferables = factorySource.match(/function collectTransferables\(obj, transferables = \[\]\) \{[\s\S]*?return transferables;\n    \}/)

    expect(guestCollectTransferables?.[0]).toContain('obj instanceof ReadableStream')
    expect(guestCollectTransferables?.[0]).toContain('obj instanceof WritableStream')
    expect(guestCollectTransferables?.[0]).toContain('obj instanceof TransformStream')
  })

  test('host bridge includes a WebKit fallback for streamed Response objects', () => {
    expect(factorySource).toContain('const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent);')
    expect(factorySource).toContain('if (isSafari && result instanceof Response && result.body)')
    expect(factorySource).toContain('const bodyText = await result.text();')
    expect(factorySource).toContain("__specialType: 'Response'")
  })
})
