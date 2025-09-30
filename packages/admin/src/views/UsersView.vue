<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  getUsers as getUsersApi,
  createUser as createUserApi,
  updateUser as updateUserApi,
  deleteUser as deleteUserApi,
} from '@/api'

// State
const loading = ref(false)
const users = ref<{ id: string; email: string; role: string }[]>([])
const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const editedIndex = ref(-1)

const headers = [
  { title: 'Email', value: 'email' },
  { title: 'Role', value: 'role' },
  { title: 'Actions', value: 'actions', sortable: false },
]

const roles = ['ADMIN', 'USER']

const defaultItem = {
  email: '',
  password: '',
  role: 'USER',
}

const editedItem = reactive({
  id: '',
  email: '',
  password: '',
  role: 'USER',
})

// Computed
const formTitle = computed(() => {
  return editedIndex.value === -1 ? 'Create User' : 'Edit User'
})

// Methods
const fetchUsers = async () => {
  loading.value = true
  try {
    const response = await getUsersApi()
    users.value = response
  } catch (error) {
    console.error('Error fetching users:', error)
  } finally {
    loading.value = false
  }
}

const editUser = (item: { id: string; email: string; role: string }) => {
  editedIndex.value = users.value.indexOf(item)
  Object.assign(editedItem, item)
  showCreateDialog.value = true
}

const confirmDelete = (item: { id: string; email: string; role: string }) => {
  editedIndex.value = users.value.indexOf(item)
  Object.assign(editedItem, item)
  showDeleteDialog.value = true
}

const deleteUser = async () => {
  try {
    await deleteUserApi(editedItem.id)
    users.value.splice(editedIndex.value, 1)
    showDeleteDialog.value = false
  } catch (error) {
    console.error('Error deleting user:', error)
  }
}

const closeDialog = () => {
  showCreateDialog.value = false
  Object.assign(editedItem, defaultItem)
  editedIndex.value = -1
}

const saveUser = async () => {
  try {
    if (editedIndex.value > -1) {
      // Update existing user
      console.log('updateUserApi', editedItem)
      await updateUserApi(editedItem)
      Object.assign(users.value[editedIndex.value], editedItem)
    } else {
      // Create new user
      await createUserApi(editedItem)
      users.value.push({ ...editedItem })
    }
    closeDialog()
  } catch (error) {
    console.error('Error saving user:', error)
  }
}

// Lifecycle hooks
onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4 mb-4">User Management</h1>

        <!-- Create User Button -->
        <v-btn color="primary" class="mb-4" @click="showCreateDialog = true"> Create User </v-btn>

        <!-- Users Table -->
        <v-data-table :headers="headers" :items="users" :loading="loading" class="elevation-1">
          <template #item.actions="{ item }">
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
        <v-dialog v-model="showCreateDialog" max-width="500px">
          <v-card>
            <v-card-title>
              <span class="text-h5">{{ formTitle }}</span>
            </v-card-title>

            <v-card-text>
              <v-container>
                <v-row>
                  <v-col cols="12">
                    <v-text-field
                      v-model="editedItem.email"
                      label="Email"
                      type="email"
                      required
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12">
                    <v-text-field
                      v-model="editedItem.password"
                      label="Password"
                      type="password"
                      required
                    ></v-text-field>
                  </v-col>
                  <v-col cols="12">
                    <v-select
                      v-model="editedItem.role"
                      :items="roles"
                      label="Role"
                      required
                    ></v-select>
                  </v-col>
                </v-row>
              </v-container>
            </v-card-text>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="error" text @click="closeDialog">Cancel</v-btn>
              <v-btn color="primary" text @click="saveUser">Save</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Delete Confirmation Dialog -->
        <v-dialog v-model="showDeleteDialog" max-width="400px">
          <v-card>
            <v-card-title class="text-h5">Delete User</v-card-title>
            <v-card-text>
              Are you sure you want to delete user {{ editedItem.email }}?
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="primary" text @click="showDeleteDialog = false">Cancel</v-btn>
              <v-btn color="error" text @click="deleteUser">Delete</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.v-data-table {
  margin-top: 1rem;
}
</style>
