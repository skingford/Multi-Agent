#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ARTIFACTS = [
  'ai-team-kit/output/sample-argue-ci-report-compact-run/CI_GATE_REPORT.json',
  'ai-team-kit/output/sample-run-with-argue-ci-report-compact/run-summary.json',
  'ai-team-kit/output/sample-run-with-argue-ci-report-compact/CI_GATE_REPORT.json'
]

const normalizeStatus = payload => {
  if (payload && typeof payload === 'object') {
    if (payload.gate_outcome && typeof payload.gate_outcome === 'object') {
      return {
        passed: payload.gate_outcome.passed,
        exit_code: payload.gate_outcome.exit_code,
        reason: payload.gate_outcome.reason
      }
    }

    if (payload.outcome && typeof payload.outcome === 'object') {
      return {
        passed: payload.outcome.passed,
        exit_code: payload.outcome.exit_code,
        reason: payload.outcome.reason
      }
    }

    return {
      passed: payload.passed,
      exit_code: payload.exit_code,
      reason: payload.reason
    }
  }

  return { passed: null, exit_code: null, reason: 'invalid_payload' }
}

const getSummaryEntry = artifactPath => {
  if (!fs.existsSync(artifactPath)) {
    return {
      path: artifactPath,
      present: false,
      status: { passed: null, exit_code: null, reason: 'missing' },
      error: 'missing'
    }
  }

  try {
    const payload = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
    return {
      path: artifactPath,
      present: true,
      status: normalizeStatus(payload),
      error: null
    }
  } catch {
    return {
      path: artifactPath,
      present: true,
      status: { passed: null, exit_code: null, reason: 'invalid_json' },
      error: 'invalid_json'
    }
  }
}

const renderMarkdown = entries => {
  const lines = ['### AI Team Kit CI Gate Summary']
  for (const entry of entries) {
    if (!entry.present) {
      lines.push(`- \`${entry.path}\` (missing)`)
      continue
    }
    lines.push(`- \`${entry.path}\``)
    lines.push(
      `  - passed=${String(entry.status.passed)}, exit_code=${String(entry.status.exit_code)}, reason=${String(entry.status.reason)}`
    )
  }
  return `${lines.join('\n')}\n`
}

const evaluateViolations = (entries, rules) => {
  const violations = []
  for (const entry of entries) {
    if (rules.failOnMissing && entry.error === 'missing') {
      violations.push(`${entry.path}: missing`)
    }
    if (rules.failOnInvalidJson && entry.error === 'invalid_json') {
      violations.push(`${entry.path}: invalid_json`)
    }
    if (
      rules.failOnNotPassed &&
      entry.error === null &&
      entry.status.passed !== null &&
      entry.status.passed !== true
    ) {
      violations.push(
        `${entry.path}: expected passed=true, got passed=${String(entry.status.passed)}, reason=${String(entry.status.reason)}`
      )
    }
  }
  return violations
}

const main = () => {
  const cliArgs = process.argv.slice(2)
  const flags = new Set(cliArgs.filter(arg => arg.startsWith('--')))
  const markdown = flags.has('--markdown')
  const strict = flags.has('--strict')
  const rules = {
    failOnMissing: flags.has('--fail-on-missing') || strict,
    failOnInvalidJson: flags.has('--fail-on-invalid-json') || strict,
    failOnNotPassed: flags.has('--fail-on-not-passed') || strict
  }
  const artifactArgs = cliArgs.filter(arg => !arg.startsWith('--'))
  const artifacts = artifactArgs.length ? artifactArgs : DEFAULT_ARTIFACTS
  const resolved = artifacts.map(item => path.resolve(process.cwd(), item))
  const entries = resolved.map(getSummaryEntry)
  const violations = evaluateViolations(entries, rules)
  const ok = violations.length === 0

  if (markdown) {
    process.stdout.write(renderMarkdown(entries))
    if (!ok) {
      process.stderr.write(`Summary checks failed:\n- ${violations.join('\n- ')}\n`)
      process.exit(1)
    }
    return
  }

  const payload = {
    ok,
    generated_at: new Date().toISOString(),
    rules: {
      fail_on_missing: rules.failOnMissing,
      fail_on_invalid_json: rules.failOnInvalidJson,
      fail_on_not_passed: rules.failOnNotPassed
    },
    artifacts: entries,
    violations
  }
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
  if (!ok) {
    process.exit(1)
  }
}

main()
