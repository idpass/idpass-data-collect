<script setup lang="ts">
/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

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
const showRawData = ref(false)
const tenantApps = ref<TenantAppData[]>([])
const showAppSelector = ref(false)
const isSaving = ref(false)
const saveError = ref('')

// Subscribe to available tenant apps for the "Save to Records" feature
const tenantAppsSub = database.tenantapps.find().$.subscribe((results: TenantAppData[]) => {
  tenantApps.value = results
})

onUnmounted(() => {
  tenantAppsSub.unsubscribe()
})

onMounted(() => {
  // Get the verified identity from router state
  const state = history.state
  if (state?.verifiedIdentity) {
    try {
      verifiedIdentity.value = JSON.parse(state.verifiedIdentity)
    } catch (error) {
      console.error('Failed to parse verified identity:', error)
    }
  }

  if (!verifiedIdentity.value) {
    // No identity data, redirect back
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

const formattedGender = computed(() => {
  return genderToString(identity.value?.gender)
})

const formattedIssuedAt = computed(() => {
  if (!cwt.value?.issuedAt) return null
  return new Date(cwt.value.issuedAt * 1000).toLocaleDateString()
})

const formattedExpiration = computed(() => {
  if (!cwt.value?.expiresAt) return null
  return new Date(cwt.value.expiresAt * 1000).toLocaleDateString()
})

const handleBack = () => {
  router.back()
}

const handleScanAnother = () => {
  router.push({ name: 'scan-claim169' })
}

const isSaved = ref(false)

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

  // Multiple apps: show selector
  showAppSelector.value = true
}

const toggleRawData = () => {
  showRawData.value = !showRawData.value
}
</script>

<template>
  <div class="identity-screen">
    <!-- Header -->
    <header class="identity-header">
      <button class="back-button" type="button" @click="handleBack" aria-label="Go back">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="currentColor" />
        </svg>
      </button>
      <h1>Identity Details</h1>
    </header>

    <div v-if="verifiedIdentity" class="identity-content">
      <!-- Verification Status -->
      <div
        :class="[
          'status-banner',
          {
            'status-verified': verifiedIdentity.isVerified && !verifiedIdentity.isExpired,
            'status-unverified': !verifiedIdentity.isVerified,
            'status-expired': verifiedIdentity.isExpired
          }
        ]"
      >
        <svg v-if="verifiedIdentity.isVerified && !verifiedIdentity.isExpired" viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            fill="currentColor"
          />
        </svg>
        <svg v-else-if="verifiedIdentity.isExpired" viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="currentColor"
          />
        </svg>
        <svg v-else viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z"
            fill="currentColor"
          />
        </svg>
        <div class="status-text">
          <span class="status-title">
            {{ verifiedIdentity.isExpired ? 'Expired' : verifiedIdentity.isVerified ? 'Verified' : 'Unverified' }}
          </span>
          <span class="status-subtitle">
            {{
              verifiedIdentity.isExpired
                ? 'This identity credential has expired'
                : verifiedIdentity.isVerified
                  ? 'Signature verified successfully'
                  : `Signature could not be verified${verifiedIdentity.cwt?.issuer ? ` (Issuer: ${verifiedIdentity.cwt.issuer})` : ''}`
            }}
          </span>
        </div>
      </div>

      <!-- Photo and Name Card -->
      <div class="identity-card">
        <div class="identity-photo-section">
          <div v-if="photoUrl" class="identity-photo">
            <img :src="photoUrl" alt="Identity photo" />
          </div>
          <div v-else class="identity-photo placeholder">
            <svg viewBox="0 0 24 24" focusable="false">
              <path
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div class="identity-name">
            <h2>{{ identity?.fullName || `${identity?.firstName || ''} ${identity?.lastName || ''}`.trim() || 'Unknown' }}</h2>
            <p v-if="identity?.id" class="identity-id">ID: {{ identity.id }}</p>
          </div>
        </div>
      </div>

      <!-- Personal Information -->
      <section class="info-section">
        <h3>Personal Information</h3>
        <div class="info-grid">
          <div v-if="identity?.firstName" class="info-item">
            <span class="info-label">First Name</span>
            <span class="info-value">{{ identity.firstName }}</span>
          </div>
          <div v-if="identity?.lastName" class="info-item">
            <span class="info-label">Last Name</span>
            <span class="info-value">{{ identity.lastName }}</span>
          </div>
          <div v-if="identity?.dateOfBirth" class="info-item">
            <span class="info-label">Date of Birth</span>
            <span class="info-value">{{ identity.dateOfBirth }}</span>
          </div>
          <div v-if="formattedGender" class="info-item">
            <span class="info-label">Gender</span>
            <span class="info-value">{{ formattedGender }}</span>
          </div>
          <div v-if="identity?.nationality" class="info-item">
            <span class="info-label">Nationality</span>
            <span class="info-value">{{ identity.nationality }}</span>
          </div>
        </div>
      </section>

      <!-- Contact Information -->
      <section v-if="identity?.phone || identity?.email || identity?.address" class="info-section">
        <h3>Contact Information</h3>
        <div class="info-grid">
          <div v-if="identity?.phone" class="info-item">
            <span class="info-label">Phone</span>
            <span class="info-value">{{ identity.phone }}</span>
          </div>
          <div v-if="identity?.email" class="info-item">
            <span class="info-label">Email</span>
            <span class="info-value">{{ identity.email }}</span>
          </div>
          <div v-if="identity?.address" class="info-item full-width">
            <span class="info-label">Address</span>
            <span class="info-value">{{ identity.address }}</span>
          </div>
        </div>
      </section>

      <!-- Guardian Information -->
      <section v-if="identity?.guardian" class="info-section">
        <h3>Guardian Information</h3>
        <div class="info-grid">
          <div v-if="identity?.guardian" class="info-item">
            <span class="info-label">Guardian</span>
            <span class="info-value">{{ identity.guardian }}</span>
          </div>
        </div>
      </section>

      <!-- Credential Information -->
      <section class="info-section">
        <h3>Credential Information</h3>
        <div class="info-grid">
          <div v-if="cwt?.issuer" class="info-item">
            <span class="info-label">Issuer</span>
            <span class="info-value">{{ cwt.issuer }}</span>
          </div>
          <div v-if="formattedIssuedAt" class="info-item">
            <span class="info-label">Issued</span>
            <span class="info-value">{{ formattedIssuedAt }}</span>
          </div>
          <div v-if="formattedExpiration" class="info-item">
            <span class="info-label">Expires</span>
            <span class="info-value" :class="{ 'text-expired': verifiedIdentity.isExpired }">
              {{ formattedExpiration }}
            </span>
          </div>
        </div>
      </section>

      <!-- Raw Data Toggle -->
      <button class="raw-data-toggle" type="button" @click="toggleRawData">
        {{ showRawData ? 'Hide' : 'Show' }} Raw Data
        <svg :class="{ rotated: showRawData }" viewBox="0 0 24 24" focusable="false">
          <path d="M7 10l5 5 5-5z" fill="currentColor" />
        </svg>
      </button>

      <div v-if="showRawData" class="raw-data">
        <pre>{{ JSON.stringify(verifiedIdentity, null, 2) }}</pre>
      </div>

      <!-- Save Error -->
      <div v-if="saveError" class="save-error">
        <svg viewBox="0 0 24 24" focusable="false">
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            fill="currentColor"
          />
        </svg>
        <span>{{ saveError }}</span>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button class="action-button secondary" type="button" @click="handleScanAnother">
          Scan Another
        </button>
        <button
          class="action-button primary"
          type="button"
          :disabled="isSaved || isSaving"
          @click="handleSaveToRecords"
        >
          <span v-if="isSaving" class="btn-spinner"></span>
          {{ isSaved ? 'Saved' : isSaving ? 'Saving...' : 'Save to Records' }}
        </button>
      </div>
    </div>

    <!-- App Selector Modal -->
    <div v-if="showAppSelector" class="app-selector-overlay" @click.self="showAppSelector = false">
      <div class="app-selector-card">
        <h3>Select Program</h3>
        <p>Choose a collection program to save this record to:</p>
        <div class="app-list">
          <button
            v-for="app in tenantApps"
            :key="app.id"
            class="app-item"
            type="button"
            @click="saveToApp(app)"
          >
            <span class="app-item-name">{{ app.name }}</span>
            <span v-if="app.description" class="app-item-desc">{{ app.description }}</span>
          </button>
        </div>
        <button class="app-selector-cancel" type="button" @click="showAppSelector = false">
          Cancel
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else class="loading">
      <div class="spinner"></div>
      <p>Loading identity data...</p>
    </div>
  </div>
</template>

<style scoped>
.identity-screen {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f9fafb;
}

.identity-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #ffffff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-button {
  background: transparent;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  color: #374151;
  display: grid;
  place-items: center;
  border-radius: 8px;
}

