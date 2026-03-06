#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROLE_ORDER = ['pm', 'architect', 'security', 'ui', 'frontend', 'backend', 'reviewer', 'pjm']
export const ARGUE_SCHEMA_VERSION = '1.3.0'
const STRICT_CI_DEFAULT_MIN_CONFIDENCE = 0.75
const CI_REPORT_FULL_SCHEMA_VERSION = '1.2.0'
const CI_REPORT_COMPACT_SCHEMA_VERSION = '1.2.0'
const CI_REPORT_TYPE = 'ci_gate_report'
const CI_REPORT_BACKWARD_COMPATIBLE_WITH = ['1.1.0']
const CI_REPORT_FULL_SCHEMA_REF = 'ai-team-kit/schemas/CI_GATE_REPORT.full.schema.json'
const CI_REPORT_COMPACT_SCHEMA_REF = 'ai-team-kit/schemas/CI_GATE_REPORT.compact.schema.json'
const REQUIRED_SECURITY_CONTROLS = [
  'tenant_isolation',
  'authn_authz',
  'audit_log',
  'encryption_at_rest',
  'idempotency'
]

const VOTE_WEIGHT = {
  approve: 3,
  approve_with_notes: 1,
  changes_requested: -2,
  block: -5
}

const safeReadJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'))
const modulePath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(scriptDir, '..', '..')

