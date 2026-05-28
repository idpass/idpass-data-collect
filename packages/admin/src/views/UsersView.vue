<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  getUsers as getUsersApi,
  createUser as createUserApi,
  updateUser as updateUserApi,
  deleteUser as deleteUserApi,
  getApps,
} from '@/api'
import type { AppListItem, AdminRoleAssignment } from '@/api'
import type { SyncScopeOverride } from '@idpass/data-collect-core'
import { useFeatureFlag } from '@/composables/useFeatureFlag'
import SyncScopeForm from '@/components/SyncScopeForm.vue'
import { useSnackBarStore } from '@/stores/snackBar'
import { AxiosError } from 'axios'

interface UserRecord {
  id: string
  email: string
  role: string
  programIds?: string[]
  roleAssignments?: AdminRoleAssignment[]
}

const snackBarStore = useSnackBarStore()
const scopedSyncEnabled = useFeatureFlag('scopedSync')

// State
const userForm = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const loading = ref(false)
const users = ref<UserRecord[]>([])
const programs = ref<AppListItem[]>([])
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const editedIndex = ref(-1)

const headers = [
  { title: 'Email', value: 'email' },
  { title: 'Role', value: 'role' },
  { title: 'Programs', value: 'programCount', sortable: false },
  { title: 'Actions', value: 'actions', sortable: false },
]

const itemActionsSlot = 'item.actions'

const roles = ['ADMIN', 'USER']

const passwordRules = [
  (v: string) => {
    if (editedIndex.value > -1 && !v) return true // optional when editing
    if (!v) return 'Password is required'
    if (v.length < 8) return 'Must be at least 8 characters'
    if (!/[A-Z]/.test(v)) return 'Must contain at least one uppercase letter'
    if (!/[a-z]/.test(v)) return 'Must contain at least one lowercase letter'
    if (!/[0-9]/.test(v)) return 'Must contain at least one number'
    if (!/[^A-Za-z0-9]/.test(v)) return 'Must contain at least one special character'
    return true
  },
]

const passwordHint = computed(() => {
  if (editedIndex.value > -1) return 'Leave blank to keep current password'
  return 'Min 8 characters with uppercase, lowercase, number, and special character'
})

interface EditableUser {
  id: string
  email: string
  password: string
  role: string
  programIds: string[]
  roleAssignments: AdminRoleAssignment[]
}

const defaultItem: EditableUser = {
  id: '',
  email: '',
  password: '',
  role: 'USER',
  programIds: [],
  roleAssignments: [],
}

const editedItem = reactive<EditableUser>({ ...defaultItem })

// Per-assignment override editor state. Keys are the `programId` for each
// assignment row in `editedItem.roleAssignments`. Stores the latest valid
// override built by SyncScopeForm. Wiped on dialog open.
const overrideErrors = reactive<Record<string, string | null>>({})
const expandedOverrides = reactive<Record<string, boolean>>({})
// Per-assignment validity, mirrored from each `<SyncScopeForm>` via
// `@update:valid`. Absent entries are treated as valid (no override editor
// mounted, nothing to validate). The save handler blocks when any entry is
// false to avoid persisting a stale override that contradicts the form state
// — `SyncScopeForm` suppresses `update:modelValue` while invalid (see
// `SyncScopeForm.vue:210-221`), so the in-memory `ra.syncScopeOverride` lags
// the UI when errors are present.
const overrideValid = reactive<Record<string, boolean>>({})

// Computed
const formTitle = computed(() => {
  return editedIndex.value === -1 ? 'Create User' : 'Edit User'
})

const _programNames = computed(() => {
  const map: Record<string, string> = {}
  for (const t of programs.value) {
    map[t.id] = t.name
  }
  return map
})

function programLabel(programId: string): string {
  const p = programs.value.find((x) => x.id === programId)
  return p?.name ?? programId
}

// Methods
const fetchUsers = async () => {
  loading.value = true
  try {
    const response = await getUsersApi()
    users.value = response as UserRecord[]
  } catch (error) {
    const msg = error instanceof AxiosError ? error.response?.data?.error || error.message : 'Failed to load users'
    snackBarStore.showSnackbar(msg, 'error')
  } finally {
    loading.value = false
  }
}

