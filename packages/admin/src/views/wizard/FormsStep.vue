<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'

const router = useRouter()
const draftStore = useProgramDraftStore()

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

const getDependsOnOptions = (form: { name: string; title: string; dependsOn: string; formio: unknown }) => {
  return draftStore.getDependsOnOptions(form)
}
</script>

<template>
  <div class="forms-step">
    <p class="step-description">
      Define the entity forms that will be used to collect data. Each form represents a type of
      entity (e.g., Household, Individual) and can depend on other forms.
    </p>

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
              <label class="field-label">Entity Name (ID)</label>
              <v-text-field
                v-model="form.name"
                placeholder="e.g., household"
                variant="outlined"
                density="compact"
                :error-messages="draftStore.errors.forms.items[form.name]?.name"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="field-label">Display Title</label>
              <v-text-field
                v-model="form.title"
                placeholder="e.g., Household Registration"
                variant="outlined"
                density="compact"
                :error-messages="draftStore.errors.forms.items[form.name]?.title"
              />
            </v-col>
            <v-col v-if="getDependsOnOptions(form).length > 0" cols="12">
              <label class="field-label">Depends On (Optional)</label>
              <v-select
                v-model="form.dependsOn"
                :items="getDependsOnOptions(form)"
                item-title="title"
                item-value="name"
                placeholder="Select parent entity"
                variant="outlined"
                density="compact"
                clearable
              />
              <p class="field-hint">
                If this entity belongs to another entity (e.g., Individual belongs to Household),
                select the parent here.
              </p>
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
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 24px;
  line-height: 1.6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

.empty-state h3 {
  margin: 16px 0 8px;
  font-size: 1.125rem;
  font-weight: 600;
}

.empty-state p {
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 24px;
}

.forms-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-card {
  border-radius: 12px;
  overflow: hidden;
}

.form-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.02);
}

.form-card__number {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--v-theme-primary));
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
}

.form-card__info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-card__title {
  font-weight: 500;
}

.form-card__body {
  padding: 16px;
}

.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 4px;
}

.field-hint {
  font-size: 0.7rem;
  color: rgba(0, 0, 0, 0.5);
  margin: -8px 0 0;
}

.form-card__actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}

.error-text {
  color: rgb(var(--v-theme-error));
  font-size: 0.75rem;
}

.add-form-btn {
  align-self: flex-start;
}
</style>
