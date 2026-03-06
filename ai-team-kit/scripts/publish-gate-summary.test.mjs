import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '..')
const scriptPath = path.join(projectRoot, 'scripts', 'publish-gate-summary.mjs')

const run = (args, cwd) =>
  execFileSync(process.execPath, [scriptPath, ...args], {
    stdio: 'pipe',
    cwd
  }).toString()

test('publish script renders markdown for present artifacts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-publish-summary-'))

  try {
    const a = path.join(tempDir, 'a.json')
    const b = path.join(tempDir, 'b.json')
    fs.writeFileSync(a, JSON.stringify({ passed: true, exit_code: 0, reason: 'ok' }, null, 2) + '\n')
    fs.writeFileSync(
      b,
      JSON.stringify({ gate_outcome: { passed: false, exit_code: 2, reason: 'reject_gate_failed' } }, null, 2) +
        '\n'
    )

    const output = run(['--markdown', a, b], tempDir)
    assert.match(output, /AI Team Kit CI Gate Summary/)
    assert.match(output, /passed=true, exit_code=0, reason=ok/)
    assert.match(output, /passed=false, exit_code=2, reason=reject_gate_failed/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('publish script marks missing artifacts in markdown output', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-publish-missing-'))

  try {
    const missing = path.join(tempDir, 'missing.json')
    const output = run(['--markdown', missing], tempDir)
    assert.match(output, /\(missing\)/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('publish script returns json output by default', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-publish-json-'))

  try {
    const report = path.join(tempDir, 'report.json')
    fs.writeFileSync(
      report,
      JSON.stringify({ outcome: { passed: true, exit_code: 0, reason: 'ok' } }, null, 2) + '\n'
    )

    const output = run([report], tempDir)
    const payload = JSON.parse(output)
    assert.equal(payload.ok, true)
    assert.equal(Array.isArray(payload.artifacts), true)
    assert.equal(payload.artifacts.length, 1)
    assert.equal(payload.artifacts[0].status.passed, true)
    assert.equal(payload.artifacts[0].status.exit_code, 0)
    assert.equal(payload.artifacts[0].status.reason, 'ok')
    assert.equal(Array.isArray(payload.violations), true)
    assert.equal(payload.violations.length, 0)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('publish script marks invalid json artifacts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-publish-invalid-'))

  try {
    const bad = path.join(tempDir, 'bad.json')
    fs.writeFileSync(bad, '{bad json')

    const output = run([bad], tempDir)
    const payload = JSON.parse(output)
    assert.equal(payload.ok, true)
    assert.equal(payload.artifacts[0].status.reason, 'invalid_json')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('publish script fails with strict mode on missing artifact', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-publish-strict-missing-'))

  try {
    const missing = path.join(tempDir, 'missing.json')
    assert.throws(
      () => run(['--strict', missing], tempDir),
      err => {
        assert.equal(err.status, 1)
        const payload = JSON.parse(String(err.stdout || '{}'))
        assert.equal(payload.ok, false)
        assert.equal(Array.isArray(payload.violations), true)
        assert.equal(payload.violations.some(item => /missing/.test(item)), true)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('publish script fails with fail-on-not-passed when artifact status is false', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-publish-strict-status-'))

  try {
    const report = path.join(tempDir, 'report.json')
    fs.writeFileSync(report, JSON.stringify({ passed: false, exit_code: 2, reason: 'reject_gate_failed' }, null, 2) + '\n')

    assert.throws(
      () => run(['--fail-on-not-passed', report], tempDir),
      err => {
        assert.equal(err.status, 1)
        const payload = JSON.parse(String(err.stdout || '{}'))
        assert.equal(payload.ok, false)
        assert.equal(payload.violations.some(item => /expected passed=true/.test(item)), true)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
