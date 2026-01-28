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

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { VerifiedIdentity } from '@/services/claim169Service'
import { genderToString, imageFormatToMimeType } from '@/services/claim169Service'

const router = useRouter()

const verifiedIdentity = ref<VerifiedIdentity | null>(null)
const showRawData = ref(false)

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
  const photo = identity.value.photo
  // Handle both Uint8Array and regular array (from JSON serialization)
  let bytes: Uint8Array
  if (photo instanceof Uint8Array) {
    bytes = photo
  } else if (typeof photo === 'object' && photo !== null) {
    // JSON serialization converts Uint8Array to object with numeric keys
    const photoObj = photo as unknown as Record<string, unknown>
    const values = Object.keys(photoObj)
      .filter(k => !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b))
      .map(k => Number(photoObj[k]))
    bytes = new Uint8Array(values)
  } else {
    return null
  }
  const mimeType = imageFormatToMimeType(identity.value.photoFormat)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return `data:${mimeType};base64,${base64}`
})

const formattedDateOfBirth = computed(() => {
  return identity.value?.dateOfBirth
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

const fullAddress = computed(() => {
  return identity.value?.address || null
})

const handleBack = () => {
  router.back()
}

const handleScanAnother = () => {
  router.push({ name: 'scan-claim169' })
}

const handleSaveToRecords = () => {
  // TODO: Implement saving to local records
  console.log('Save to records:', verifiedIdentity.value)
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
          <div v-if="formattedDateOfBirth" class="info-item">
            <span class="info-label">Date of Birth</span>
            <span class="info-value">{{ formattedDateOfBirth }}</span>
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
      <section v-if="identity?.phone || identity?.email || fullAddress" class="info-section">
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
          <div v-if="fullAddress" class="info-item full-width">
            <span class="info-label">Address</span>
            <span class="info-value">{{ fullAddress }}</span>
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

      <!-- Actions -->
      <div class="actions">
        <button class="action-button secondary" type="button" @click="handleScanAnother">
          Scan Another
        </button>
        <button class="action-button primary" type="button" @click="handleSaveToRecords">
          Save to Records
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
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
  box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3);
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
</style>
