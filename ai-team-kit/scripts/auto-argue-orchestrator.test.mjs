import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { orchestrate } from './auto-argue-orchestrator.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(currentDir, '..')
const orchestratorScript = path.join(projectRoot, 'scripts', 'auto-argue-orchestrator.mjs')
const argueInput = path.join(projectRoot, 'examples', 'argue-sample-input.json')
const allVetoInput = path.join(projectRoot, 'examples', 'argue-all-veto-input.json')
const duplicateIdInput = path.join(projectRoot, 'examples', 'argue-duplicate-id-input.json')
const baseSampleInput = path.join(projectRoot, 'examples', 'sample-input.json')
const fullSchemaPath = path.join(projectRoot, 'schemas', 'CI_GATE_REPORT.full.schema.json')
const compactSchemaPath = path.join(projectRoot, 'schemas', 'CI_GATE_REPORT.compact.schema.json')
const sha256OfFile = filePath =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf8')).digest('hex')

test('security veto rejects risky proposal and selects secure one', () => {
  const input = {
    project: { name: 'Test Project' },
    constraints: { compliance: ['ISO 27001'] },
    features: [{ name: 'f1' }, { name: 'f2' }, { name: 'f3' }],
    proposals: [
      {
        id: 'risky',
        title: 'Risky',
        timeline_weeks: 4,
        architecture_notes: ['api gateway'],
        test_plan: ['happy path only'],
        security_controls: ['authn_authz'],
        delivery_scope: { frontend: true, backend: true, ui: false }
      },
      {
        id: 'secure',
        title: 'Secure',
        timeline_weeks: 8,
        architecture_notes: ['api gateway', 'app service', 'postgres + redis'],
        test_plan: ['unit success/failure', 'integration tenant isolation', '403 regression'],
        security_controls: [
          'tenant_isolation',
          'authn_authz',
          'audit_log',
          'encryption_at_rest',
          'idempotency',
          'data_retention_policy'
        ],
        delivery_scope: { frontend: true, backend: true, ui: true },
        business_value: 'reduce incident cost'
      }
    ]
  }

  const { result } = orchestrate(input)
  const risky = result.proposals.find(item => item.proposal_id === 'risky')
  const secure = result.proposals.find(item => item.proposal_id === 'secure')

  assert.equal(risky.status, 'rejected')
  assert.equal(risky.reason, 'security_veto_gate_triggered')
  assert.equal(secure.status, 'approved')
  assert.equal(result.schema_version, '1.3.0')
  assert.equal(result.decision_index.selected_proposal_id, 'secure')
  assert.equal(result.decision_index.total_proposals, 2)
  assert.equal(result.decision_index.winner_confidence > 0.8, true)
  assert.equal(result.decision_index.items.secure.is_selected, true)
  assert.equal(result.decision_index.items.secure.confidence_score > result.decision_index.items.risky.confidence_score, true)
  assert.equal(result.decision_index.items.risky.security_vote, 'block')
  assert.equal(result.final_decision.selected_proposal_id, 'secure')
})

test('no approved proposal returns null winner', () => {
  const input = {
    project: { name: 'Blocked Project' },
    constraints: { compliance: ['GDPR'] },
    proposals: [
      {
        id: 'blocked_one',
        title: 'Blocked',
        timeline_weeks: 6,
        architecture_notes: ['api gateway'],
        test_plan: ['happy path'],
        security_controls: [],
        delivery_scope: { frontend: true, backend: true, ui: true }
      }
    ]
  }

  const { result } = orchestrate(input)
  assert.equal(result.final_decision.selected_proposal_id, null)
  assert.equal(result.final_decision.status, 'rejected')
  assert.equal(result.final_decision.reason, 'no_approved_proposal_after_gate')
  assert.equal(result.decision_index.winner_confidence, 0)
})

