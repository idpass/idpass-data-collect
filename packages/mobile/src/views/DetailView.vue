<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, Program } from '@/utils/formIoUtils'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import type { FormSubmission, EntityDoc } from '@idpass/data-collect-core'
import { SyncLevel } from '@idpass/data-collect-core'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<Array<{ initial: EntityDoc; modified: EntityDoc }> | undefined>()
const dependentForms = ref<EntityForm[]>([])
const openViewDialog = ref(false)
const openEnrolDialog = ref(false)
const events = ref<FormSubmission[]>([])
const enrolBusy = ref(false)
const enrolError = ref<string | null>(null)

const programs = computed<Program[]>(() => tenantapp.value?.programs ?? [])

const pendingEnrolments = computed<Array<{ programId: number; programName?: string }>>(() => {
  const raw = storedEntityData.value?.[0]?.modified?.data?.pendingProgramEnrolments
  return Array.isArray(raw) ? (raw as Array<{ programId: number; programName?: string }>) : []
})

// Enrolled programmes — server-applied CRs project here via the
// `program-enrolment-applied` event emitted by the OpenSPP V2 adapter.
const enrolledEnrolments = computed<Array<{ programId: number; programName?: string; appliedAt?: string }>>(() => {
  const raw = storedEntityData.value?.[0]?.modified?.data?.enrolledPrograms
  return Array.isArray(raw)
    ? (raw as Array<{ programId: number; programName?: string; appliedAt?: string }>)
    : []
})

// Rejected programmes — operator $reject on the OpenSPP CR projects here via
// the `program-enrolment-rejected` event emitted by the OpenSPP V2 adapter.
// Rejection is non-terminal at the UX level: the program returns to the
// enrolable list so the field worker can resubmit after fixing the reason.
const rejectedEnrolments = computed<Array<{ programId: number; programName?: string; rejectedAt?: string; rejectionReason?: string }>>(() => {
  const raw = storedEntityData.value?.[0]?.modified?.data?.rejectedPrograms
  return Array.isArray(raw)
    ? (raw as Array<{ programId: number; programName?: string; rejectedAt?: string; rejectionReason?: string }>)
    : []
})

// Programme Enrolment targets individual entities (the eligibility-bearing
// person), not groups. The OpenSPP `assign_program` CR's `program_id` is a
// Many2one on the registrant partner — only individuals have program
// memberships. Future refinement: once the discovery branch surfaces the
// program `targetType`, filter per-program (some programs target groups, e.g.
// household-level subsidies). For now we surface the enrol card on every
// individual entity and rely on the OpenSPP side to reject mismatched pushes.
const canEnrolInProgram = computed(() => entityForm.value?.entityType === 'individual')

// Provenance from Claim-169 scans (offline VC verification). Surfaces as a
// chip on the header so auditors can tell field-verified records apart from
// self-attested ones. `verifiedBy` is the issuer DID (the trust anchor).
// `vcExpiry` lets us mark stale credentials in amber without hiding the
// historical fact that a verification happened.
const claim169Provenance = computed<{
  verifiedBy: string
  verifiedAt?: string
  vcExpiry?: string
  vcIssuedAt?: string
  subjectId?: string
  expired: boolean
} | null>(() => {
  const data = storedEntityData.value?.[0]?.modified?.data as Record<string, unknown> | undefined
  if (!data) return null
  const verifiedBy = typeof data.claim169_verifiedBy === 'string' ? data.claim169_verifiedBy : ''
  if (!verifiedBy) return null
  const vcExpiry = typeof data.claim169_vcExpiry === 'string' ? data.claim169_vcExpiry : undefined
  const expired = vcExpiry ? new Date(vcExpiry).getTime() < Date.now() : false
  return {
    verifiedBy,
    verifiedAt: typeof data.claim169_verifiedAt === 'string' ? data.claim169_verifiedAt : undefined,
    vcExpiry,
    vcIssuedAt: typeof data.claim169_vcIssuedAt === 'string' ? data.claim169_vcIssuedAt : undefined,
    subjectId: typeof data.claim169_subjectId === 'string' ? data.claim169_subjectId : undefined,
    expired,
  }
})

const issuerShort = (did: string): string => {
  const m = /^did:[^:]+:(.+)$/.exec(did)
  return m ? m[1] : did
}

const formatProvenanceDate = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const showProvenanceDialog = ref(false)

const enrolableProgams = computed<Program[]>(() => {
  // Exclude programmes that are pending OR already enrolled. Without the
  // `enrolledPrograms` exclusion the enrol button would re-offer an applied
  // programme as soon as its pending chip cleared.
  const taken = new Set<number>([
    ...pendingEnrolments.value.map((p) => p.programId),
    ...enrolledEnrolments.value.map((p) => p.programId)
  ])
  return programs.value.filter((p) => !taken.has(p.id))
})

