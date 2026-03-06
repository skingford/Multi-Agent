#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const modulePath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(modulePath)
const workspaceRoot = path.resolve(scriptDir, '..', '..')

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)

const sha256OfFile = filePath =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath, 'utf8')).digest('hex')

const parseJsonFile = filePath => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`Invalid JSON at ${filePath}: ${error.message}`)
  }
}

const isType = (value, type) => {
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isObject(value)
  if (type === 'null') return value === null
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'boolean') return typeof value === 'boolean'
  return true
}

const validateBySchema = (value, schema, jsonPath, errors) => {
  if (!schema || typeof schema !== 'object') return

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${jsonPath}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`)
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${jsonPath}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`)
  }

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
    const matches = allowedTypes.some(type => isType(value, type))
    if (!matches) {
      errors.push(`${jsonPath}: expected type ${allowedTypes.join('|')}`)
      return
    }
  }

  if (typeof value === 'string' && typeof schema.pattern === 'string') {
    const regex = new RegExp(schema.pattern)
    if (!regex.test(value)) {
      errors.push(`${jsonPath}: string does not match pattern ${schema.pattern}`)
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${jsonPath}: expected >= ${schema.minimum}, got ${value}`)
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${jsonPath}: expected <= ${schema.maximum}, got ${value}`)
    }
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => {
        validateBySchema(item, schema.items, `${jsonPath}[${index}]`, errors)
      })
    }
    return
  }

  if (isObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required : []
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${jsonPath}: missing required key '${key}'`)
      }
    }

    const properties = isObject(schema.properties) ? schema.properties : {}
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in value) {
        validateBySchema(value[key], propSchema, `${jsonPath}.${key}`, errors)
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          errors.push(`${jsonPath}: unexpected key '${key}'`)
        }
      }
    }
  }
}

const verifyArtifactFile = filePath => {
  const payload = parseJsonFile(filePath)
  if (!isObject(payload)) {
    throw new Error(`Expected object JSON in ${filePath}`)
  }

  if (typeof payload.schema_ref !== 'string' || payload.schema_ref.length === 0) {
    throw new Error(`${filePath}: missing schema_ref`)
  }
  if (typeof payload.schema_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payload.schema_sha256)) {
    throw new Error(`${filePath}: missing or invalid schema_sha256`)
  }

  const schemaPath = path.resolve(workspaceRoot, payload.schema_ref)
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`${filePath}: schema_ref not found (${schemaPath})`)
  }

  const actualSha256 = sha256OfFile(schemaPath)
  if (payload.schema_sha256 !== actualSha256) {
    throw new Error(
      `${filePath}: schema_sha256 mismatch (expected=${payload.schema_sha256}, actual=${actualSha256})`
    )
  }

  const schema = parseJsonFile(schemaPath)
  const errors = []
  validateBySchema(payload, schema, '$', errors)
  if (errors.length > 0) {
    throw new Error(`${filePath}: schema validation failed:\n- ${errors.join('\n- ')}`)
  }

  return {
    filePath,
    schemaVersion: payload.schema_version || null,
    schemaRef: payload.schema_ref,
    schemaSha256: actualSha256
  }
}

const findArtifactTargets = inputPath => {
  const stats = fs.statSync(inputPath)
  if (stats.isFile()) {
    return [inputPath]
  }

  const targets = []
  const preferred = ['run-summary.json', 'CI_GATE_REPORT.json']
  for (const name of preferred) {
    const candidate = path.join(inputPath, name)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      targets.push(candidate)
    }
  }

  return targets
}

const main = () => {
  const cliArgs = process.argv.slice(2)
  const flags = new Set(cliArgs.filter(arg => arg.startsWith('--')))
  const positional = cliArgs.filter(arg => !arg.startsWith('--'))
  const [inputArg] = positional
  const requireCiReport = flags.has('--require-ci-report')
  const jsonOutput = flags.has('--json')
  const emitError = message => {
    if (jsonOutput) {
      console.error(JSON.stringify({ ok: false, error: message }, null, 2))
      return
    }
    console.error(message)
  }

  if (!inputArg) {
    emitError(
      'Usage: node verify-artifact-schema.mjs <artifact.json|output-dir> [--require-ci-report] [--json]'
    )
    process.exit(1)
  }

  const resolvedInput = path.resolve(process.cwd(), inputArg)
  if (!fs.existsSync(resolvedInput)) {
    emitError(`Path not found: ${resolvedInput}`)
    process.exit(1)
  }

  let targets
  try {
    targets = findArtifactTargets(resolvedInput)
  } catch (error) {
    emitError(`Failed to inspect input path: ${error.message}`)
    process.exit(1)
  }

  if (targets.length === 0) {
    emitError('No verifiable artifact found (expected run-summary.json and/or CI_GATE_REPORT.json)')
    process.exit(1)
  }

  if (requireCiReport) {
    const hasCiReport = targets.some(filePath => path.basename(filePath) === 'CI_GATE_REPORT.json')
    if (!hasCiReport) {
      emitError('CI_GATE_REPORT.json is required but not found')
      process.exit(1)
    }
  }

  const verified = []
  for (const target of targets) {
    try {
      verified.push(verifyArtifactFile(target))
    } catch (error) {
      emitError(`Verification failed: ${error.message}`)
      process.exit(1)
    }
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          verified_count: verified.length,
          require_ci_report: requireCiReport,
          artifacts: verified.map(item => ({
            file_path: item.filePath,
            schema_version: item.schemaVersion,
            schema_ref: item.schemaRef,
            schema_sha256: item.schemaSha256
          }))
        },
        null,
        2
      )
    )
    return
  }

  console.log(`Verified ${verified.length} artifact(s):`)
  for (const item of verified) {
    console.log(`- ${item.filePath}`)
    console.log(`  schema_version=${item.schemaVersion}`)
    console.log(`  schema_ref=${item.schemaRef}`)
    console.log(`  schema_sha256=${item.schemaSha256}`)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === modulePath
if (isMain) {
  main()
}