const toDate = iso => iso.slice(0, 10)
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const round3 = value => Math.round(value * 1000) / 1000
const computeSchemaSha256 = schemaRef => {
  const schemaPath = path.resolve(workspaceRoot, schemaRef)
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found for ${schemaRef}: ${schemaPath}`)
  }
  return crypto.createHash('sha256').update(fs.readFileSync(schemaPath, 'utf8')).digest('hex')
}

const normalizeProposal = (proposal, index, data) => ({
  id: proposal.id || `proposal_${index + 1}`,
  proposer: proposal.proposer || 'pm',
  title: proposal.title || `Proposal ${index + 1}`,
  description: proposal.description || 'N/A',
  timeline_weeks: Number(proposal.timeline_weeks || data.constraints?.timeline_weeks || 6),
  business_value: proposal.business_value || '',
  architecture_notes: Array.isArray(proposal.architecture_notes) ? proposal.architecture_notes : [],
  test_plan: Array.isArray(proposal.test_plan) ? proposal.test_plan : [],
  security_controls: Array.isArray(proposal.security_controls)
    ? proposal.security_controls.map(item => String(item).toLowerCase())
    : [],
  delivery_scope: {
    frontend: Boolean(proposal.delivery_scope?.frontend),
    backend: Boolean(proposal.delivery_scope?.backend),
    ui: Boolean(proposal.delivery_scope?.ui)
  }
})

const buildDefaultProposal = data => {
  const featureNames = (data.features || []).map(item => item.name).filter(Boolean)
  return normalizeProposal(
    {
      id: 'default_mvp',
      proposer: 'pm',
      title: `${data.project?.name || 'Project'} MVP`,
      description: `Deliver MVP for ${featureNames.slice(0, 3).join(', ') || 'core capabilities'}.`,
      timeline_weeks: data.constraints?.timeline_weeks || 6,
      business_value: data.project?.goal || 'Improve delivery efficiency',
      architecture_notes: ['api gateway', 'app service', 'postgres + redis', 'audit log'],
      test_plan: [
        'unit tests for success/failure branches',
        'integration tests for tenant isolation',
        'security regression tests for authorization and replay'
      ],
      security_controls: [
        'tenant_isolation',
        'authn_authz',
        'audit_log',
        'encryption_at_rest',
        'idempotency',
        'data_retention_policy'
      ],
      delivery_scope: { frontend: true, backend: true, ui: true }
    },
    0,
    data
  )
}

const validateProposals = (proposals, options = {}) => {
  if (!proposals.length) {
    throw new Error('No proposals found after normalization')
  }

  if (Number.isInteger(options.strictProposalLimit) && options.strictProposalLimit > 0) {
    if (proposals.length < options.strictProposalLimit) {
      throw new Error(
        `Proposal count ${proposals.length} is below strict limit ${options.strictProposalLimit}`
      )
    }
  }

  const ids = new Set()
  for (const proposal of proposals) {
    if (ids.has(proposal.id)) {
      throw new Error(`Duplicate proposal id detected: ${proposal.id}`)
    }
    ids.add(proposal.id)

    if (!Number.isFinite(proposal.timeline_weeks) || proposal.timeline_weeks <= 0) {
      throw new Error(`Invalid timeline_weeks for ${proposal.id}: ${proposal.timeline_weeks}`)
    }
  }
}

const finding = (severity, issue, fix) => ({ severity, issue, fix })

const evaluateByRole = (role, proposal, context) => {
  const findings = []
  const missingSecurityControls = REQUIRED_SECURITY_CONTROLS.filter(
    control => !proposal.security_controls.includes(control)
  )

  if (role === 'security') {
    if (missingSecurityControls.length) {
      findings.push(
        finding(
          'critical',
          `Missing required security controls: ${missingSecurityControls.join(', ')}`,
          `Add controls: ${missingSecurityControls.join(', ')}`
        )
      )
    }
    if (context.compliance.length && !proposal.security_controls.includes('data_retention_policy')) {
      findings.push(
        finding(
          'high',
          'Compliance exists but data retention policy is missing',
          'Define retention/deletion policy mapped to compliance requirements'
        )
      )
    }
  }

  if (role === 'architect') {
    if (!proposal.architecture_notes.length) {
      findings.push(
        finding(
          'high',
          'Architecture notes are missing',
          'Provide topology, scaling strategy, and consistency strategy'
        )
      )
    } else if (proposal.architecture_notes.length < 2) {
      findings.push(
        finding(
          'medium',
          'Architecture notes are too shallow for execution',
          'Add API versioning, storage model, and scaling details'
        )
      )
    }
  }

  if (role === 'reviewer') {
    if (!proposal.test_plan.length) {
      findings.push(
        finding(
          'high',
          'Test plan is missing',
          'Add success/failure branch tests before implementation'
        )
      )
    } else {
      const hasFailureCase = proposal.test_plan.some(item =>
        /(fail|error|403|timeout|negative|forbidden|retry)/i.test(item)
      )
      if (!hasFailureCase) {
        findings.push(
          finding(
            'medium',
            'Test plan has no clear failure-path coverage',
            'Add negative/failure branch tests for critical APIs'
          )
        )
      }
    }
  }

  if (role === 'pjm' && proposal.timeline_weeks < 4 && context.featureCount >= 3) {
    findings.push(
      finding(
        'high',
        `Timeline ${proposal.timeline_weeks}w is too aggressive for ${context.featureCount} features`,
        'Split scope or increase timeline to reduce delivery risk'
      )
    )
  }

  if (role === 'pm' && !proposal.business_value) {
    findings.push(
      finding('medium', 'Business value is not explicitly stated', 'Add measurable business outcome')
    )
  }

  if (role === 'frontend' && !proposal.delivery_scope.frontend) {
    findings.push(
      finding('medium', 'Frontend scope is undefined', 'Clarify frontend pages and state flow')
    )
  }

  if (role === 'backend' && !proposal.delivery_scope.backend) {
    findings.push(
      finding('medium', 'Backend scope is undefined', 'Clarify API endpoints and data contracts')
    )
  }

  if (role === 'ui' && !proposal.delivery_scope.ui) {
    findings.push(
      finding('medium', 'UI scope is undefined', 'Define design tokens and interaction states')
    )
  }

  return findings
}

const voteFromFindings = (role, findings) => {
  const hasCritical = findings.some(item => item.severity === 'critical')
  const hasHigh = findings.some(item => item.severity === 'high')
  const hasMedium = findings.some(item => item.severity === 'medium')

  if (role === 'security') {
    if (hasCritical) return { decision: 'block', reason: 'critical security finding' }
    if (hasHigh) return { decision: 'changes_requested', reason: 'high security risk' }
    if (hasMedium) return { decision: 'approve_with_notes', reason: 'non-blocking security notes' }
    return { decision: 'approve', reason: 'security baseline satisfied' }
  }

  if (hasHigh) return { decision: 'changes_requested', reason: 'high risk for this role' }
  if (hasMedium) return { decision: 'approve_with_notes', reason: 'non-blocking concerns exist' }
  return { decision: 'approve', reason: 'ready for execution' }
}

const summarizeSeverity = objections => {
  const all = objections.flatMap(item => item.findings)
  return {
    critical: all.filter(item => item.severity === 'critical').length,
    high: all.filter(item => item.severity === 'high').length,
    medium: all.filter(item => item.severity === 'medium').length
  }
}

const summarizeVotes = votes => {
  const summary = {
    approve: 0,
    approve_with_notes: 0,
    changes_requested: 0,
    block: 0
  }
  for (const vote of votes) {
    summary[vote.decision] += 1
  }
  return summary
}

const evaluateProposalOutcome = votePack => {
  const votes = votePack.votes
  const voteSummary = summarizeVotes(votes)
  const securityVote = votes.find(item => item.role === 'security')?.decision || 'changes_requested'

  if (securityVote === 'block') {
    return {
      status: 'rejected',
      score: -1000,
      reason: 'security_veto_gate_triggered',
      gate: 'blocked',
      vote_summary: voteSummary
    }
  }

  const weightedScore = votes.reduce((acc, vote) => acc + VOTE_WEIGHT[vote.decision], 0)
  const approvalCount = voteSummary.approve + voteSummary.approve_with_notes
  const status =
    approvalCount >= Math.ceil(ROLE_ORDER.length * 0.75) && voteSummary.changes_requested <= 1
      ? 'approved'
      : 'revisions_required'

  return {
    status,
    score: weightedScore,
    reason: status === 'approved' ? 'majority_support' : 'too_many_changes_requested',
    gate: 'passed',
    vote_summary: voteSummary
  }
}

const buildPatchPlan = (proposalId, objections) => {
  const prioritized = objections
    .flatMap(item => item.findings.map(f => ({ role: item.role, ...f })))
    .sort((a, b) => {
      const weight = { critical: 3, high: 2, medium: 1 }
      return weight[b.severity] - weight[a.severity]
    })

  return {
    proposal_id: proposalId,
    actions: prioritized.slice(0, 6).map((item, index) => ({
      step: index + 1,
      owner: item.role,
      severity: item.severity,
      action: item.fix
    }))
  }
}

const buildDecisionIndex = ({ scored, voteRound, objectionRound, patchPlan, winner }) => {
  const items = {}

  for (const proposal of scored) {
    const proposalId = proposal.proposal_id
    const votePack = voteRound.find(item => item.proposal_id === proposalId)
    const objections = objectionRound.find(item => item.proposal_id === proposalId)?.objections || []
    const patchActions = patchPlan.find(item => item.proposal_id === proposalId)?.actions || []
    const voteSummary =
      proposal.vote_summary || { approve: 0, approve_with_notes: 0, changes_requested: 0, block: 0 }
    const totalVotes = ROLE_ORDER.length
    const supportRatio = (voteSummary.approve + voteSummary.approve_with_notes) / totalVotes
    const dissentRatio = (voteSummary.changes_requested + voteSummary.block) / totalVotes
    const objectionSummary = summarizeSeverity(objections)
    const severityWeighted =
      objectionSummary.critical * 3 + objectionSummary.high * 2 + objectionSummary.medium
    const severityPenalty = Math.min(0.4, severityWeighted / 40)
    const securityVote = votePack?.votes?.find(vote => vote.role === 'security')?.decision || 'changes_requested'
    const securityAdjustment =
      securityVote === 'approve'
        ? 0.1
        : securityVote === 'approve_with_notes'
          ? 0.04
          : securityVote === 'changes_requested'
            ? -0.08
            : -0.2
    const scoreSignal = clamp(proposal.score / 200, -0.1, 0.1)
    const gatePenalty = proposal.gate === 'blocked' ? 0.2 : 0
    const confidenceScore = round3(
      clamp(
        0.45 * supportRatio +
          0.2 * (1 - dissentRatio) +
          0.1 +
          securityAdjustment +
          scoreSignal -
          severityPenalty -
          gatePenalty,
        0,
        1
      )
    )

    items[proposalId] = {
      status: proposal.status,
      gate: proposal.gate,
      reason: proposal.reason,
      score: proposal.score,
      security_vote: securityVote,
      vote_summary: voteSummary,
      objection_summary: objectionSummary,
      patch_action_count: patchActions.length,
      confidence_score: confidenceScore,
      is_selected: winner?.proposal_id === proposalId
    }
  }

  let winnerConfidence = 0
  if (winner?.proposal_id && items[winner.proposal_id]) {
    const selected = items[winner.proposal_id]
    const others = Object.entries(items)
      .filter(([proposalId]) => proposalId !== winner.proposal_id)
      .map(([, item]) => item.confidence_score)
    const runnerUp = others.length ? Math.max(...others) : 0
    const marginBoost = others.length ? clamp((selected.confidence_score - runnerUp) * 0.25, 0, 0.08) : 0.05
    winnerConfidence = round3(clamp(selected.confidence_score + marginBoost, 0, 1))
  }

  return {
    selected_proposal_id: winner?.proposal_id || null,
    total_proposals: scored.length,
    winner_confidence: winnerConfidence,
    items
  }
}

const renderMarkdown = result => {
  const voteMatrix = result.rounds.vote
    .map(item => {
      const compact = item.votes.map(v => `${v.role}:${v.decision}`).join(', ')
      return `- ${item.proposal_id}: ${compact}`
    })
    .join('\n')

  const objectionSummary = result.rounds.objection
    .map(item => {
      const severity = summarizeSeverity(item.objections)
      return `- ${item.proposal_id}: critical=${severity.critical}, high=${severity.high}, medium=${severity.medium}`
    })
    .join('\n')

  const ranking = result.proposals
    .map(
      item =>
        `- ${item.proposal_id}: status=${item.status}, score=${item.score}, gate=${item.gate}, reason=${item.reason}`
    )
    .join('\n')

  const decisionIndexSummary = Object.entries(result.decision_index.items)
    .map(
      ([proposalId, item]) =>
        `- ${proposalId}: selected=${item.is_selected}, confidence=${item.confidence_score}, security_vote=${item.security_vote}, patch_actions=${item.patch_action_count}`
    )
    .join('\n')

  const patchPlans = result.patch_plan
    .map(item => {
      const lines = item.actions.length
        ? item.actions
            .map(
              action =>
                `  - [${action.severity}] (${action.owner}) step-${action.step}: ${action.action}`
            )
            .join('\n')
        : '  - no actions needed'
      return `- ${item.proposal_id}\n${lines}`
    })
    .join('\n')

  return `# AUTO_ARGUE_RESULT

- Date: ${toDate(result.generated_at)}
- Project: ${result.project}
- Gate: ${result.gate_policy.name}
- Rule: ${result.gate_policy.rule}

## Round 1 - Proposal
${result.rounds.proposal
  .map(
    item =>
      `- ${item.proposal_id} (${item.proposer}): ${item.title} [timeline=${item.timeline_weeks}w]`
  )
  .join('\n')}

## Round 2 - Objection
${objectionSummary}

## Round 3 - Vote
${voteMatrix}

## Ranking
${ranking}

## Decision Index
- winner_confidence: ${result.decision_index.winner_confidence}
${decisionIndexSummary}

## Final Decision
- selected_proposal_id: ${result.final_decision.selected_proposal_id}
- status: ${result.final_decision.status}
- reason: ${result.final_decision.reason}
- security_gate: ${result.final_decision.security_gate}

## Patch Plan
${patchPlans}
`
}

export const orchestrate = (inputData, options = {}) => {
  const data = inputData || {}
  const now = new Date().toISOString()

  const proposals =
    Array.isArray(data.proposals) && data.proposals.length
      ? data.proposals.map((item, index) => normalizeProposal(item, index, data))
      : [buildDefaultProposal(data)]

  validateProposals(proposals, options)

  const context = {
    compliance: Array.isArray(data.constraints?.compliance) ? data.constraints.compliance : [],
    featureCount: Array.isArray(data.features) ? data.features.length : 0
  }

  const proposalRound = proposals.map(proposal => ({
    proposal_id: proposal.id,
    proposer: proposal.proposer,
    title: proposal.title,
    description: proposal.description,
    timeline_weeks: proposal.timeline_weeks
  }))

  const objectionRound = proposals.map(proposal => ({
    proposal_id: proposal.id,
    objections: ROLE_ORDER.map(role => ({
      role,
      findings: evaluateByRole(role, proposal, context)
    }))
  }))

  const voteRound = proposals.map(proposal => {
    const objections = objectionRound.find(item => item.proposal_id === proposal.id)?.objections || []
    const votePack = ROLE_ORDER.map(role => {
      const findings = objections.find(item => item.role === role)?.findings || []
      return { role, ...voteFromFindings(role, findings) }
    })
    return { proposal_id: proposal.id, votes: votePack }
  })

  const scored = voteRound
    .map(votePack => ({
      proposal_id: votePack.proposal_id,
      ...evaluateProposalOutcome(votePack)
    }))
    .sort((a, b) => b.score - a.score)

  const approved = scored.filter(item => item.status === 'approved' && item.gate === 'passed')
  const winner = approved.length ? approved[0] : null

  const patchPlan = objectionRound.map(item => buildPatchPlan(item.proposal_id, item.objections))
  const decisionIndex = buildDecisionIndex({
    scored,
    voteRound,
    objectionRound,
    patchPlan,
    winner
  })

  const result = {
    schema_version: ARGUE_SCHEMA_VERSION,
    project: data.project?.name || 'Untitled Project',
    generated_at: now,
    gate_policy: {
      name: 'Security One-Vote Veto Gate',
      rule: 'If security role votes block, proposal is automatically rejected.'
    },
    rounds: {
      proposal: proposalRound,
      objection: objectionRound,
      vote: voteRound
    },
    proposals: scored,
    decision_index: decisionIndex,
    final_decision: winner
      ? {
          selected_proposal_id: winner.proposal_id,
          status: winner.status,
          reason: winner.reason,
          security_gate: winner.gate
        }
      : {
          selected_proposal_id: null,
          status: 'rejected',
          reason: 'no_approved_proposal_after_gate',
          security_gate: 'blocked_or_pending_revisions'
        },
    patch_plan: patchPlan
  }

  return { result, markdown: renderMarkdown(result) }
}

const main = () => {
  const cliArgs = process.argv.slice(2)
  const positionalArgs = cliArgs.filter(arg => !arg.startsWith('--'))
  const flags = new Set(cliArgs.filter(arg => arg.startsWith('--')))
  const strictProposalLimitArg = cliArgs.find(arg => arg.startsWith('--strict-proposal-limit='))
  const minWinnerConfidenceArg = cliArgs.find(arg => arg.startsWith('--min-winner-confidence='))
  const ciReportCompact = flags.has('--ci-report-compact')
  const ciReportArg = cliArgs.find(arg => arg === '--ci-report' || arg.startsWith('--ci-report='))
  const [inputPath, outputDirArg] = positionalArgs
  const strictCi = flags.has('--strict-ci')
  const failOnReject = flags.has('--fail-on-reject') || strictCi
  const requireSecurityApprove = flags.has('--require-security-approve') || strictCi
  const jsonOnly = flags.has('--json-only')
  const mdOnly = flags.has('--md-only')
  const decisionIndexOnly = flags.has('--decision-index-only')
  let strictProposalLimit = null
  let minWinnerConfidence = null
  let ciReportPath = null

  if (strictProposalLimitArg) {
    const raw = strictProposalLimitArg.split('=')[1]
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error(`Invalid --strict-proposal-limit value: ${raw}`)
      process.exit(1)
    }
    strictProposalLimit = parsed
  }
  if (minWinnerConfidenceArg) {
    const raw = minWinnerConfidenceArg.split('=')[1]
    const parsed = Number.parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      console.error(`Invalid --min-winner-confidence value: ${raw}`)
      process.exit(1)
    }
    minWinnerConfidence = parsed
  } else if (strictCi) {
    minWinnerConfidence = STRICT_CI_DEFAULT_MIN_CONFIDENCE
  }
  if (ciReportArg && ciReportArg.startsWith('--ci-report=')) {
    const raw = ciReportArg.split('=')[1]
    if (!raw) {
      console.error('Invalid --ci-report value: path cannot be empty')
      process.exit(1)
    }
    ciReportPath = path.resolve(process.cwd(), raw)
  }

  if (!inputPath) {
    console.error(
      'Usage: node auto-argue-orchestrator.mjs <input.json> [output-dir] [--strict-ci] [--fail-on-reject] [--require-security-approve] [--json-only|--md-only|--decision-index-only] [--strict-proposal-limit=N] [--min-winner-confidence=0.0..1.0] [--ci-report|--ci-report=<path>] [--ci-report-compact]'
    )
    process.exit(1)
  }
  if (jsonOnly && mdOnly) {
    console.error('Invalid flags: --json-only and --md-only cannot be used together')
    process.exit(1)
  }
  if (decisionIndexOnly && (jsonOnly || mdOnly)) {
    console.error('Invalid flags: --decision-index-only cannot be combined with --json-only or --md-only')
    process.exit(1)
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath)
  const resolvedOutput = path.resolve(process.cwd(), outputDirArg || 'ai-team-kit/output/argue-run')
  if ((ciReportArg || ciReportCompact) && !ciReportPath) {
    ciReportPath = path.join(resolvedOutput, 'CI_GATE_REPORT.json')
  }

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input file not found: ${resolvedInput}`)
    process.exit(1)
  }

  let result
  let markdown
  try {
    const inputData = safeReadJson(resolvedInput)
    const run = orchestrate(inputData, { strictProposalLimit })
    result = run.result
    markdown = run.markdown
  } catch (error) {
    console.error(`Orchestration failed: ${error.message}`)
    process.exit(1)
  }
  const generatedFiles = []

  fs.mkdirSync(resolvedOutput, { recursive: true })
  if (decisionIndexOnly) {
    fs.writeFileSync(
      path.join(resolvedOutput, 'AUTO_ARGUE_DECISION_INDEX.json'),
      JSON.stringify(result.decision_index, null, 2) + '\n'
    )
    generatedFiles.push(path.join(resolvedOutput, 'AUTO_ARGUE_DECISION_INDEX.json'))
  } else if (!mdOnly) {
    fs.writeFileSync(
      path.join(resolvedOutput, 'AUTO_ARGUE_RESULT.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    generatedFiles.push(path.join(resolvedOutput, 'AUTO_ARGUE_RESULT.json'))
  }
  if (!jsonOnly && !decisionIndexOnly) {
    fs.writeFileSync(path.join(resolvedOutput, 'AUTO_ARGUE_RESULT.md'), markdown.trim() + '\n')
    generatedFiles.push(path.join(resolvedOutput, 'AUTO_ARGUE_RESULT.md'))
  }

  const selectedId = result.decision_index.selected_proposal_id
  const selected = selectedId ? result.decision_index.items[selectedId] : null
  const rejectGateFailed = failOnReject && result.final_decision.status !== 'approved'
  const confidenceGateFailed =
    minWinnerConfidence !== null &&
    result.decision_index.winner_confidence < minWinnerConfidence
  const securityGateFailed =
    requireSecurityApprove && !(selected && selected.security_vote === 'approve')

  const gateTrace = [
    {
      id: 'reject_gate',
      enabled: failOnReject,
      passed: !rejectGateFailed,
      code: 2
    },
    {
      id: 'confidence_gate',
      enabled: minWinnerConfidence !== null,
      passed: !confidenceGateFailed,
      code: 3
    },
    {
      id: 'security_approve_gate',
      enabled: requireSecurityApprove,
      passed: !securityGateFailed,
      code: 4
    }
  ]

  let gateFailure = null
  if (rejectGateFailed) {
    gateFailure = {
      code: 2,
      reason: 'reject_gate_failed',
      message: `Rejected by gate policy: ${result.final_decision.reason} (${result.final_decision.security_gate})`
    }
  } else if (confidenceGateFailed) {
    gateFailure = {
      code: 3,
      reason: 'confidence_gate_failed',
      message: `Winner confidence ${result.decision_index.winner_confidence} is below required ${minWinnerConfidence}`
    }
  } else if (securityGateFailed) {
    gateFailure = {
      code: 4,
      reason: 'security_approve_gate_failed',
      message: `Security approval required but not met (selected=${selectedId || 'none'}, security_vote=${selected?.security_vote || 'none'})`
    }
  }

  if (ciReportPath) {
    let fullSchemaSha256
    let compactSchemaSha256
    try {
      fullSchemaSha256 = computeSchemaSha256(CI_REPORT_FULL_SCHEMA_REF)
      compactSchemaSha256 = computeSchemaSha256(CI_REPORT_COMPACT_SCHEMA_REF)
    } catch (error) {
      console.error(`Schema resolution failed: ${error.message}`)
      process.exit(1)
    }

    const report = ciReportCompact
      ? {
          schema_version: CI_REPORT_COMPACT_SCHEMA_VERSION,
          schema_ref: CI_REPORT_COMPACT_SCHEMA_REF,
          schema_sha256: compactSchemaSha256,
          report_variant: 'compact',
          report_type: CI_REPORT_TYPE,
          generated_by: 'auto-argue-orchestrator',
          compatibility: {
            contract: CI_REPORT_TYPE,
            backward_compatible_with: CI_REPORT_BACKWARD_COMPATIBLE_WITH
          },
          tool: 'auto-argue-orchestrator',
          passed: !gateFailure,
          exit_code: gateFailure?.code || 0,
          reason: gateFailure?.reason || 'ok',
          gate_trace: gateTrace,
          selected_proposal_id: result.final_decision.selected_proposal_id,
          winner_confidence: result.decision_index.winner_confidence,
          selected_security_vote: selected?.security_vote || null
        }
      : {
          schema_version: CI_REPORT_FULL_SCHEMA_VERSION,
          schema_ref: CI_REPORT_FULL_SCHEMA_REF,
          schema_sha256: fullSchemaSha256,
          report_variant: 'full',
          report_type: CI_REPORT_TYPE,
          generated_by: 'auto-argue-orchestrator',
          compatibility: {
            contract: CI_REPORT_TYPE,
            backward_compatible_with: CI_REPORT_BACKWARD_COMPATIBLE_WITH
          },
          generated_at: new Date().toISOString(),
          tool: 'auto-argue-orchestrator',
          input: resolvedInput,
          output_dir: resolvedOutput,
          strict_ci_enabled: strictCi,
          gates: {
            fail_on_reject: failOnReject,
            require_security_approve: requireSecurityApprove,
            min_winner_confidence_required: minWinnerConfidence,
            strict_proposal_limit: strictProposalLimit
          },
          decision: {
            selected_proposal_id: result.final_decision.selected_proposal_id,
            final_status: result.final_decision.status,
            final_reason: result.final_decision.reason,
            security_gate: result.final_decision.security_gate,
            selected_security_vote: selected?.security_vote || null,
            winner_confidence: result.decision_index.winner_confidence
          },
          outcome: gateFailure
            ? {
                passed: false,
                exit_code: gateFailure.code,
                reason: gateFailure.reason,
                message: gateFailure.message
              }
            : {
                passed: true,
                exit_code: 0,
                reason: 'ok',
                message: 'all gates passed'
              },
          gate_trace: gateTrace,
          artifacts: [...generatedFiles, ciReportPath]
        }
    fs.mkdirSync(path.dirname(ciReportPath), { recursive: true })
    fs.writeFileSync(ciReportPath, JSON.stringify(report, null, 2) + '\n')
    generatedFiles.push(ciReportPath)
  }

  if (gateFailure) {
    console.error(gateFailure.message)
    console.error(`Artifacts written to: ${resolvedOutput}`)
    for (const filePath of generatedFiles) {
      console.error(`- ${filePath}`)
    }
    process.exit(gateFailure.code)
  }

  console.log(`Auto argue orchestration completed: ${resolvedOutput}`)
  for (const filePath of generatedFiles) {
    console.log(`- ${filePath}`)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === modulePath
if (isMain) {
  main()
}