const enrolInProgram = async (program: Program) => {
  enrolBusy.value = true
  enrolError.value = null
  try {
    await store.submitForm({
      guid: uuidv4(),
      entityGuid: route.params.guid as string,
      type: 'enrol-in-program',
      data: { programId: program.id, programName: program.name },
      timestamp: new Date().toISOString(),
      userId: 'admin',
      syncLevel: SyncLevel.LOCAL
    })
    // Refresh local state so the chip + disabled list updates immediately.
    const entityData = await store.searchEntities([{ guid: route.params.guid }])
    storedEntityData.value = entityData
    const allEvents = await store.getAllEvents()
    events.value = allEvents
      .filter((event) => event.entityGuid === route.params.guid)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    openEnrolDialog.value = false
  } catch (err) {
    enrolError.value = err instanceof Error ? err.message : String(err)
  } finally {
    enrolBusy.value = false
  }
}

const navigateToEntityList = () => {
  const appId = route.params.id as string
  const entity = route.params.entity as string
  const rest = route.params.rest as string | undefined
  const basePath = rest ? `/app/${appId}/${rest}${entity}` : `/app/${appId}/${entity}`
  router.replace(basePath)
}

onMounted(async () => {
  try {
    const foundDocuments = await database.tenantapps
      .find({
        selector: {
          id: route.params.id
        }
      })
      .exec()
    tenantapp.value = foundDocuments[0]
    entityForm.value = tenantapp.value.entityForms.find(
      (entity) => entity.name === route.params.entity
    )
    const entityData = await store.searchEntities([{ guid: route.params.guid }])
    storedEntityData.value = entityData

    dependentForms.value = tenantapp.value.entityForms.filter(
      (entity) => entity.dependsOn === entityForm.value.name
    )

    const allEvents = await store.getAllEvents()
    events.value = allEvents
      .filter((event) => event.entityGuid === route.params.guid)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  } catch (error) {
    console.error('Error loading entity detail:', error)
    navigateToEntityList()
  }
})

const formatEventType = (type: string) => {
  return type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString()
}

const getSyncLabel = (syncLevel: SyncLevel) => {
  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'Synced'
  }
  return 'Local'
}

const getSyncColor = (syncLevel: SyncLevel) => {
  if (syncLevel === SyncLevel.REMOTE || syncLevel === SyncLevel.EXTERNAL) {
    return 'success'
  }
  return 'warning'
}

const getEntityName = () => {
  if (!storedEntityData.value || storedEntityData.value.length === 0) {
    return entityForm.value?.title || 'Entity'
  }
  const entity = storedEntityData.value[0]
  const name = entity?.modified?.data?._displayName || entity?.modified?.data?.name || entity?.modified?.name
  return name || entityForm.value?.title || 'Entity'
}
</script>