.back-button:active {
  background: #f3f4f6;
}

.back-button svg {
  width: 24px;
  height: 24px;
}

.identity-header h1 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
}

.identity-content {
  flex: 1;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
}

.status-banner svg {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.status-verified {
  background: #dcfce7;
  color: #166534;
}

.status-unverified {
  background: #fef3c7;
  color: #92400e;
}

.status-expired {
  background: #fee2e2;
  color: #991b1b;
}

.status-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.status-title {
  font-weight: 700;
  font-size: 1rem;
}

.status-subtitle {
  font-size: 0.85rem;
  opacity: 0.8;
}

.identity-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.identity-photo-section {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

.identity-photo {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
}

.identity-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.identity-photo.placeholder {
  background: #f3f4f6;
  display: grid;
  place-items: center;
}

.identity-photo.placeholder svg {
  width: 40px;
  height: 40px;
  color: #9ca3af;
}

.identity-name h2 {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
}

.identity-id {
  font-size: 0.85rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.info-section {
  background: #ffffff;
  border-radius: 18px;
  padding: 1.25rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.info-section h3 {
  font-size: 0.9rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-item.full-width {
  grid-column: span 2;
}

.info-label {
  font-size: 0.8rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.info-value {
  font-size: 0.95rem;
  color: #1f2937;
  font-weight: 500;
}

.info-value.text-expired {
  color: #dc2626;
}

.raw-data-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  color: #6b7280;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0.5rem;
}

.raw-data-toggle svg {
  width: 20px;
  height: 20px;
  transition: transform 0.2s ease;
}

.raw-data-toggle svg.rotated {
  transform: rotate(180deg);
}

.raw-data {
  background: #1f2937;
  border-radius: 12px;
  padding: 1rem;
  overflow-x: auto;
}

.raw-data pre {
  color: #e5e7eb;
  font-size: 0.75rem;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.actions {
  display: flex;
  gap: 1rem;
  margin-top: auto;
  padding-top: 1rem;
}

.action-button {
  flex: 1;
  padding: 0.875rem 1.5rem;
  border-radius: 14px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.action-button.primary {
  background: var(--brand, #ff6d37);
  color: #ffffff;
  box-shadow: none;
}

.action-button.primary:disabled {
  background: var(--status-success, #2D8A56);
  opacity: 0.85;
  box-shadow: none;
  cursor: default;
}

.action-button.secondary {
  background: #f3f4f6;
  color: #374151;
}

.loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e5e7eb;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading p {
  color: #6b7280;
  font-size: 0.95rem;
}

.save-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #fee2e2;
  border-radius: 10px;
  color: #991b1b;
  font-size: 0.9rem;
}

.save-error svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.btn-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-right: 0.5rem;
}

.app-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.app-selector-card {
  background: #ffffff;
  border-radius: 18px 18px 14px 14px;
  padding: 1.5rem;
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.app-selector-card h3 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.app-selector-card p {
  font-size: 0.9rem;
  color: #6b7280;
  margin-bottom: 1rem;
}

.app-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  margin-bottom: 1rem;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
}

.app-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.875rem 1rem;
  background: #ffffff;
  border: none;
  border-bottom: 1px solid #e5e7eb;
  border-radius: 0;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s ease;
}

.app-item:active {
  background: #f9fafb;
}

.app-item-name {
  font-weight: 600;
  color: #1f2937;
  font-size: 0.95rem;
}

.app-item-desc {
  font-size: 0.8rem;
  color: #6b7280;
}

.app-selector-cancel {
  width: 100%;
  padding: 0.75rem;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  font-size: 0.95rem;
  color: #6b7280;
  cursor: pointer;
}
</style>
