import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import {
  ACCOUNT_SYNC_FACADE_KEY,
  createAccountSyncFacade
} from './account/accountSyncFacade.js'
import { createAuthAdapter } from './account/authAdapter.js'
import { loadSyncConfig } from './account/config.js'
import { createSupabaseClientProvider } from './account/supabaseClient.js'
import { createTauriSessionStorage } from './account/tauriSessionStorage.js'
import {
  isTauriEnvironment,
  store,
  validateImportData
} from './data/store.js'
import { createDiagnosticStore } from './observability/diagnostics.js'
import { createCloudSnapshotRepository } from './sync/cloudSnapshotRepository.js'
import { createSyncCoordinator } from './sync/syncCoordinator.js'
import { createAiAssistantClient, AI_ASSISTANT_CLIENT_KEY } from './ai/aiAssistantClient.js'
import { loadAiConfig } from './ai/config.js'

const syncConfig = loadSyncConfig(import.meta.env, {
  isProduction: import.meta.env.PROD
})
const aiConfig = loadAiConfig(import.meta.env, {
  isProduction: import.meta.env.PROD
})
const diagnostics = createDiagnosticStore({
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0'
})
const sessionStorage = isTauriEnvironment()
  ? createTauriSessionStorage()
  : undefined
const supabaseClientConfig = syncConfig.isSyncAvailable
  ? syncConfig
  : aiConfig.clientConfig
const clientProvider = createSupabaseClientProvider({
  config: supabaseClientConfig,
  storage: sessionStorage
})

async function createSyncServices() {
  const authAdapter = createAuthAdapter({ clientProvider })
  const deviceMetadata = await store.getOrCreateDeviceMetadata()
  const cloudRepository = createCloudSnapshotRepository({
    clientProvider,
    deviceId: deviceMetadata.deviceId,
    normalizeSnapshot: validateImportData
  })
  const syncCoordinator = createSyncCoordinator({
    store,
    cloudRepository,
    diagnostics
  })
  return { authAdapter, syncCoordinator }
}

const accountSyncFacade = createAccountSyncFacade({
  store,
  config: syncConfig,
  createServices: createSyncServices,
  diagnostics
})
const aiAssistantClient = createAiAssistantClient({
  config: aiConfig,
  clientProvider
})

createApp(App)
  .provide(ACCOUNT_SYNC_FACADE_KEY, accountSyncFacade)
  .provide(AI_ASSISTANT_CLIENT_KEY, aiAssistantClient)
  .mount('#app')