const loadPrograms = async () => {
  try {
    const response = await getApps()
    programs.value = response.data
  } catch (error) {
    console.error('Error fetching programs list:', error)
  }
}

function resetOverrideEditorState() {
  for (const key of Object.keys(overrideErrors)) delete overrideErrors[key]
  for (const key of Object.keys(expandedOverrides)) delete expandedOverrides[key]
  for (const key of Object.keys(overrideValid)) delete overrideValid[key]
}

const editUser = (item: UserRecord) => {
  editedIndex.value = users.value.indexOf(item)
  // Deep-copy roleAssignments so override edits don't mutate the row in
  // `users.value` until we successfully save.
  const cloned: AdminRoleAssignment[] = (item.roleAssignments ?? []).map((ra) => ({
    ...ra,
    syncScopeOverride: ra.syncScopeOverride ? { ...ra.syncScopeOverride } : undefined,
  }))
  Object.assign(editedItem, {
    ...item,
    password: '',
    programIds: item.programIds ?? [],
    roleAssignments: cloned,
  })
  resetOverrideEditorState()
  showCreateDialog.value = true
}

const confirmDelete = (item: UserRecord) => {
  editedIndex.value = users.value.indexOf(item)
  Object.assign(editedItem, item)
  showDeleteDialog.value = true
}

const deleteUser = async () => {
  try {
    await deleteUserApi(editedItem.id)
    users.value.splice(editedIndex.value, 1)
    showDeleteDialog.value = false
    snackBarStore.showSnackbar('User deleted', 'success')
  } catch (error) {
    const msg = error instanceof AxiosError ? error.response?.data?.error || error.message : 'Failed to delete user'
    snackBarStore.showSnackbar(msg, 'error')
  }
}

const closeDialog = () => {
  showCreateDialog.value = false
  Object.assign(editedItem, { ...defaultItem })
  editedIndex.value = -1
  resetOverrideEditorState()
}

function setOverride(programId: string, override: SyncScopeOverride | null) {
  const ra = editedItem.roleAssignments.find((r) => r.programId === programId)
  if (!ra) return
  if (override == null) {
    delete ra.syncScopeOverride
  } else {
    ra.syncScopeOverride = override
  }
}

function setOverrideError(programId: string, error: string | null) {
  if (error == null) {
    delete overrideErrors[programId]
  } else {
    overrideErrors[programId] = error
  }
}

function setOverrideValid(programId: string, valid: boolean) {
  overrideValid[programId] = valid
}

function toggleOverride(programId: string) {
  expandedOverrides[programId] = !expandedOverrides[programId]
}

function clearOverride(programId: string) {
  setOverride(programId, null)
  setOverrideError(programId, null)
  // The form is unmounted when the panel collapses, so its validity stops
  // mattering — drop the entry so it doesn't block save.
  delete overrideValid[programId]
  // Closing the panel signals "no override" visually; reopening starts fresh.
  expandedOverrides[programId] = false
}

const overrideErrorList = computed(() =>
  Object.entries(overrideErrors)
    .filter(([, err]) => err != null)
    .map(([programId, err]) => ({ programId, error: err as string })),
)

/**
 * Sync `editedItem.roleAssignments` with `editedItem.programIds`. We keep the
 * existing order/values when a program stays selected, append a default
 * `{ role, areaId? }` for newly-added programs, and drop assignments whose
 * program was removed.
 */
function reconcileRoleAssignments() {
  const existing = new Map(editedItem.roleAssignments.map((ra) => [ra.programId, ra]))
  editedItem.roleAssignments = editedItem.programIds.map((pid) => {
    return existing.get(pid) ?? { programId: pid, role: editedItem.role }
  })
}

