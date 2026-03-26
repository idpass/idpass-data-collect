<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { VerifiedIdentity } from '@/services/claim169Service'
import { genderToString, imageFormatToMimeType, mapClaim169ToEntityData } from '@/services/claim169Service'
import { normalizePhotoBytes, photoToDataUrl } from '@/utils/photoUtils'
import { useDatabase } from '@/database'
import { initStore, store } from '@/store'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { SyncLevel } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'

const router = useRouter()
const database = useDatabase()

const verifiedIdentity = ref<VerifiedIdentity | null>(null)
const tenantApps = ref<TenantAppData[]>([])
const showAppSelector = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const isSaved = ref(false)

const tenantAppsSub = database.tenantapps.find().$.subscribe((results: TenantAppData[]) => {
  tenantApps.value = results
})

onUnmounted(() => {
  tenantAppsSub.unsubscribe()
})

onMounted(() => {
  const state = history.state
  if (state?.verifiedIdentity) {
    try {
      verifiedIdentity.value = JSON.parse(state.verifiedIdentity)
    } catch (error) {
      console.error('Failed to parse verified identity:', error)
    }
  }

  if (!verifiedIdentity.value) {
    router.replace({ name: 'scan-claim169' })
  }
})

const identity = computed(() => verifiedIdentity.value?.identity)
const cwt = computed(() => verifiedIdentity.value?.cwt)

const photoUrl = computed(() => {
  if (!identity.value?.photo) return null
  const bytes = normalizePhotoBytes(identity.value.photo)
  if (!bytes) return null
  const mimeType = imageFormatToMimeType(identity.value.photoFormat)
  return photoToDataUrl(bytes, mimeType)
})

const formattedGender = computed(() => genderToString(identity.value?.gender))

const formattedIssuedAt = computed(() => {
  if (!cwt.value?.issuedAt) return null
  return new Date(cwt.value.issuedAt * 1000).toLocaleDateString()
})

const formattedExpiration = computed(() => {
  if (!cwt.value?.expiresAt) return null
  return new Date(cwt.value.expiresAt * 1000).toLocaleDateString()
})

const statusType = computed(() => {
  if (verifiedIdentity.value?.isExpired) return 'error'
  if (verifiedIdentity.value?.isVerified) return 'success'
  return 'warning'
})

const statusTitle = computed(() => {
  if (verifiedIdentity.value?.isExpired) return 'Expired'
  if (verifiedIdentity.value?.isVerified) return 'Verified'
  return 'Unverified'
})

const statusSubtitle = computed(() => {
  if (verifiedIdentity.value?.isExpired) return 'This identity credential has expired'
  if (verifiedIdentity.value?.isVerified) return 'Signature verified successfully'
  return `Signature could not be verified${verifiedIdentity.value?.cwt?.issuer ? ` (Issuer: ${verifiedIdentity.value.cwt.issuer})` : ''}`
})

const statusIcon = computed(() => {
  if (verifiedIdentity.value?.isExpired) return 'mdi-alert-circle'
  if (verifiedIdentity.value?.isVerified) return 'mdi-check-circle'
  return 'mdi-alert'
})

const personalInfo = computed(() => {
  const fields: Array<{ label: string; value: string }> = []
  if (identity.value?.firstName) fields.push({ label: 'First Name', value: identity.value.firstName })
  if (identity.value?.lastName) fields.push({ label: 'Last Name', value: identity.value.lastName })
  if (identity.value?.dateOfBirth) fields.push({ label: 'Date of Birth', value: identity.value.dateOfBirth })
  if (formattedGender.value) fields.push({ label: 'Gender', value: formattedGender.value })
  if (identity.value?.nationality) fields.push({ label: 'Nationality', value: identity.value.nationality })
  return fields
})

const contactInfo = computed(() => {
  const fields: Array<{ label: string; value: string }> = []
  if (identity.value?.phone) fields.push({ label: 'Phone', value: identity.value.phone })
  if (identity.value?.email) fields.push({ label: 'Email', value: identity.value.email })
  if (identity.value?.address) fields.push({ label: 'Address', value: identity.value.address })
  return fields
})

const credentialInfo = computed(() => {
  const fields: Array<{ label: string; value: string; color?: string }> = []
  if (cwt.value?.issuer) fields.push({ label: 'Issuer', value: cwt.value.issuer })
  if (formattedIssuedAt.value) fields.push({ label: 'Issued', value: formattedIssuedAt.value })
  if (formattedExpiration.value) fields.push({ label: 'Expires', value: formattedExpiration.value, color: verifiedIdentity.value?.isExpired ? 'error' : undefined })
  return fields
})

const handleScanAnother = () => router.push({ name: 'scan-claim169' })

const saveToApp = async (app: TenantAppData) => {
  if (!verifiedIdentity.value) return

  isSaving.value = true
  saveError.value = ''
  showAppSelector.value = false

  try {
    await initStore(app.id, app.syncServerUrl)

    const entityData = mapClaim169ToEntityData(verifiedIdentity.value)

    await store.submitForm({
      guid: uuidv4(),
      entityGuid: entityData.guid,
      type: 'create-individual',
      data: {
        ...entityData,
        name: entityData.fullName || entityData.guid
      },
      timestamp: new Date().toISOString(),
      userId: 'admin',
      syncLevel: SyncLevel.LOCAL
    })

    isSaved.value = true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save identity record'
    saveError.value = message
  } finally {
    isSaving.value = false
  }
}

