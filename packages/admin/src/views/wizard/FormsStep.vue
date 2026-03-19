<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramDraftStore, type EntityForm } from '@/stores/programDraft'
import { parseOpenSppProgramSpecification } from '@/utils/openSppImport'
import { useSnackBarStore } from '@/stores/snackBar'

const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const entityForms = computed(() => draftStore.draft.entityForms)
const hasCircularDep = computed(() => draftStore.checkCircularDependencies())

const addForm = () => {
  draftStore.addEntityForm()
}

const removeForm = (index: number) => {
  draftStore.removeEntityForm(index)
}

const editFormDesign = (index: number) => {
  router.push({ name: 'wizard-form-design', params: { formIndex: index.toString() } })
}

const getFormStatus = (form: { name: string; title: string; formio: unknown }) => {
  if (!form.name || !form.title) return 'incomplete'
  if (!form.formio) return 'needs-design'
  return 'complete'
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'complete':
      return 'success'
    case 'needs-design':
      return 'warning'
    default:
      return 'grey'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'complete':
      return 'Ready'
    case 'needs-design':
      return 'Needs Form Design'
    default:
      return 'Incomplete'
  }
}

const getDependsOnOptions = (form: EntityForm) => {
  return draftStore.getDependsOnOptions(form)
}

const isOpenSppSync = computed(() => {
  const type = draftStore.draft.externalSync?.type
  return (
    type === 'openspp-adapter' ||
    type === 'openspp-v1-adapter' ||
    type === 'openspp-v2-adapter' ||
    type === 'openspp'
  )
})

const specImportFiles = ref<File[] | null>(null)
const isImportingSpec = ref(false)

