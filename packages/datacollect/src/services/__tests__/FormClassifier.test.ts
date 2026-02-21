import { EntityType } from "../../interfaces/types";
import { FormClassifier, FormCategory } from "../FormClassifier";
import type { FormDefinition, FormClassification } from "../FormClassifier";

describe("FormClassifier", () => {
  // Full seed config forms (matches scripts/seed-config.json)
  const fullSeedForms: FormDefinition[] = [
    { name: "household" },
    { name: "cooperative" },
    { name: "individual", dependsOn: "household" },
    { name: "home_visit", dependsOn: "household" },
    { name: "training", dependsOn: "individual" },
    { name: "assistance", dependsOn: "household" },
    { name: "referral", dependsOn: "individual" },
    { name: "life_event", dependsOn: "individual" },
    { name: "assistance_request", dependsOn: "individual" },
    { name: "grievance", dependsOn: "individual" },
  ];

  // Simple two-form config (household + individual only)
  const simpleForms: FormDefinition[] = [
    { name: "household" },
    { name: "individual", dependsOn: "household" },
  ];

  describe("classifyAll", () => {
    test("household (top-level, is target) → Group", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const household = result.get("household")!;

      expect(household.category).toBe(FormCategory.Entity);
      expect(household.entityType).toBe(EntityType.Group);
      expect(household.createEventType).toBe("create-group");
      expect(household.updateEventType).toBe("update-group");
    });

    test("cooperative (top-level, not target) → Group", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const cooperative = result.get("cooperative")!;

      expect(cooperative.category).toBe(FormCategory.Entity);
      expect(cooperative.entityType).toBe(EntityType.Group);
      expect(cooperative.createEventType).toBe("create-group");
      expect(cooperative.updateEventType).toBe("update-group");
    });

    test("individual (dependsOn, is target) → Individual", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const individual = result.get("individual")!;

      expect(individual.category).toBe(FormCategory.Entity);
      expect(individual.entityType).toBe(EntityType.Individual);
      expect(individual.createEventType).toBe("create-individual");
      expect(individual.updateEventType).toBe("update-individual");
    });

    test("home_visit (dependsOn, not target) → Record", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const homeVisit = result.get("home_visit")!;

      expect(homeVisit.category).toBe(FormCategory.Record);
      expect(homeVisit.entityType).toBe(EntityType.Record);
      expect(homeVisit.createEventType).toBe("create-record");
      expect(homeVisit.updateEventType).toBe("update-record");
    });

    test("training (dependsOn, not target) → Record", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const training = result.get("training")!;

      expect(training.category).toBe(FormCategory.Record);
      expect(training.entityType).toBe(EntityType.Record);
      expect(training.createEventType).toBe("create-record");
      expect(training.updateEventType).toBe("update-record");
    });

    test("grievance (dependsOn: individual, not target) → Record", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const grievance = result.get("grievance")!;

      expect(grievance.category).toBe(FormCategory.Record);
      expect(grievance.entityType).toBe(EntityType.Record);
      expect(grievance.createEventType).toBe("create-record");
      expect(grievance.updateEventType).toBe("update-record");
    });

    test("life_event (dependsOn: individual, not target) → Record", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const lifeEvent = result.get("life_event")!;

      expect(lifeEvent.category).toBe(FormCategory.Record);
      expect(lifeEvent.entityType).toBe(EntityType.Record);
      expect(lifeEvent.createEventType).toBe("create-record");
      expect(lifeEvent.updateEventType).toBe("update-record");
    });

    test("assistance_request (dependsOn: individual, not target) → Record", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);
      const assistanceRequest = result.get("assistance_request")!;

      expect(assistanceRequest.category).toBe(FormCategory.Record);
      expect(assistanceRequest.entityType).toBe(EntityType.Record);
      expect(assistanceRequest.createEventType).toBe("create-record");
      expect(assistanceRequest.updateEventType).toBe("update-record");
    });

    test("simple config (household + individual only) → individual stays Individual", () => {
      const result = FormClassifier.classifyAll(simpleForms);

      const household = result.get("household")!;
      expect(household.entityType).toBe(EntityType.Group);

      const individual = result.get("individual")!;
      expect(individual.entityType).toBe(EntityType.Individual);
      expect(individual.createEventType).toBe("create-individual");
      expect(individual.updateEventType).toBe("update-individual");
    });

    test("parentIsGroup correctness", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);

      // individual depends on household (top-level) → parentIsGroup = true
      expect(result.get("individual")!.parentIsGroup).toBe(true);

      // home_visit depends on household (top-level) → parentIsGroup = true
      expect(result.get("home_visit")!.parentIsGroup).toBe(true);

      // training depends on individual (not top-level) → parentIsGroup = false
      expect(result.get("training")!.parentIsGroup).toBe(false);

      // referral depends on individual (not top-level) → parentIsGroup = false
      expect(result.get("referral")!.parentIsGroup).toBe(false);

      // household has no parent → parentIsGroup = false
      expect(result.get("household")!.parentIsGroup).toBe(false);

      // cooperative has no parent → parentIsGroup = false
      expect(result.get("cooperative")!.parentIsGroup).toBe(false);
    });

    test("full seed config scenario classifies all forms correctly", () => {
      const result = FormClassifier.classifyAll(fullSeedForms);

      expect(result.size).toBe(fullSeedForms.length);

      // Groups
      const groups = [...result.values()].filter((c) => c.entityType === EntityType.Group);
      expect(groups.map((g) => g.formName).sort()).toEqual(["cooperative", "household"]);

      // Individuals
      const individuals = [...result.values()].filter((c) => c.entityType === EntityType.Individual);
      expect(individuals.map((i) => i.formName)).toEqual(["individual"]);

      // Records
      const records = [...result.values()].filter((c) => c.entityType === EntityType.Record);
      expect(records.map((r) => r.formName).sort()).toEqual([
        "assistance",
        "assistance_request",
        "grievance",
        "home_visit",
        "life_event",
        "referral",
        "training",
      ]);
    });

    test("empty forms list returns empty map", () => {
      const result = FormClassifier.classifyAll([]);
      expect(result.size).toBe(0);
    });
  });

  describe("classifyForm", () => {
    test("returns classification for known form", () => {
      const result = FormClassifier.classifyForm("individual", fullSeedForms);

      expect(result.formName).toBe("individual");
      expect(result.entityType).toBe(EntityType.Individual);
      expect(result.createEventType).toBe("create-individual");
      expect(result.updateEventType).toBe("update-individual");
    });

    test("unknown form name → safe default (Record)", () => {
      const result = FormClassifier.classifyForm("unknown_form", fullSeedForms);

      expect(result.formName).toBe("unknown_form");
      expect(result.category).toBe(FormCategory.Record);
      expect(result.entityType).toBe(EntityType.Record);
      expect(result.createEventType).toBe("create-record");
      expect(result.updateEventType).toBe("update-record");
      expect(result.parentIsGroup).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("forms with dependsOn pointing to non-existent form are treated correctly", () => {
      const forms: FormDefinition[] = [
        { name: "orphan", dependsOn: "nonexistent" },
      ];
      const result = FormClassifier.classifyAll(forms);
      const orphan = result.get("orphan")!;

      // "nonexistent" is not in the form list, so no mixed hierarchy.
      // "orphan" has dependsOn and is not a target → depends on hasNonTopLevelTargets.
      // Since there are no targets at all, hasNonTopLevelTargets = false,
      // so orphan should be Individual (simple config fallback).
      expect(orphan.entityType).toBe(EntityType.Individual);
    });

    test("single top-level form with no dependents → Group", () => {
      const forms: FormDefinition[] = [{ name: "standalone_group" }];
      const result = FormClassifier.classifyAll(forms);
      const group = result.get("standalone_group")!;

      expect(group.entityType).toBe(EntityType.Group);
      expect(group.createEventType).toBe("create-group");
    });

    test("config with association + member topology", () => {
      const forms: FormDefinition[] = [
        { name: "household" },
        { name: "individual", dependsOn: "household" },
        { name: "association" },
        { name: "member", dependsOn: "association" },
      ];
      const result = FormClassifier.classifyAll(forms);

      expect(result.get("household")!.entityType).toBe(EntityType.Group);
      expect(result.get("association")!.entityType).toBe(EntityType.Group);
      expect(result.get("individual")!.entityType).toBe(EntityType.Individual);
      expect(result.get("member")!.entityType).toBe(EntityType.Individual);
    });

    test("three-level hierarchy classifies each depth correctly", () => {
      // program → household → individual → training
      // This is a plausible real-world config with deeper nesting.
      const forms: FormDefinition[] = [
        { name: "program" },
        { name: "household", dependsOn: "program" },
        { name: "individual", dependsOn: "household" },
        { name: "training", dependsOn: "individual" },
      ];
      const result = FormClassifier.classifyAll(forms);

      // program: top-level → Group
      expect(result.get("program")!.entityType).toBe(EntityType.Group);
      expect(result.get("program")!.createEventType).toBe("create-group");

      // household: dependent, IS a target (individual depends on it) → Individual
      expect(result.get("household")!.entityType).toBe(EntityType.Individual);
      expect(result.get("household")!.createEventType).toBe("create-individual");
      expect(result.get("household")!.parentIsGroup).toBe(true);

      // individual: dependent, IS a target (training depends on it) → Individual
      expect(result.get("individual")!.entityType).toBe(EntityType.Individual);
      expect(result.get("individual")!.createEventType).toBe("create-individual");
      expect(result.get("individual")!.parentIsGroup).toBe(false);

      // training: dependent, NOT a target → Record
      expect(result.get("training")!.entityType).toBe(EntityType.Record);
      expect(result.get("training")!.createEventType).toBe("create-record");
      expect(result.get("training")!.parentIsGroup).toBe(false);
    });

    test("classifyForm with empty forms list returns safe default", () => {
      const result = FormClassifier.classifyForm("anything", []);

      expect(result.formName).toBe("anything");
      expect(result.category).toBe(FormCategory.Record);
      expect(result.entityType).toBe(EntityType.Record);
      expect(result.createEventType).toBe("create-record");
      expect(result.updateEventType).toBe("update-record");
      expect(result.parentIsGroup).toBe(false);
    });
  });
});