const handleSaveToRecords = () => {
  if (!verifiedIdentity.value) return
  saveError.value = ''

  if (tenantApps.value.length === 0) {
    saveError.value = 'No collection programs available. Add a program first.'
    return
  }

  if (tenantApps.value.length === 1) {
    saveToApp(tenantApps.value[0])
    return
  }

  showAppSelector.value = true
}
</script>

<template>
  <v-container v-if="verifiedIdentity" fluid class="pa-4">
    <div class="d-flex align-center ga-3 mb-4">
      <span class="text-h6 font-weight-bold">Identity Details</span>
    </div>

    <!-- Verification Status -->
    <v-alert
      :type="statusType"
      variant="tonal"
      rounded="lg"
      :icon="statusIcon"
      class="mb-4"
    >
      <strong>{{ statusTitle }}</strong>
      <div class="text-body-2 mt-1" style="opacity: 0.85;">{{ statusSubtitle }}</div>
    </v-alert>

    <!-- Photo and Name Card -->
    <v-card elevation="1" class="mb-4">
      <v-card-text class="d-flex align-center ga-4">
        <v-avatar size="80" rounded="lg">
          <v-img v-if="photoUrl" :src="photoUrl" alt="Identity photo" />
          <v-icon v-else size="40" color="medium-emphasis">mdi-account</v-icon>
        </v-avatar>
        <div>
          <div class="text-h6 font-weight-bold">
            {{ identity?.fullName || `${identity?.firstName || ''} ${identity?.lastName || ''}`.trim() || 'Unknown' }}
          </div>
          <div v-if="identity?.id" class="text-caption text-medium-emphasis mt-1">ID: {{ identity.id }}</div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Personal Information -->
    <v-card v-if="personalInfo.length" elevation="1" class="mb-4">
      <v-card-text>
        <div class="text-overline text-medium-emphasis mb-3">Personal Information</div>
        <v-row dense>
          <v-col v-for="field in personalInfo" :key="field.label" cols="6">
            <div class="text-caption text-medium-emphasis text-uppercase">{{ field.label }}</div>
            <div class="text-body-2 font-weight-medium">{{ field.value }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Contact Information -->
    <v-card v-if="contactInfo.length" elevation="1" class="mb-4">
      <v-card-text>
        <div class="text-overline text-medium-emphasis mb-3">Contact Information</div>
        <v-row dense>
          <v-col v-for="field in contactInfo" :key="field.label" :cols="field.label === 'Address' ? 12 : 6">
            <div class="text-caption text-medium-emphasis text-uppercase">{{ field.label }}</div>
            <div class="text-body-2 font-weight-medium">{{ field.value }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Guardian Information -->
    <v-card v-if="identity?.guardian" elevation="1" class="mb-4">
      <v-card-text>
        <div class="text-overline text-medium-emphasis mb-3">Guardian Information</div>
        <div class="text-caption text-medium-emphasis text-uppercase">Guardian</div>
        <div class="text-body-2 font-weight-medium">{{ identity.guardian }}</div>
      </v-card-text>
    </v-card>

    <!-- Credential Information -->
    <v-card v-if="credentialInfo.length" elevation="1" class="mb-4">
      <v-card-text>
        <div class="text-overline text-medium-emphasis mb-3">Credential Information</div>
        <v-row dense>
          <v-col v-for="field in credentialInfo" :key="field.label" cols="6">
            <div class="text-caption text-medium-emphasis text-uppercase">{{ field.label }}</div>
            <div class="text-body-2 font-weight-medium" :class="field.color ? `text-${field.color}` : ''">{{ field.value }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Raw Data Toggle -->
    <v-expansion-panels variant="accordion" class="mb-4">
      <v-expansion-panel title="Raw Data">
        <v-expansion-panel-text>
          <pre class="json-block">{{ JSON.stringify(verifiedIdentity, null, 2) }}</pre>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Save Error -->
    <v-alert v-if="saveError" type="error" variant="tonal" class="mb-4">
      {{ saveError }}
    </v-alert>

    <!-- Actions -->
    <div class="d-flex ga-3">
      <v-btn variant="tonal" class="flex-grow-1" @click="handleScanAnother">
        Scan Another
      </v-btn>
      <v-btn
        color="secondary"
        variant="flat"
        class="flex-grow-1"
        :disabled="isSaved || isSaving"
        :loading="isSaving"
        @click="handleSaveToRecords"
      >
        {{ isSaved ? 'Saved' : 'Save to Records' }}
      </v-btn>
    </div>

    <!-- App Selector -->
    <v-bottom-sheet v-model="showAppSelector">
      <v-card rounded="t-lg">
        <v-card-title>Select Program</v-card-title>
        <v-card-subtitle>Choose a collection program to save this record to</v-card-subtitle>
        <v-list nav>
          <v-list-item
            v-for="app in tenantApps"
            :key="app.id"
            :title="app.name"
            :subtitle="app.description"
            @click="saveToApp(app)"
          />
        </v-list>
        <v-card-actions>
          <v-btn block variant="text" @click="showAppSelector = false">Cancel</v-btn>
        </v-card-actions>
      </v-card>
    </v-bottom-sheet>
  </v-container>

  <!-- Loading state -->
  <v-container v-else class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
    <v-progress-circular indeterminate color="secondary" size="48" class="mb-4" />
    <p class="text-body-2 text-medium-emphasis">Loading identity data...</p>
  </v-container>
</template>

<style scoped>
.json-block {
  background: #0f172a;
  border-radius: 8px;
  padding: 0.75rem;
  color: #f8fafc;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