test('cli exits with code 2 when fail-on-reject is enabled and all proposals are rejected', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(process.execPath, [orchestratorScript, allVetoInput, outputDir, '--fail-on-reject'], {
          stdio: 'pipe'
        })
      },
      err => {
        assert.equal(err.status, 2)
        return true
      }
    )

    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json')), true)
    const result = JSON.parse(fs.readFileSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json'), 'utf8'))
    assert.equal(result.final_decision.selected_proposal_id, null)
    assert.equal(result.final_decision.status, 'rejected')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('orchestrate throws when proposal ids are duplicated', () => {
  const input = JSON.parse(fs.readFileSync(duplicateIdInput, 'utf8'))
  assert.throws(
    () => orchestrate(input),
    err => {
      assert.match(String(err.message), /Duplicate proposal id/)
      return true
    }
  )
})

test('orchestrate throws when strict proposal limit is not met', () => {
  const input = {
    project: { name: 'Strict Limit Demo' },
    proposals: [
      {
        id: 'one',
        title: 'Only one',
        timeline_weeks: 6,
        architecture_notes: ['api gateway', 'service'],
        test_plan: ['unit success/failure'],
        security_controls: [
          'tenant_isolation',
          'authn_authz',
          'audit_log',
          'encryption_at_rest',
          'idempotency',
          'data_retention_policy'
        ],
        delivery_scope: { frontend: true, backend: true, ui: true }
      }
    ]
  }

  assert.throws(
    () => orchestrate(input, { strictProposalLimit: 2 }),
    err => {
      assert.match(String(err.message), /below strict limit 2/)
      return true
    }
  )
})

test('cli json-only mode writes only json artifact', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-json-only-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [orchestratorScript, allVetoInput, outputDir, '--json-only'], {
      stdio: 'pipe'
    })

    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json')), true)
    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.md')), false)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli decision-index-only mode writes only decision index artifact', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-index-only-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [orchestratorScript, allVetoInput, outputDir, '--decision-index-only'], {
      stdio: 'pipe'
    })

    const indexPath = path.join(outputDir, 'AUTO_ARGUE_DECISION_INDEX.json')
    assert.equal(fs.existsSync(indexPath), true)
    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json')), false)
    assert.equal(fs.existsSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.md')), false)

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    assert.equal(index.selected_proposal_id, null)
    assert.equal(index.total_proposals, 2)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli writes ci report on success when ci-report flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-ci-success-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [orchestratorScript, argueInput, outputDir, '--ci-report'], {
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
    assert.equal(report.generated_by, 'auto-argue-orchestrator')
    assert.equal(report.compatibility.contract, 'ci_gate_report')
    assert.equal(Array.isArray(report.compatibility.backward_compatible_with), true)
    assert.equal(report.compatibility.backward_compatible_with.includes('1.1.0'), true)
    assert.equal(report.tool, 'auto-argue-orchestrator')
    assert.equal(report.outcome.passed, true)
    assert.equal(report.outcome.exit_code, 0)
    assert.equal(report.decision.selected_proposal_id, 'secure_mvp')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli writes compact ci report when ci-report-compact flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-ci-compact-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [orchestratorScript, argueInput, outputDir, '--ci-report-compact'], {
      stdio: 'pipe'
    })
    const reportPath = path.join(outputDir, 'CI_GATE_REPORT.json')
    assert.equal(fs.existsSync(reportPath), true)
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    assert.equal(report.schema_version, '1.2.0')
    assert.equal(report.schema_ref, 'ai-team-kit/schemas/CI_GATE_REPORT.compact.schema.json')
    assert.equal(report.schema_sha256, sha256OfFile(compactSchemaPath))
    assert.equal(report.report_variant, 'compact')
    assert.equal(report.report_type, 'ci_gate_report')
    assert.equal(report.generated_by, 'auto-argue-orchestrator')
    assert.equal(report.compatibility.contract, 'ci_gate_report')
    assert.equal(Array.isArray(report.compatibility.backward_compatible_with), true)
    assert.equal(report.compatibility.backward_compatible_with.includes('1.1.0'), true)
    assert.equal(report.tool, 'auto-argue-orchestrator')
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

test('cli exits with code 1 when strict proposal limit is not met', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-strict-limit-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [orchestratorScript, baseSampleInput, outputDir, '--strict-proposal-limit=2'],
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

test('cli exits with code 3 when winner confidence is below required threshold', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-confidence-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [orchestratorScript, allVetoInput, outputDir, '--min-winner-confidence=0.6'],
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
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli writes ci report on failure when ci-report flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-ci-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [orchestratorScript, allVetoInput, outputDir, '--fail-on-reject', '--ci-report'],
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
    assert.equal(report.generated_by, 'auto-argue-orchestrator')
    assert.equal(report.outcome.passed, false)
    assert.equal(report.outcome.exit_code, 2)
    assert.equal(report.outcome.reason, 'reject_gate_failed')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli writes compact ci report on failure when ci-report-compact flag is enabled', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-ci-compact-fail-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [orchestratorScript, allVetoInput, outputDir, '--fail-on-reject', '--ci-report-compact'],
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
    assert.equal(report.generated_by, 'auto-argue-orchestrator')
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

test('cli exits with code 4 when security approval is required but not met', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-security-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [orchestratorScript, allVetoInput, outputDir, '--require-security-approve'],
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
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli gate exit code precedence keeps rejection as code 2', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-precedence-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(
          process.execPath,
          [
            orchestratorScript,
            allVetoInput,
            outputDir,
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

test('cli strict-ci defaults to reject gate and exits with code 2 on rejected proposals', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-strict-ci-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    assert.throws(
      () => {
        execFileSync(process.execPath, [orchestratorScript, allVetoInput, outputDir, '--strict-ci'], {
          stdio: 'pipe'
        })
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

test('cli strict-ci passes on secure approved proposal set', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-strict-ci-pass-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(process.execPath, [orchestratorScript, argueInput, outputDir, '--strict-ci'], {
      stdio: 'pipe'
    })
    const result = JSON.parse(fs.readFileSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json'), 'utf8'))
    assert.equal(result.final_decision.selected_proposal_id, 'secure_mvp')
    assert.equal(result.decision_index.winner_confidence >= 0.75, true)
    assert.equal(result.decision_index.items.secure_mvp.security_vote, 'approve')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('cli passes when security approval is required and selected proposal is approved by security', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-agent-argue-security-pass-'))
  const outputDir = path.join(tempDir, 'out')

  try {
    execFileSync(
      process.execPath,
      [orchestratorScript, argueInput, outputDir, '--require-security-approve'],
      {
        stdio: 'pipe'
      }
    )
    const result = JSON.parse(fs.readFileSync(path.join(outputDir, 'AUTO_ARGUE_RESULT.json'), 'utf8'))
    assert.equal(result.decision_index.items.secure_mvp.security_vote, 'approve')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
