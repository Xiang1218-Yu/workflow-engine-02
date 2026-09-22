import type { ConditionOperator, WorkflowStep } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VARIABLE_NAME = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/;
const MAX_DELAY_MS = 60_000;

export const CONDITION_OPERATORS: ConditionOperator[] = [
  "string-eq",
  "string-neq",
  "number-eq",
  "number-neq",
  "number-gt",
  "number-gte",
  "number-lt",
  "number-lte",
  "var-missing"
];

const NUMBER_OPERATORS: ConditionOperator[] = [
  "number-eq",
  "number-neq",
  "number-gt",
  "number-gte",
  "number-lt",
  "number-lte"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a workflow definition. Returns every problem found so the editor can
 * present them before saving; rejected runs therefore never start and cannot
 * get stuck in "running".
 *
 * `where` labels the location, e.g. "Step 2" or "Step 3 branch 1".
 */
export function validateWorkflowSteps(steps: unknown): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(steps)) return { valid: false, errors: ["Workflow steps must be a non-empty array."] };
  if (steps.length === 0) errors.push("Workflow steps must be a non-empty array.");

  const seenIds = new Set<string>();

  function checkLeaf(step: unknown, where: string): void {
    if (!isRecord(step)) {
      errors.push(`${where}: expected a step object.`);
      return;
    }
    const candidate = step as Record<string, unknown>;
    if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
      errors.push(`${where}: missing unique step id.`);
    } else if (seenIds.has(candidate.id)) {
      errors.push(`${where}: duplicate step id “${candidate.id}”. Each step id must be unique.`);
    } else {
      seenIds.add(candidate.id);
    }

    if (candidate.type === "log") {
      if (typeof candidate.message !== "string" || candidate.message.length === 0) {
        errors.push(`${where} (log): message is required.`);
      }
      return;
    }
    if (candidate.type === "set") {
      if (typeof candidate.key !== "string" || candidate.key.trim().length === 0) {
        errors.push(`${where} (set): variable name is required.`);
      }
      if (typeof candidate.value !== "string") {
        errors.push(`${where} (set): value must be a string.`);
      }
      return;
    }
    if (candidate.type === "delay") {
      const duration = Number(candidate.durationMs);
      if (!Number.isFinite(duration) || duration < 0 || duration > MAX_DELAY_MS) {
        errors.push(`${where} (delay): duration must be a number between 0 and ${MAX_DELAY_MS}.`);
      }
      return;
    }
    errors.push(`${where}: unsupported step type “${String(candidate.type)}” (expected log, set or delay).`);
  }

  function checkBranchSteps(branchSteps: unknown, where: string): void {
    if (!Array.isArray(branchSteps) || branchSteps.length === 0) {
      errors.push(`${where}: branch must contain at least one log, set or delay step (empty branches are not allowed).`);
      return;
    }
    branchSteps.forEach((branchStep, branchIndex) => {
      if (isRecord(branchStep) && branchStep.type === "condition") {
        errors.push(`${where} step ${branchIndex + 1}: conditions cannot be nested; branches may only contain log, set or delay steps.`);
        return;
      }
      checkLeaf(branchStep, `${where} step ${branchIndex + 1}`);
    });
  }

  function checkCondition(step: Record<string, unknown>, where: string): void {
    const branches = step.branches;
    if (!Array.isArray(branches) || branches.length === 0) {
      errors.push(`${where} (condition): at least one branch is required.`);
      return;
    }
    branches.forEach((rawBranch, branchIndex) => {
      const branchWhere = `${where} branch ${branchIndex + 1}`;
      if (!isRecord(rawBranch)) {
        errors.push(`${branchWhere}: expected a branch object.`);
        return;
      }
      const branch = rawBranch as Record<string, unknown>;
      const operator = branch.operator;
      if (typeof operator !== "string" || !CONDITION_OPERATORS.includes(operator as ConditionOperator)) {
        errors.push(`${branchWhere}: unknown or missing operator “${String(operator)}”.`);
      }
      if (typeof branch.variable !== "string" || !VARIABLE_NAME.test(branch.variable.trim())) {
        errors.push(`${branchWhere}: variable must be a name like “count” or “user.name” without {{ }} wrappers.`);
      }
      if (operator !== "var-missing") {
        if (typeof branch.value !== "string" || branch.value.trim().length === 0) {
          errors.push(`${branchWhere}: comparison value is required (use {{variable}} to compare against another variable).`);
        } else if (NUMBER_OPERATORS.includes(operator as ConditionOperator) && !branch.value.includes("{{")) {
          if (!Number.isFinite(Number(branch.value.trim()))) {
            errors.push(`${branchWhere}: numeric comparison value “${branch.value}” is not a valid number.`);
          }
        }
      }
      checkBranchSteps(branch.steps, branchWhere);
    });
  }

  steps.forEach((step, index) => {
    const where = `Step ${index + 1}`;
    if (!isRecord(step)) {
      errors.push(`${where}: expected a step object.`);
      return;
    }
    if (step.type === "condition") {
      if (typeof step.id !== "string" || step.id.trim().length === 0) {
        errors.push(`${where}: missing unique step id.`);
      } else if (seenIds.has(step.id)) {
        errors.push(`${where}: duplicate step id “${step.id}”. Each step id must be unique.`);
      } else {
        seenIds.add(step.id);
      }
      checkCondition(step, where);
      return;
    }
    checkLeaf(step, where);
  });

  return { valid: errors.length === 0, errors };
}

/** Compatibility predicate for callers that only need a boolean. */
export function isValidWorkflowSteps(steps: unknown): steps is WorkflowStep[] {
  return validateWorkflowSteps(steps).valid;
}
