import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  createActorHasher,
  createDeadlineFetch,
  parseAllowedOrigins,
  parseNamedKeys,
  parsePositiveInteger
} from '../_shared/aiAssistantCore.js'
import { createAiAssistantHandler } from '../_shared/aiAssistantHandler.js'
import { createArkClient } from '../_shared/arkClient.js'

const DEFAULT_GUEST_LIMIT = 3
const DEFAULT_USER_LIMIT = 20
const DEFAULT_PROVIDER_TIMEOUT_MS = 18_000
const DEFAULT_SUPABASE_TIMEOUT_MS = 10_000
const DEFAULT_MAX_OUTPUT_TOKENS = 800
const DEFAULT_MAX_REQUEST_BYTES = 8 * 1024

function loadConfig() {
  const publishableKeys = parseNamedKeys(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
  const secretKeys = parseNamedKeys(Deno.env.get('SUPABASE_SECRET_KEYS'))
  const legacyPublishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const publishableKey = publishableKeys[0] ?? legacyPublishableKey
  const secretKey = secretKeys[0] ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return Object.freeze({
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    publishableKey,
    secretKey,
    publicCredentials: new Set(
      [legacyPublishableKey, ...publishableKeys].filter(Boolean)
    ),
    allowedOrigins: parseAllowedOrigins(Deno.env.get('AI_ALLOWED_ORIGINS')),
    quotaSalt: Deno.env.get('AI_QUOTA_SALT') ?? '',
    guestLimit: parsePositiveInteger(
      Deno.env.get('AI_GUEST_DAILY_LIMIT'),
      DEFAULT_GUEST_LIMIT
    ),
    userLimit: parsePositiveInteger(
      Deno.env.get('AI_USER_DAILY_LIMIT'),
      DEFAULT_USER_LIMIT
    ),
    providerTimeoutMs: parsePositiveInteger(
      Deno.env.get('AI_PROVIDER_TIMEOUT_MS'),
      DEFAULT_PROVIDER_TIMEOUT_MS,
      60_000
    ),
    supabaseTimeoutMs: parsePositiveInteger(
      Deno.env.get('AI_SUPABASE_TIMEOUT_MS'),
      DEFAULT_SUPABASE_TIMEOUT_MS,
      30_000
    ),
    maxOutputTokens: parsePositiveInteger(
      Deno.env.get('AI_MAX_OUTPUT_TOKENS'),
      DEFAULT_MAX_OUTPUT_TOKENS,
      4096
    ),
    maxRequestBytes: DEFAULT_MAX_REQUEST_BYTES,
    arkApiKey: Deno.env.get('ARK_API_KEY') ?? '',
    arkModelId: Deno.env.get('ARK_MODEL_ID') ?? '',
    arkThinkingMode: Deno.env.get('ARK_THINKING_MODE')
  })
}

async function createRuntime() {
  const config = loadConfig()
  const isSupabaseConfigured = Boolean(
    config.supabaseUrl &&
    config.publishableKey &&
    config.secretKey
  )
  let adminClient = null
  if (isSupabaseConfigured) {
    try {
      adminClient = createClient(config.supabaseUrl, config.secretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          fetch: createDeadlineFetch(
            globalThis.fetch.bind(globalThis),
            config.supabaseTimeoutMs
          )
        }
      })
    } catch {
      adminClient = null
    }
  }
  let arkClient = null
  if (config.arkApiKey && config.arkModelId) {
    try {
      arkClient = createArkClient({
        apiKey: config.arkApiKey,
        modelId: config.arkModelId,
        thinkingMode: config.arkThinkingMode,
        timeoutMs: config.providerTimeoutMs,
        maxOutputTokens: config.maxOutputTokens
      })
    } catch {
      arkClient = null
    }
  }
  let hashActor = null
  if (config.quotaSalt.length >= 16) {
    try {
      hashActor = await createActorHasher(config.quotaSalt)
    } catch {
      hashActor = null
    }
  }
  return Object.freeze({
    config,
    adminClient,
    arkClient,
    hashActor,
    logger: console,
    now: () => Date.now()
  })
}

let runtimePromise: ReturnType<typeof createRuntime> | null = null

async function getHandler() {
  if (!runtimePromise) runtimePromise = createRuntime()
  try {
    const runtime = await runtimePromise
    return createAiAssistantHandler(runtime)
  } catch (error) {
    runtimePromise = null
    throw error
  }
}

Deno.serve(async request => {
  const handler = await getHandler()
  return handler(request)
})
