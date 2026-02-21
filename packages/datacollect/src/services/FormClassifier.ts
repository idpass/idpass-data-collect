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

import { EntityType } from "../interfaces/types";

/**
 * Categories of forms in the DataCollect system.
 *
 * - Entity: defines or updates an entity (group or individual)
 * - Record: an activity record linked to an entity (home_visit, training, etc.)
 */
export enum FormCategory {
  Entity = "entity",
  Record = "record",
}

/**
 * Minimal form definition needed for classification.
 * Consumers pass their form config arrays through this interface.
 */
export interface FormDefinition {
  name: string;
  dependsOn?: string;
  entityType?: "group" | "individual" | "record";
}

/**
 * Classification result for a single form, providing the category,
 * entity type, and the correct event type strings for create/update operations.
 */
export interface FormClassification {
  formName: string;
  category: FormCategory;
  entityType: EntityType;
  createEventType: string;
  updateEventType: string;
  /** True when the parent form (dependsOn target) is a top-level group form. */
  parentIsGroup: boolean;
}

/**
 * Classifies forms into entity types based on the dependsOn topology.
 *
 * The algorithm mirrors the proven logic from AppInstanceStore.loadEntityData:
 * 1. Top-level forms (no dependsOn) → Group
 * 2. Dependent forms that are themselves dependsOn targets → Individual
 * 3. Dependent forms that are NOT targets (in a mixed hierarchy) → Record
 *
 * In simple configs where no non-top-level form is a target (e.g., household → individual),
 * all dependent forms stay as Individual (no Record classification).
 */
export class FormClassifier {
  /**
   * Classify all forms and return a Map keyed by form name.
   */
  static classifyAll(forms: FormDefinition[]): Map<string, FormClassification> {
    const result = new Map<string, FormClassification>();
    if (forms.length === 0) return result;

    // Build lookup: form name → definition
    const formLookup = new Map<string, FormDefinition>();
    for (const form of forms) {
      formLookup.set(form.name, form);
    }

    const isTopLevel = (formName: string) => !formLookup.get(formName)?.dependsOn;

    // Determine whether a form resolves to a group. When an entityType override
    // is present, use it directly; otherwise fall back to the topology rule
    // (top-level = group).
    const resolvesToGroup = (formName: string): boolean => {
      const form = formLookup.get(formName);
      if (!form) return false;
      if (form.entityType) return form.entityType === "group";
      return isTopLevel(formName);
    };

    // Build set of form names referenced as dependsOn targets by other forms.
    const dependsOnTargets = new Set<string>();
    for (const form of forms) {
      if (form.dependsOn) {
        dependsOnTargets.add(form.dependsOn);
      }
    }

    // Only classify non-target forms as records when the config has a mixed
    // hierarchy — i.e., at least one non-top-level form IS a dependsOn target.
    // In simple configs (household → individual only), there are no non-top-level
    // targets, so every dependent form stays as Individual.
    const hasNonTopLevelTargets = [...dependsOnTargets].some((t) => !isTopLevel(t));

    for (const form of forms) {
      const parentFormName = form.dependsOn;
      const parentIsGroup = parentFormName ? resolvesToGroup(parentFormName) : false;

      // When entityType is explicitly set in the config, use it directly
      // instead of inferring from topology.
      if (form.entityType) {
        const category = form.entityType === "record" ? FormCategory.Record : FormCategory.Entity;
        result.set(form.name, {
          formName: form.name,
          category,
          entityType: form.entityType as EntityType,
          createEventType: `create-${form.entityType}`,
          updateEventType: `update-${form.entityType}`,
          parentIsGroup,
        });
        continue;
      }

      if (!form.dependsOn) {
        // Top-level form → Group
        result.set(form.name, {
          formName: form.name,
          category: FormCategory.Entity,
          entityType: EntityType.Group,
          createEventType: "create-group",
          updateEventType: "update-group",
          parentIsGroup: false,
        });
      } else {
        // Has dependsOn — check if it's an entity-defining form or a record form
        const isEntityForm = !hasNonTopLevelTargets || dependsOnTargets.has(form.name);

        if (isEntityForm) {
          // Individual entity
          result.set(form.name, {
            formName: form.name,
            category: FormCategory.Entity,
            entityType: EntityType.Individual,
            createEventType: "create-individual",
            updateEventType: "update-individual",
            parentIsGroup,
          });
        } else {
          // Record form
          result.set(form.name, {
            formName: form.name,
            category: FormCategory.Record,
            entityType: EntityType.Record,
            createEventType: "create-record",
            updateEventType: "update-record",
            parentIsGroup,
          });
        }
      }
    }

    return result;
  }

  /**
   * Classify a single form by name within the context of all forms.
   * Returns a safe default (Record) for unknown form names.
   */
  static classifyForm(formName: string, forms: FormDefinition[]): FormClassification {
    const all = FormClassifier.classifyAll(forms);
    const classification = all.get(formName);
    if (classification) return classification;

    // Safe default for unknown forms: treat as Record
    return {
      formName,
      category: FormCategory.Record,
      entityType: EntityType.Record,
      createEventType: "create-record",
      updateEventType: "update-record",
      parentIsGroup: false,
    };
  }
}