<template>
  <v-container v-if="tenantapp && storedEntityData" fluid class="pa-4">
    <!-- Entity header -->
    <v-card elevation="2" class="mb-4">
      <v-card-text>
        <div class="d-flex justify-space-between align-start ga-3">
          <div class="flex-grow-1">
            <div class="text-h6 font-weight-bold">{{ getEntityName() }}</div>
            <div class="d-flex align-center ga-2 flex-wrap mt-2">
              <v-chip size="x-small" variant="tonal">
                Updated {{ storedEntityData && storedEntityData[0] ? new Date(storedEntityData[0].modified.lastUpdated).toLocaleString() : '' }}
              </v-chip>
              <v-chip size="x-small" variant="tonal">
                Version {{ storedEntityData && storedEntityData[0] ? storedEntityData[0].modified.version : '' }}
              </v-chip>
              <v-chip
                v-if="claim169Provenance"
                size="x-small"
                :color="claim169Provenance.expired ? 'warning' : 'success'"
                variant="tonal"
                prepend-icon="mdi-shield-check"
                @click="showProvenanceDialog = true"
                style="cursor: pointer"
              >
                Verified by {{ issuerShort(claim169Provenance.verifiedBy) }}
                <template v-if="claim169Provenance.expired"> · VC expired</template>
              </v-chip>
            </div>
          </div>
          <div class="d-flex ga-2 flex-shrink-0">
            <v-btn icon="mdi-pencil" color="secondary" variant="flat" size="small" @click="router.push('edit')" aria-label="Edit" />
            <v-btn icon="mdi-eye" variant="tonal" size="small" @click="openViewDialog = true" aria-label="View JSON" />
          </div>
        </div>
      </v-card-text>
    </v-card>

    <!-- Program Enrollment — standalone card, only shown for the widow individual entity -->
    <v-card
      v-if="canEnrolInProgram && programs.length > 0"
      class="mb-4 enrolment-card"
      elevation="0"
      rounded="lg"
    >
      <v-card-text class="pa-4">
        <div class="d-flex align-center ga-2 mb-3 enrolment-card__title">
          <v-icon icon="mdi-seal" color="success" size="20" />
          <span class="text-subtitle-1 font-weight-bold">Program Enrollment</span>
        </div>

        <!-- Status rows — one per program, consistent layout regardless of state. -->
        <div class="enrolment-list">
          <!-- Enrolled (server-applied) -->
          <div
            v-for="enrolment in enrolledEnrolments"
            :key="`enrolled-${enrolment.programId}`"
            class="enrolment-row enrolment-row--applied"
          >
            <v-icon icon="mdi-check-circle" color="success" size="20" />
            <span class="enrolment-row__name">
              {{ enrolment.programName || `Program #${enrolment.programId}` }}
            </span>
            <span class="enrolment-row__status">Enrolled</span>
          </div>

          <!-- Pending sync -->
          <div
            v-for="enrolment in pendingEnrolments"
            :key="`pending-${enrolment.programId}`"
            class="enrolment-row enrolment-row--pending"
          >
            <v-icon icon="mdi-clock-outline" color="warning" size="20" />
            <span class="enrolment-row__name">
              {{ enrolment.programName || `Program #${enrolment.programId}` }}
            </span>
            <span class="enrolment-row__status">Pending sync</span>
          </div>

          <!-- Rejected -->
          <div
            v-for="enrolment in rejectedEnrolments"
            :key="`rejected-${enrolment.programId}`"
            class="enrolment-row enrolment-row--rejected"
          >
            <div class="enrolment-row__head">
              <v-icon icon="mdi-close-circle" color="error" size="20" />
              <span class="enrolment-row__name">
                {{ enrolment.programName || `Program #${enrolment.programId}` }}
              </span>
              <span class="enrolment-row__status">Rejected</span>
            </div>
            <div v-if="enrolment.rejectionReason" class="enrolment-row__detail">
              {{ enrolment.rejectionReason }}
            </div>
          </div>
        </div>

        <!-- CTA: enrol into remaining programmes -->
        <v-btn
          v-if="enrolableProgams.length > 0"
          block
          size="large"
          color="success"
          variant="flat"
          prepend-icon="mdi-clipboard-plus-outline"
          class="enrol-btn mt-3"
          @click="openEnrolDialog = true"
        >
          {{ enrolledEnrolments.length + pendingEnrolments.length + rejectedEnrolments.length > 0
            ? 'Enroll in another program'
            : 'Enroll in Program' }}
        </v-btn>
      </v-card-text>
    </v-card>

    <template v-if="dependentForms.length > 0">
      <div class="section-heading">Dependent Forms</div>
      <v-list lines="two" rounded="lg" elevation="1" bg-color="surface" class="mb-4">
        <v-list-item
          v-for="form in dependentForms"
          :key="form.name"
          @click="router.push(route.path + '/' + form.name)"
          append-icon="mdi-chevron-right"
        >
          <v-list-item-title class="font-weight-bold">{{ form.title }}</v-list-item-title>
          <v-list-item-subtitle>{{ form.description || 'Capture additional linked information.' }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </template>

    <template v-if="events.length > 0">
      <div class="section-heading">Events</div>
      <v-expansion-panels variant="accordion" class="mb-4">
        <v-expansion-panel v-for="event in events" :key="event.guid">
          <v-expansion-panel-title>
            <div class="d-flex flex-column ga-1 flex-grow-1 mr-2">
              <span class="text-body-2 font-weight-bold">{{ formatEventType(event.type) }}</span>
              <div class="d-flex align-center ga-2">
                <span class="text-caption text-medium-emphasis">{{ formatTimestamp(event.timestamp) }}</span>
                <v-chip size="x-small" :color="getSyncColor(event.syncLevel)" variant="tonal">
                  {{ getSyncLabel(event.syncLevel) }}
                </v-chip>
              </div>
            </div>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="text-caption text-medium-emphasis mb-2">by {{ event.userId }}</div>
            <div class="text-overline mb-1">Event Data</div>
            <pre class="json-block mb-3">{{ JSON.stringify(event.data, null, 2) }}</pre>
            <div class="text-overline mb-1">Full Event</div>
            <pre class="json-block">{{ JSON.stringify(event, null, 2) }}</pre>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </template>
  </v-container>

  <v-dialog v-model="openViewDialog" max-width="600" scrollable>
    <v-card rounded="lg">
      <v-card-title class="pa-4">View Entity</v-card-title>
      <v-card-text class="pa-4 pt-0">
        <pre class="json-block">{{ storedEntityData && storedEntityData[0] ? JSON.stringify(storedEntityData[0].modified.data, null, 2) : '' }}</pre>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="openViewDialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="openEnrolDialog" max-width="500">
    <v-card rounded="lg">
      <v-card-title class="pa-4">Enroll in Program</v-card-title>
      <v-card-text class="pa-4 pt-0">
        <v-alert v-if="enrolError" type="error" variant="tonal" class="mb-3" closable>
          {{ enrolError }}
        </v-alert>
        <v-list lines="two" density="comfortable">
          <v-list-item
            v-for="program in enrolableProgams"
            :key="program.id"
            :disabled="enrolBusy"
            @click="enrolInProgram(program)"
          >
            <v-list-item-title class="font-weight-bold">{{ program.name }}</v-list-item-title>
            <v-list-item-subtitle v-if="program.code">{{ program.code }}</v-list-item-subtitle>
            <template #append>
              <v-icon icon="mdi-chevron-right" />
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" :disabled="enrolBusy" @click="openEnrolDialog = false">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Provenance details. Tap the verified chip to see the full trust trail:
       issuer DID, scan time, credential validity window. Audit-grade info
       that an investigator can reproduce by re-scanning the original QR. -->
  <v-dialog v-model="showProvenanceDialog" max-width="480">
    <v-card v-if="claim169Provenance" rounded="lg">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-shield-check" :color="claim169Provenance.expired ? 'warning' : 'success'" />
        Identity provenance
      </v-card-title>
      <v-card-text>
        <div class="text-body-2 text-medium-emphasis mb-3">
          Offline signature check against trusted issuer. No network was used.
        </div>
        <dl class="provenance-grid">
          <dt>Issuer DID</dt>
          <dd class="provenance-mono">{{ claim169Provenance.verifiedBy }}</dd>
          <dt>Subject ID</dt>
          <dd class="provenance-mono">{{ claim169Provenance.subjectId || '—' }}</dd>
          <dt>Scanned at</dt>
          <dd>{{ formatProvenanceDate(claim169Provenance.verifiedAt) }}</dd>
          <dt>VC issued</dt>
          <dd>{{ formatProvenanceDate(claim169Provenance.vcIssuedAt) }}</dd>
          <dt>VC expires</dt>
          <dd :class="{ 'text-warning': claim169Provenance.expired }">
            {{ formatProvenanceDate(claim169Provenance.vcExpiry) }}
            <span v-if="claim169Provenance.expired"> · Expired</span>
          </dd>
        </dl>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="showProvenanceDialog = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.provenance-grid {
  display: grid;
  grid-template-columns: 96px 1fr;
  row-gap: 8px;
  column-gap: 12px;
  margin: 0;
}
.provenance-grid dt {
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
  font-size: 0.85rem;
}
.provenance-grid dd {
  margin: 0;
  font-size: 0.9rem;
  word-break: break-word;
}
.provenance-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
}