const saveUser = async () => {
  if (userForm.value) {
    const { valid } = await userForm.value.validate()
    if (!valid) return
  }
  if (overrideErrorList.value.length > 0) {
    snackBarStore.showSnackbar(
      `Fix sync-scope override errors before saving: ${overrideErrorList.value
        .map((x) => x.error)
        .join('; ')}`,
      'error',
    )
    return
  }
  // Block save when any per-assignment SyncScopeForm currently reports invalid.
  // The form suppresses `update:modelValue` on error, so saving here would
  // persist a stale override (or a partial one if errors clear racily).
  const anyOverrideInvalid = Object.values(overrideValid).some((v) => v === false)
  if (anyOverrideInvalid) {
    snackBarStore.showSnackbar(
      'Fix sync-scope override errors before saving.',
      'error',
    )
    return
  }
  reconcileRoleAssignments()

  const isEditing = editedIndex.value > -1
  try {
    if (editedIndex.value > -1) {
      // Update existing user
      const payload: Parameters<typeof updateUserApi>[0] = {
        id: editedItem.id,
        email: editedItem.email,
        role: editedItem.role,
        programIds: editedItem.programIds,
        roleAssignments: editedItem.roleAssignments,
      }
      if (editedItem.password) {
        payload.password = editedItem.password
      }
      await updateUserApi(payload)
      Object.assign(users.value[editedIndex.value], editedItem)
    } else {
      // Create new user
      await createUserApi({
        email: editedItem.email,
        password: editedItem.password,
        role: editedItem.role,
        programIds: editedItem.programIds,
        roleAssignments: editedItem.roleAssignments,
      })
      users.value.push({ ...editedItem })
    }
    closeDialog()
    snackBarStore.showSnackbar(isEditing ? 'User updated' : 'User created', 'success')
  } catch (error) {
    const msg = error instanceof AxiosError ? error.response?.data?.error || error.message : 'Failed to save user'
    snackBarStore.showSnackbar(msg, 'error')
  }
}

const getProgramCount = (item: UserRecord): number => {
  return item.programIds?.length ?? 0
}

// Lifecycle hooks
onMounted(() => {
  fetchUsers()
  loadPrograms()
})
</script>

