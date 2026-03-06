import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '..')
const scriptPath = path.join(projectRoot, 'scripts', 'generate-team-artifacts.mjs')
const argueInput = path.join(projectRoot, 'examples', 'argue-sample-input.json')
const allVetoInput = path.join(projectRoot, 'examples', 'argue-all-veto-input.json')
const duplicateIdInput = path.join(projectRoot, 'examples', 'argue-duplicate-id-input.json')
const baseSampleInput = path.join(projectRoot, 'examples', 'sample-input.json')
const fullSchemaPath = path.join(projectRoot, 'schemas', 'CI_GATE_REPORT.full.schema.json')
const compactSchemaPath = path.join(projectRoot, 'schemas', 'CI_GATE_REPORT.compact.schema.json')
const runSummarySchemaPath = path.join(projectRoot, 'schemas', 'run-summary.schema.json')
const sha256OfFile = filePath =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf8')).digest('hex')

test('generate script writes artifact docs and auto-argue results', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [scriptPath, argueInput, outputDir, '--with-argue'], {
      stdio: 'pipe'
    })

    const expectedFiles = [
      'PRD.md',
      'SPRINT_BOARD.md',
      'ARCHITECTURE.md',
      'api.swagger.yaml',
      'schema.sql',
      'SECURITY_REPORT.md',
      'REVIEW_REPORT.md',
      'AUTO_ARGUE_RESULT.json',
      'AUTO_ARGUE_RESULT.md',
      'run-summary.json'
    ]

    for (const file of expectedFiles) {
      assert.equal(fs.existsSync(path.join(outputDir, file)), true, `${file} should exist`)
    }

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.schema_version, '1.1.0')
    assert.equal(summary.schema_ref, 'ai-team-kit/schemas/run-summary.schema.json')
    assert.equal(summary.schema_sha256, sha256OfFile(runSummarySchemaPath))
    assert.equal(summary.argue_enabled, true)
    assert.equal(summary.argue_schema_version, '1.3.0')
    assert.equal(summary.argue_decision_index.selected_proposal_id, 'secure_mvp')
    assert.equal(summary.argue_decision_index.total_proposals, 2)
    assert.equal(summary.argue_decision_index.winner_confidence > 0.8, true)
    assert.equal(summary.argue_final_decision.selected_proposal_id, 'secure_mvp')
    assert.equal(Array.isArray(summary.gate_trace), true)
    assert.equal(summary.gate_trace.length, 3)
    assert.equal(summary.gate_outcome.passed, true)
    assert.equal(summary.gate_outcome.exit_code, 0)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script exits with code 2 on rejected final decision when fail-on-reject is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [scriptPath, allVetoInput, outputDir, '--with-argue', '--fail-on-reject'],
          { stdio: 'pipe' }
        )
      },
      err => {
        assert.equal(err.status, 2)
        return true
      }
    )

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_enabled, true)
    assert.equal(summary.argue_decision_index.selected_proposal_id, null)
    assert.equal(summary.argue_decision_index.total_proposals, 2)
    assert.equal(summary.argue_decision_index.winner_confidence, 0)
    assert.equal(summary.argue_final_decision.selected_proposal_id, null)
    assert.equal(summary.argue_final_decision.status, 'rejected')
    assert.equal(summary.gate_outcome.passed, false)
    assert.equal(summary.gate_outcome.exit_code, 2)
    assert.equal(summary.gate_outcome.reason, 'reject_gate_failed')
    assert.equal(summary.gate_trace.find(item => item.id === 'reject_gate')?.passed, false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script supports json-only argue output mode', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-json-only-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [scriptPath, argueInput, outputDir, '--with-argue', '--argue-json-only'], {
      stdio: 'pipe'
    })

    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json')), true)
    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.md')), false)

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_output_mode, 'json')
    assert.equal(summary.argue_schema_version, '1.3.0')
    assert.equal(summary.argue_decision_index.selected_proposal_id, 'secure_mvp')
    assert.equal(summary.argue_decision_index.winner_confidence > 0.8, true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script supports decision-index-only argue output mode', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-index-only-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [scriptPath, argueInput, outputDir, '--with-argue', '--argue-index-only'], {
      stdio: 'pipe'
    })

    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_DECISION_INDEX.json')), true)
    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json')), false)
    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.md')), false)

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_output_mode, 'index')
    assert.equal(summary.argue_decision_index.selected_proposal_id, 'secure_mvp')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script writes ci report on success when ci-report flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-ci-success-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [scriptPath, argueInput, outputDir, '--with-argue', '--ci-report'], {
      stdio: 'pipe'
    })

    const reportPath = path.join(outputDir, 'CI_GATE_REPORT.json')
    assert.equal(fs.existsSync(reportPath), true)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.equal(report.schema_version, '1.2.0')
    assert.equal(report.schema_ref, 'ai-team-kit/schemas/CI_GATE_REPORT.full.schema.json')
    assert.equal(report.schema_sha256, sha256OfFile(fullSchemaPath))
    assert.equal(report.report_variant, 'full')
    assert.equal(report.report_type, 'ci_gate_report')
    assert.equal(report.generated_by, 'generate-team-artifacts')
    assert.equal(report.compatibility.contract, 'ci_gate_report')
    assert.equal(Array.isArray(report.compatibility.backward_compatible_with), true)
    assert.equal(report.compatibility.backward_compatible_with.includes('1.1.0'), true)
    assert.equal(report.tool, 'generate-team-artifacts')
    assert.equal(report.outcome.passed, true)
    assert.equal(report.decision.selected_proposal_id, 'secure_mvp')
    assert.equal(report.artifacts.includes(reportPath), true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script writes compact ci report when ci-report-compact flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-ci-compact-success-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [scriptPath, argueInput, outputDir, '--with-argue', '--ci-report-compact'],
      {
        stdio: 'pipe'
      }
    )
    const reportPath = path.join(outputDir, 'CI_GATE_REPORT.json')
    assert.equal(fs.existsSync(reportPath), true)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.equal(report.schema_version, '1.2.0')
    assert.equal(report.schema_ref, 'ai-team-kit/schemas/CI_GATE_REPORT.compact.schema.json')
    assert.equal(report.schema_sha256, sha256OfFile(compactSchemaPath))
    assert.equal(report.report_variant, 'compact')
    assert.equal(report.report_type, 'ci_gate_report')
    assert.equal(report.generated_by, 'generate-team-artifacts')
    assert.equal(report.compatibility.contract, 'ci_gate_report')
    assert.equal(Array.isArray(report.compatibility.backward_compatible_with), true)
    assert.equal(report.compatibility.backward_compatible_with.includes('1.1.0'), true)
    assert.equal(report.tool, 'generate-team-artifacts')
    assert.equal(report.passed, true)
    assert.equal(report.exit_code, 0)
    assert.equal(report.reason, 'ok')
    assert.equal(report.selected_proposal_id, 'secure_mvp')
    assert.equal(report.winner_confidence >= 0.75, true)
    assert.equal(Array.isArray(report.gate_trace), true)
    assert.equal(report.gate_trace.length, 3)
    assert.equal(report.gate_trace.every(item => typeof item.id === 'string'), true)
    assert.equal('outcome' in report, false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script fails fast for duplicate proposal ids', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-dup-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(process.execPath, [scriptPath, duplicateIdInput, outputDir, '--with-argue'], {
          stdio: 'pipe'
        })
      },
      err => {
        assert.equal(err.status, 1)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script enforces strict proposal limit when provided', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-strict-limit-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [scriptPath, baseSampleInput, outputDir, '--with-argue', '--strict-proposal-limit=2'],
          {
            stdio: 'pipe'
          }
        )
      },
      err => {
        assert.equal(err.status, 1)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script exits with code 3 when winner confidence is below required threshold', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-confidence-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [scriptPath, allVetoInput, outputDir, '--with-argue', '--min-winner-confidence=0.6'],
          {
            stdio: 'pipe'
          }
        )
      },
      err => {
        assert.equal(err.status, 3)
        return true
      }
    )

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.min_winner_confidence_required, 0.6)
    assert.equal(summary.min_winner_confidence_met, false)
    assert.equal(summary.gate_outcome.passed, false)
    assert.equal(summary.gate_outcome.exit_code, 3)
    assert.equal(summary.gate_outcome.reason, 'confidence_gate_failed')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script auto-enables argue when min winner confidence is provided', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-confidence-auto-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [scriptPath, baseSampleInput, outputDir, '--min-winner-confidence=0.6'],
      { stdio: 'pipe' }
    )

    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json')), true)
    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_enabled, true)
    assert.equal(summary.min_winner_confidence_required, 0.6)
    assert.equal(summary.min_winner_confidence_met, true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script exits with code 4 when security approval is required but not met', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-security-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [scriptPath, allVetoInput, outputDir, '--with-argue', '--require-security-approve'],
          {
            stdio: 'pipe'
          }
        )
      },
      err => {
        assert.equal(err.status, 4)
        return true
      }
    )

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.security_approve_required, true)
    assert.equal(summary.security_approve_met, false)
    assert.equal(summary.gate_outcome.passed, false)
    assert.equal(summary.gate_outcome.exit_code, 4)
    assert.equal(summary.gate_outcome.reason, 'security_approve_gate_failed')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script writes ci report on gate failure when ci-report flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-ci-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [scriptPath, allVetoInput, outputDir, '--with-argue', '--fail-on-reject', '--ci-report'],
          {
            stdio: 'pipe'
          }
        )
      },
      err => {
        assert.equal(err.status, 2)
        return true
      }
    )

    const reportPath = path.join(outputDir, 'CI_GATE_REPORT.json')
    assert.equal(fs.existsSync(reportPath), true)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.equal(report.schema_version, '1.2.0')
    assert.equal(report.schema_ref, 'ai-team-kit/schemas/CI_GATE_REPORT.full.schema.json')
    assert.equal(report.schema_sha256, sha256OfFile(fullSchemaPath))
    assert.equal(report.report_variant, 'full')
    assert.equal(report.report_type, 'ci_gate_report')
    assert.equal(report.generated_by, 'generate-team-artifacts')
    assert.equal(report.outcome.passed, false)
    assert.equal(report.outcome.exit_code, 2)
    assert.equal(report.outcome.reason, 'reject_gate_failed')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script writes compact ci report on gate failure when ci-report-compact flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-ci-compact-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [scriptPath, allVetoInput, outputDir, '--with-argue', '--fail-on-reject', '--ci-report-compact'],
          {
            stdio: 'pipe'
          }
        )
      },
      err => {
        assert.equal(err.status, 2)
        return true
      }
    )
    const reportPath = path.join(outputDir, 'CI_GATE_REPORT.json')
    assert.equal(fs.existsSync(reportPath), true)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.equal(report.schema_version, '1.2.0')
    assert.equal(report.schema_ref, 'ai-team-kit/schemas/CI_GATE_REPORT.compact.schema.json')
    assert.equal(report.schema_sha256, sha256OfFile(compactSchemaPath))
    assert.equal(report.report_variant, 'compact')
    assert.equal(report.report_type, 'ci_gate_report')
    assert.equal(report.generated_by, 'generate-team-artifacts')
    assert.equal(report.passed, false)
    assert.equal(report.exit_code, 2)
    assert.equal(report.reason, 'reject_gate_failed')
    assert.equal(Array.isArray(report.gate_trace), true)
    assert.equal(report.gate_trace.find(item => item.id === 'reject_gate')?.passed, false)
    assert.equal('outcome' in report, false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script auto-enables argue when security approval is required', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-security-auto-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [scriptPath, baseSampleInput, outputDir, '--require-security-approve'],
      { stdio: 'pipe' }
    )

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_enabled, true)
    assert.equal(summary.security_approve_required, true)
    assert.equal(summary.security_approve_met, true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script gate exit code precedence keeps rejection as code 2', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-precedence-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [
            scriptPath,
            allVetoInput,
            outputDir,
            '--with-argue',
            '--fail-on-reject',
            '--min-winner-confidence=0.8',
            '--require-security-approve'
          ],
          { stdio: 'pipe' }
        )
      },
      err => {
        assert.equal(err.status, 2)
        return true
      }
    )
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script strict-ci auto-enables argue and fails with code 2 on rejected proposals', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-strict-ci-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(process.execPath, [scriptPath, allVetoInput, outputDir, '--strict-ci'], {
          stdio: 'pipe'
        })
      },
      err => {
        assert.equal(err.status, 2)
        return true
      }
    )

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_enabled, true)
    assert.equal(summary.strict_ci_enabled, true)
    assert.equal(summary.min_winner_confidence_required, 0.75)
    assert.equal(summary.security_approve_required, true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('generate script strict-ci passes on safe default proposal', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-generate-strict-ci-pass-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [scriptPath, baseSampleInput, outputDir, '--strict-ci'], {
      stdio: 'pipe'
    })

    const summary = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-summary.json'), 'utf8'))
    assert.equal(summary.argue_enabled, true)
    assert.equal(summary.strict_ci_enabled, true)
    assert.equal(summary.min_winner_confidence_required, 0.75)
    assert.equal(summary.min_winner_confidence_met, true)
    assert.equal(summary.security_approve_required, true)
    assert.equal(summary.security_approve_met, true)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
