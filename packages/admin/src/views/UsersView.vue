<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  getUsers as getUsersApi,
  createUser as createUserApi,
  updateUser as updateUserApi,
  deleteUser as deleteUserApi,
  getApps,
} from '@/api'
import type { AppListItem } from '@/api'
import { useSnackBarStore } from '@/stores/snackBar'
import { AxiosError } from 'axios'

interface UserRecord {
  id: string
  email: string
  role: string
  tenantIds?: string[]
  roleAssignments?: Array<{ tenantId: string; role: string; areaId?: string }>
}

const snackBarStore = useSnackBarStore()

// State
const loading = ref(false)
const users = ref<UserRecord[]>([])
const tenants = ref<AppListItem[]>([])
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const editedIndex = ref(-1)

const headers = [
  { title: 'Email', value: 'email' },
  { title: 'Role', value: 'role' },
  { title: 'Tenants', value: 'tenantCount', sortable: false },
  { title: 'Actions', value: 'actions', sortable: false },
]

const itemActionsSlot = 'item.actions'

const roles = ['ADMIN', 'USER']

const granularRoles = [
  { title: 'System Admin', value: 'system-admin' },
  { title: 'Program Admin', value: 'program-admin' },
  { title: 'Supervisor', value: 'supervisor' },
  { title: 'Enumerator', value: 'enumerator' },
  { title: 'Viewer', value: 'viewer' },
]

const defaultItem: UserRecord & { password: string } = {
  id: '',
  email: '',
  password: '',
  role: 'USER',
  tenantIds: [],
  roleAssignments: [],
}

const editedItem = reactive<UserRecord & { password: string }>({
  ...defaultItem,
})

// Computed
const formTitle = computed(() => {
  return editedIndex.value === -1 ? 'Create User' : 'Edit User'
})

const _tenantNames = computed(() => {
  const map: Record<string, string> = {}
  for (const t of tenants.value) {
    map[t.id] = t.name
  }
  return map
})

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

const loadTenants = async () => {
  try {
    const response = await getApps()
    tenants.value = response.data
  } catch (error) {
    console.error('Error fetching tenants:', error)
  }
}

const editUser = (item: UserRecord) => {
  editedIndex.value = users.value.indexOf(item)
  Object.assign(editedItem, {
    ...item,
    password: '',
    tenantIds: item.tenantIds ?? [],
    roleAssignments: item.roleAssignments ?? [],
  })
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
}

const addRoleAssignment = () => {
  if (!editedItem.roleAssignments) {
    editedItem.roleAssignments = []
  }
  editedItem.roleAssignments.push({ tenantId: '', role: 'viewer' })
}

const removeRoleAssignment = (index: number) => {
  editedItem.roleAssignments?.splice(index, 1)
}

const saveUser = async () => {
  const isEditing = editedIndex.value > -1
  try {
    if (editedIndex.value > -1) {
      // Update existing user
      const payload: Parameters<typeof updateUserApi>[0] = {
        id: editedItem.id,
        email: editedItem.email,
        role: editedItem.role,
        tenantIds: editedItem.tenantIds,
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
        tenantIds: editedItem.tenantIds,
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

const getTenantCount = (item: UserRecord): number => {
  return item.tenantIds?.length ?? 0
}

// Lifecycle hooks
onMounted(() => {
  fetchUsers()
  loadTenants()
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
          <template #[`item.tenantCount`]="{ item }">
            <v-chip size="small" variant="tonal">
              {{ getTenantCount(item) }} tenant(s)
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
        <v-dialog v-model="showCreateDialog" :max-width="540">
          <v-card>
            <v-card-title class="text-h6">{{ formTitle }}</v-card-title>

            <v-card-text>
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
                  :hint="editedIndex > -1 ? 'Leave blank to keep current password' : ''"
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
                  v-model="editedItem.tenantIds"
                  :items="tenants"
                  item-title="name"
                  item-value="id"
                  label="Assigned Tenants"
                  multiple
                  chips
                  closable-chips
                  variant="outlined"
                  density="comfortable"
                />

                <!-- Per-tenant role assignments -->
                <div>
                  <div class="d-flex align-center justify-space-between mb-2">
                    <span class="text-subtitle-2">Role Assignments</span>
                    <v-btn
                      size="small"
                      variant="tonal"
                      prepend-icon="mdi-plus"
                      @click="addRoleAssignment"
                    >
                      Add
                    </v-btn>
                  </div>
                  <v-card
                    v-for="(assignment, index) in editedItem.roleAssignments"
                    :key="index"
                    variant="outlined"
                    class="mb-2 pa-3"
                  >
                    <v-row dense align="center">
                      <v-col cols="5">
                        <v-select
                          v-model="assignment.tenantId"
                          :items="tenants"
                          item-title="name"
                          item-value="id"
                          label="Tenant"
                          density="compact"
                          variant="outlined"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="5">
                        <v-select
                          v-model="assignment.role"
                          :items="granularRoles"
                          item-title="title"
                          item-value="value"
                          label="Role"
                          density="compact"
                          variant="outlined"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="2">
                        <v-btn
                          icon="mdi-delete"
                          variant="text"
                          color="error"
                          size="small"
                          @click="removeRoleAssignment(index)"
                        />
                      </v-col>
                    </v-row>
                  </v-card>
                </div>
              </div>
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
</style>
