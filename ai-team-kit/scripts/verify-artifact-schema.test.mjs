import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '..')
const generateScript = path.join(projectRoot, 'scripts', 'generate-team-artifacts.mjs')
const verifyScript = path.join(projectRoot, 'scripts', 'verify-artifact-schema.mjs')
const argueInput = path.join(projectRoot, 'examples', 'argue-sample-input.json')

const run = args => execFileSync(process.execPath, [verifyScript, ...args], { stdio: 'pipe' }).toString()

test('verify script succeeds for output directory with run summary and ci report', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-verify-pass-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [generateScript, argueInput, outputDir, '--with-argue', '--ci-report-compact'],
      { stdio: 'pipe' }
    )

    const stdout = run([outputDir, '--require-ci-report'])
    assert.match(stdout, /Verified 2 artifact\(s\):/)
    assert.match(stdout, /run-summary\.json/)
    assert.match(stdout, /CI_GATE_REPORT\.json/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('verify script succeeds for direct single-file verification', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-verify-file-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [generateScript, argueInput, outputDir, '--with-argue', '--ci-report'],
      { stdio: 'pipe' }
    )

    const reportPath = path.join(outputDir, 'CI_GATE_REPORT.json')
    const stdout = run([reportPath])
    assert.match(stdout, /Verified 1 artifact\(s\):/)
    assert.match(stdout, /CI_GATE_REPORT\.json/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('verify script outputs machine-readable JSON with --json', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-verify-json-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [generateScript, argueInput, outputDir, '--with-argue', '--ci-report-compact'],
      { stdio: 'pipe' }
    )

    const stdout = run([outputDir, '--require-ci-report', '--json'])
    const payload = JSON.parse(stdout)
    assert.equal(payload.ok, true)
    assert.equal(payload.verified_count, 2)
    assert.equal(payload.require_ci_report, true)
    assert.equal(Array.isArray(payload.artifacts), true)
    assert.equal(payload.artifacts.length, 2)
    assert.equal(payload.artifacts.every(item => typeof item.schema_version === 'string'), true)
    assert.equal(payload.artifacts.every(item => typeof item.schema_ref === 'string'), true)
    assert.equal(payload.artifacts.every(item => /^[a-f0-9]{64}$/.test(item.schema_sha256)), true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('verify script fails when schema checksum is tampered', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-verify-tamper-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [generateScript, argueInput, outputDir, '--with-argue', '--ci-report-compact'],
      { stdio: 'pipe' }
    )

    const summaryPath = path.join(outputDir, 'run-summary.json')
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
    summary.schema_sha256 = '0'.repeat(64)
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n')

    assert.throws(
      () => run([outputDir]),
      err => {
        assert.equal(err.status, 1)
        const stderr = String(err.stderr || '')
        assert.match(stderr, /schema_sha256 mismatch/)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('verify script fails when require-ci-report is set but report is missing', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-verify-require-ci-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [generateScript, argueInput, outputDir, '--with-argue'], {
      stdio: 'pipe'
    })

    assert.throws(
      () => run([outputDir, '--require-ci-report']),
      err => {
        assert.equal(err.status, 1)
        const stderr = String(err.stderr || '')
        assert.match(stderr, /CI_GATE_REPORT\.json is required but not found/)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('verify script outputs JSON error payload when --json is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-verify-json-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [generateScript, argueInput, outputDir, '--with-argue'], {
      stdio: 'pipe'
    })

    assert.throws(
      () => run([outputDir, '--require-ci-report', '--json']),
      err => {
        assert.equal(err.status, 1)
        const stderr = String(err.stderr || '')
        const payload = JSON.parse(stderr)
        assert.equal(payload.ok, false)
        assert.match(payload.error, /CI_GATE_REPORT\.json is required but not found/)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