const onSpecFileSelection = async (value: File[] | File | null) => {
  if (!value || isImportingSpec.value) {
    specImportFiles.value = null
    return
  }
  const file = Array.isArray(value) ? value[0] : value
  if (!file) {
    specImportFiles.value = null
    return
  }

  try {
    isImportingSpec.value = true
    const yamlText = await file.text()
    const importResult = parseOpenSppProgramSpecification(yamlText)
    draftStore.importFromOpenSppSpec(importResult)
    snackBarStore.showSnackbar(
      `Imported ${importResult.entityForms.length} entity form${
        importResult.entityForms.length === 1 ? '' : 's'
      } from OpenSPP spec`,
      'success',
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    snackBarStore.showSnackbar(`Failed to import OpenSPP spec: ${message}`, 'red')
  } finally {
    specImportFiles.value = null
    isImportingSpec.value = false
  }
}
</script>

<template>
  <div class="forms-step">
    <p class="step-description">
      Define the entity forms that will be used to collect data. Each form represents a type of
      entity (e.g., Household, Individual) and can depend on other forms.
    </p>

    <!-- OpenSPP YAML Import -->
    <v-card v-if="isOpenSppSync" variant="tonal" color="secondary" class="mb-4 pa-4">
      <div class="d-flex align-center gap-3">
        <v-icon icon="mdi-file-code" />
        <div class="flex-grow-1">
          <div class="text-body-2 font-weight-medium">Import from OpenSPP YAML</div>
          <div class="text-caption text-medium-emphasis">
            Upload a program specification to auto-generate entity forms.
          </div>
        </div>
        <v-file-input
          v-model="specImportFiles"
          accept=".yaml,.yml"
          label="Choose YAML file"
          variant="outlined"
          density="compact"
          hide-details
          class="yaml-import-input"
          :loading="isImportingSpec"
          :disabled="isImportingSpec"
          @update:modelValue="onSpecFileSelection"
        />
      </div>
    </v-card>

    <!-- Error Alert -->
    <v-alert
      v-if="draftStore.errors.forms.global"
      type="error"
      variant="tonal"
      class="mb-4"
      density="compact"
    >
      {{ draftStore.errors.forms.global }}
    </v-alert>

    <v-alert
      v-if="hasCircularDep"
      type="error"
      variant="tonal"
      class="mb-4"
      density="compact"
    >
      Circular dependency detected in form relationships. Please review the "Depends On" settings.
    </v-alert>

    <!-- Empty State -->
    <div v-if="entityForms.length === 0" class="empty-state">
      <v-icon icon="mdi-form-select" size="64" color="grey-lighten-1" />
      <h3>No Entity Forms</h3>
      <p>Add your first entity form to start defining your data collection structure.</p>
      <v-btn color="primary" size="large" @click="addForm">
        <v-icon start icon="mdi-plus" />
        Add Entity Form
      </v-btn>
    </div>

    <!-- Forms List -->
    <div v-else class="forms-list">
      <v-card
        v-for="(form, index) in entityForms"
        :key="index"
        class="form-card"
        variant="outlined"
      >
        <div class="form-card__header">
          <div class="form-card__number">{{ index + 1 }}</div>
          <div class="form-card__info">
            <div class="form-card__title">
              {{ form.title || form.name || 'Untitled Form' }}
            </div>
            <v-chip
              :color="getStatusColor(getFormStatus(form))"
              size="x-small"
              variant="flat"
            >
              {{ getStatusText(getFormStatus(form)) }}
            </v-chip>
          </div>
          <v-btn
            icon="mdi-delete"
            variant="text"
            color="error"
            size="small"
            @click="removeForm(index)"
          />
        </div>

        <v-divider />

        <div class="form-card__body">
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.name"
                label="Entity Name (ID)"
                placeholder="e.g., household"
                variant="outlined"
                density="compact"
                :error-messages="draftStore.errors.forms.items[form.name]?.name"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.title"
                label="Display Title"
                placeholder="e.g., Household Registration"
                variant="outlined"
                density="compact"
                :error-messages="draftStore.errors.forms.items[form.name]?.title"
              />
            </v-col>
            <v-col v-if="getDependsOnOptions(form).length > 0" cols="12" sm="6">
              <v-select
                v-model="form.dependsOn"
                :items="getDependsOnOptions(form)"
                item-title="title"
                item-value="name"
                label="Depends On (Optional)"
                placeholder="Select parent entity"
                hint="If this entity belongs to another (e.g., Individual → Household), select the parent."
                persistent-hint
                variant="outlined"
                density="compact"
                clearable
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.entityType"
                :items="[
                  { title: '(Auto - infer from topology)', value: '' },
                  { title: 'Group', value: 'group' },
                  { title: 'Individual', value: 'individual' },
                  { title: 'Record', value: 'record' },
                ]"
                item-title="title"
                item-value="value"
                label="Entity Type (Optional)"
                placeholder="Auto"
                hint="Override the entity type. Use 'Individual' for standalone individuals without a parent group."
                persistent-hint
                variant="outlined"
                density="compact"
              />
              <v-alert
                v-if="form.entityType === 'group' && form.dependsOn"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2"
              >
                A dependent form set as "Group" is unusual. Groups are typically top-level entities.
              </v-alert>
            </v-col>
          </v-row>

          <div class="form-card__actions">
            <v-btn
              :color="form.formio ? 'success' : 'primary'"
              :variant="form.formio ? 'tonal' : 'flat'"
              @click="editFormDesign(index)"
            >
              <v-icon start :icon="form.formio ? 'mdi-pencil' : 'mdi-plus'" />
              {{ form.formio ? 'Edit Form Design' : 'Design Form' }}
            </v-btn>
            <span v-if="draftStore.errors.forms.items[form.name]?.formio" class="error-text">
              {{ draftStore.errors.forms.items[form.name]?.formio }}
            </span>
          </div>
        </div>
      </v-card>

      <v-btn color="primary" variant="tonal" class="add-form-btn" @click="addForm">
        <v-icon start icon="mdi-plus" />
        Add Another Form
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.forms-step {
  max-width: 900px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-lg);
  line-height: var(--line-height-relaxed);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  background: var(--neutral-50);
  border-radius: var(--radius-lg);
}

.empty-state h3 {
  margin: var(--spacing-md) 0 var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-main);
}

.empty-state p {
  color: var(--text-muted);
  margin-bottom: var(--spacing-lg);
}

.forms-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-card {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.form-card__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--neutral-50);
}

.form-card__number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.form-card__info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.form-card__title {
  font-weight: 500;
  color: var(--text-main);
}

.form-card__body {
  padding: var(--spacing-md);
}

.form-card__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-light);
}

.error-text {
  color: var(--status-danger);
  font-size: var(--font-size-xs);
}

.add-form-btn {
  align-self: flex-start;
}

.yaml-import-input {
  max-width: 260px;
  flex-shrink: 0;
}
</style>