.enrolment-card {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border: 1.5px solid #86efac;
}

.enrolment-card__title {
  letter-spacing: -0.005em;
}

/* Section heading rhythm — every top-level section (Dependent Forms, Events)
 * sits at the same vertical cadence so the page reads as one stack with even
 * gutters instead of the cramped run-on that the demo screenshot caught. */
.section-heading {
  margin: 24px 0 10px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(0, 0, 0, 0.62);
}

.enrol-btn {
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* Status-row system: every program slot reads as the same shape regardless of
 * state. Variant modifiers change colour, not layout — keeps the card visually
 * stable as CRs transition pending → enrolled or pending → rejected. */
.enrolment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.enrolment-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid transparent;
  min-height: 44px;
}

.enrolment-row__name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enrolment-row__status {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.enrolment-row--applied {
  background: #ffffff;
  border-color: #86efac;
}
.enrolment-row--applied .enrolment-row__status { color: #15803d; }

.enrolment-row--pending {
  background: #fffbeb;
  border-color: #fcd34d;
}
.enrolment-row--pending .enrolment-row__status { color: #b45309; }

.enrolment-row--rejected {
  background: #fef2f2;
  border-color: #fecaca;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 10px 12px 12px;
}
.enrolment-row--rejected .enrolment-row__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.enrolment-row--rejected .enrolment-row__status { color: #b91c1c; }
.enrolment-row__detail {
  font-size: 12.5px;
  color: #7f1d1d;
  margin-left: 30px;
  line-height: 1.4;
}

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