<template>
  <v-container>
    <div class="page-header">
      <div class="page-header__text">
        <h1 class="page-header__title">User Management</h1>
        <p class="page-header__subtitle">Create and manage user accounts and role assignments</p>
      </div>
      <div class="page-header__actions">
        <v-btn
          variant="flat"
          color="primary"
          prepend-icon="mdi-account-plus"
          @click="showCreateDialog = true"
        >
          Create User
        </v-btn>
      </div>
    </div>

        <!-- Users Table -->
        <v-data-table :headers="headers" :items="users" :loading="loading" class="users-table">
          <template #[`item.programCount`]="{ item }">
            <v-chip size="small" variant="tonal">
              {{ getProgramCount(item) }} program(s)
            </v-chip>
          </template>
          <template v-slot:[itemActionsSlot]="{ item }">
            <v-btn
              variant="text"
              icon="mdi-pencil"
              size="small"
              class="mr-2"
              @click="editUser(item)"
            >
            </v-btn>
            <v-btn
              variant="text"
              icon="mdi-delete"
              color="error"
              size="small"
              @click="confirmDelete(item)"
            >
            </v-btn>
          </template>
        </v-data-table>

        <!-- Create/Edit User Dialog -->
        <v-dialog v-model="showCreateDialog" :max-width="640">
          <v-card>
            <v-card-title class="text-h6">{{ formTitle }}</v-card-title>

            <v-card-text>
              <v-form ref="userForm">
              <div class="user-form">
                <v-text-field
                  v-model="editedItem.email"
                  label="Email"
                  type="email"
                  variant="outlined"
                  density="comfortable"
                  required
                />
                <v-text-field
                  v-model="editedItem.password"
                  label="Password"
                  type="password"
                  variant="outlined"
                  density="comfortable"
                  :required="editedIndex === -1"
                  :rules="passwordRules"
                  :hint="passwordHint"
                  persistent-hint
                />
                <v-select
                  v-model="editedItem.role"
                  :items="roles"
                  label="Role"
                  variant="outlined"
                  density="comfortable"
                  required
                />
                <v-autocomplete
                  v-model="editedItem.programIds"
                  :items="programs"
                  item-title="name"
                  item-value="id"
                  label="Assigned Programs"
                  multiple
                  chips
                  closable-chips
                  variant="outlined"
                  density="comfortable"
                  @update:model-value="reconcileRoleAssignments"
                />

                <!-- Per-assignment sync scope override editor (#947). Hidden
                     when the scopedSync feature flag is off, so legacy admins
                     keep the simple programs-only UI. -->
                <div
                  v-if="scopedSyncEnabled && editedItem.programIds.length > 0"
                  class="role-assignments"
                  data-testid="role-assignments-section"
                >
                  <p class="role-assignments__label">Sync scope overrides</p>
                  <p class="role-assignments__hint">
                    By default each assignment inherits the program's sync scope.
                    Override the scope here to narrow what this user receives for a
                    specific program.
                  </p>
                  <div
                    v-for="ra in editedItem.roleAssignments"
                    :key="ra.programId"
                    class="role-assignments__row"
                    :data-testid="`role-assignment-row-${ra.programId}`"
                  >
                    <div class="role-assignments__row-header">
                      <div class="role-assignments__row-meta">
                        <strong>{{ programLabel(ra.programId) }}</strong>
                        <span class="role-assignments__role-chip">
                          {{ ra.role }}<span v-if="ra.areaId"> · {{ ra.areaId }}</span>
                        </span>
                      </div>
                      <div class="role-assignments__row-actions">
                        <v-chip
                          v-if="ra.syncScopeOverride"
                          size="x-small"
                          color="primary"
                          variant="tonal"
                          class="mr-2"
                          :data-testid="`role-assignment-override-active-${ra.programId}`"
                        >
                          Override active
                        </v-chip>
                        <v-btn
                          size="x-small"
                          variant="text"
                          :prepend-icon="
                            expandedOverrides[ra.programId] ? 'mdi-chevron-up' : 'mdi-chevron-down'
                          "
                          :data-testid="`role-assignment-override-toggle-${ra.programId}`"
                          @click="toggleOverride(ra.programId)"
                        >
                          {{ expandedOverrides[ra.programId] ? 'Hide' : 'Override scope' }}
                        </v-btn>
                      </div>
                    </div>

                    <div
                      v-if="expandedOverrides[ra.programId]"
                      class="role-assignments__override-body"
                      :data-testid="`role-assignment-override-body-${ra.programId}`"
                    >
                      <v-alert
                        v-if="overrideErrors[ra.programId]"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mb-3"
                        :data-testid="`role-assignment-override-error-${ra.programId}`"
                      >
                        {{ overrideErrors[ra.programId] }}
                      </v-alert>

                      <SyncScopeForm
                        :model-value="ra.syncScopeOverride ?? null"
                        :test-id-prefix="`role-assignment-override-${ra.programId}`"
                        @update:model-value="(v: SyncScopeOverride | null) => setOverride(ra.programId, v)"
                        @update:error="(e: string | null) => setOverrideError(ra.programId, e)"
                        @update:valid="(v: boolean) => setOverrideValid(ra.programId, v)"
                      />

                      <div class="role-assignments__override-actions">
                        <v-btn
                          v-if="ra.syncScopeOverride"
                          size="small"
                          variant="text"
                          color="error"
                          :data-testid="`role-assignment-override-clear-${ra.programId}`"
                          @click="clearOverride(ra.programId)"
                        >
                          Clear override
                        </v-btn>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              </v-form>
            </v-card-text>

            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="closeDialog">Cancel</v-btn>
              <v-btn color="primary" variant="tonal" @click="saveUser">Save</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Delete Confirmation Dialog -->
        <v-dialog v-model="showDeleteDialog" :max-width="400">
          <v-card>
            <v-card-title class="text-h6">Delete User</v-card-title>
            <v-card-text>
              <p>Are you sure you want to delete user <strong>{{ editedItem.email }}</strong>?</p>
              <p class="mt-2 text-medium-emphasis text-body-2">
                This action cannot be undone.
              </p>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="showDeleteDialog = false">Cancel</v-btn>
              <v-btn color="error" variant="tonal" @click="deleteUser">Delete</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
  </v-container>
</template>

<style scoped>
.users-table {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-card);
}

.user-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.role-assignments {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.08));
  border-radius: var(--radius-md, 8px);
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.role-assignments__label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.7);
  margin: 0;
}

.role-assignments__hint {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0 0 4px;
}

.role-assignments__row {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 6px;
  background: var(--surface, #fff);
  padding: 8px 12px;
}

.role-assignments__row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.role-assignments__row-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.role-assignments__row-actions {
  display: inline-flex;
  align-items: center;
}

.role-assignments__role-chip {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.65);
}

.role-assignments__override-body {
  padding-top: 12px;
}

.role-assignments__override-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
