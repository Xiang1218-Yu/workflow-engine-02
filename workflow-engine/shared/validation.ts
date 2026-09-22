import type { ConditionOperator, WorkflowStep } from "./types.js";

export const MAX_BRANCH_DEPTH = 20;

export interface ValidationResult {
  valid: boolean;
  /** Human-readable problems, one per line. Empty when valid. */
  errors: string[];
}

const NUMERIC_OPERATORS: ConditionOperator[] = ["gt", "gte", "lt", "lte"];
const COMPARISON_OPERATORS: ConditionOperator[] = ["eq", "ne", ...NUMERIC_OPERATORS];
const VALID_OPERATORS: ConditionOperator[] = [...COMPARISON_OPERATORS, "notExists"];
const VARIABLE_PATTERN = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/;

/** Returns the variable name when `operand` is a single `{{variable}}`, otherwise null. */
export function singleTemplateVariable(operand: string): string | null {
  const match = /^\s*{{\s*([\w.-]+)\s*}}\s*$/.exec(operand);
  return match ? match[1] : null;
}

/**
 * Reports malformed `{{...}}` expressions: stray closing braces, unclosed
 * openings, and empty/non-identifier placeholders. Well-formed placeholders
 * are returned so callers can perform extra checks.
 */
function findTemplateErrors(value: string, location: string, errors: string[]): void {
  let cursor = 0;
  let depth = 0;
  while (cursor < value.length) {
    const open = value.indexOf("{{", cursor);
    const close = value.indexOf("}}", cursor);
    if (close !== -1 && (open === -1 || close < open)) {
      errors.push(`${location}: contains “}}” without a matching “{{”.`);
      cursor = close + 2;
      continue;
    }
    if (open !== -1) {
      depth += 1;
      const nextClose = value.indexOf("}}", open + 2);
      if (nextClose === -1) {
        errors.push(`${location}: unclosed variable expression — every “{{” needs a matching “}}”.`);
        return;
      }
      const inner = value.slice(open + 2, nextClose).trim();
      if (inner.length === 0) {
        errors.push(`${location}: empty variable expression “{{}}” is not allowed.`);
      } else if (!VARIABLE_PATTERN.test(inner)) {
        errors.push(`${location}: “{{${inner}}}” is not a valid variable name (use letters, digits, “_”, or dotted paths).`);
      }
      cursor = nextClose + 2;
      depth -= 1;
      continue;
    }
    break;
  }
  if (depth > 0) {
    errors.push(`${location}: unclosed variable expression — every “{{” needs a matching “}}”.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStringField(candidate: Record<string, unknown>, field: string, location: string, errors: string[]): string | null {
  const value = candidate[field];
  if (typeof value !== "string") {
    errors.push(`${location}: “${field}” must be a string.`);
    return null;
  }
  if (value.trim().length === 0) {
    errors.push(`${location}: “${field}” cannot be empty.`);
    return null;
  }
  findTemplateErrors(value, `${location} field “${field}”`, errors);
  return value;
}

function validateOperand(operand: unknown, side: "left" | "right", operator: ConditionOperator, location: string, errors: string[]): void {
  if (typeof operand !== "string" || operand.trim().length === 0) {
    errors.push(`${location}: condition ${side} operand cannot be empty.`);
    return;
  }
  const trimmed = operand.trim();

  if (operator === "notExists") {
    if (singleTemplateVariable(trimmed) === null) {
      errors.push(`${location}: “notExists” needs a single variable reference on the left, e.g. “{{token}}”.`);
    }
    return;
  }

  findTemplateErrors(operand, `${location} condition ${side} operand`, errors);

  if (NUMERIC_OPERATORS.includes(operator)) {
    const variable = singleTemplateVariable(trimmed);
    if (variable === null && !Number.isFinite(Number(trimmed))) {
      errors.push(
        `${location}: condition ${side} operand “${trimmed}” is not a number; operator “${operator}” only accepts numbers or a single {{variable}}.`
      );
    }
  }
}

function validateStepList(
  steps: unknown,
  location: string,
  errors: string[],
  seenIds: Map<string, string>,
  ancestors: Set<WorkflowStep>,
  depth: number
): void {
  if (!Array.isArray(steps)) {
    errors.push(`${location}: expected a list of steps.`);
    return;
  }
  if (steps.length === 0) {
    errors.push(`${location === "Workflow" ? "Workflow" : location}: step list cannot be empty.`);
    return;
  }

  steps.forEach((rawStep, index) => {
    const stepLocation = `${location} → step ${index + 1}`;
    if (!isRecord(rawStep)) {
      errors.push(`${stepLocation}: must be a step object.`);
      return;
    }

    const id = rawStep.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      errors.push(`${stepLocation}: missing unique “id”.`);
    } else if (seenIds.has(id)) {
      errors.push(`${stepLocation}: duplicate step id “${id}” (already used at ${seenIds.get(id)}).`);
    } else {
      seenIds.set(id, stepLocation);
    }

    const type = rawStep.type;

    if (type === "log") {
      validateStringField(rawStep, "message", stepLocation, errors);
      return;
    }

    if (type === "set") {
      const key = validateStringField(rawStep, "key", stepLocation, errors);
      if (typeof rawStep.value !== "string") {
        errors.push(`${stepLocation}: “value” must be a string.`);
      } else {
        findTemplateErrors(rawStep.value, `${stepLocation} field “value”`, errors);
      }
      if (key !== null && !/^[A-Za-z_][\w.-]*$/.test(key.trim())) {
        errors.push(`${stepLocation}: variable key “${key}” must start with a letter or “_” and contain only letters, digits, “_”, or dots.`);
      }
      return;
    }

    if (type === "delay") {
      const duration = rawStep.durationMs;
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > 60_000) {
        errors.push(`${stepLocation}: “durationMs” must be a number between 0 and 60000.`);
      }
      return;
    }

    if (type === "branch") {
      const branchLocation = `${stepLocation} (branch)`;
      const condition = rawStep.condition;
      if (!isRecord(condition)) {
        errors.push(`${branchLocation}: missing “condition” object.`);
        return;
      }
      const operator = condition.operator;
      if (typeof operator !== "string" || !VALID_OPERATORS.includes(operator as ConditionOperator)) {
        errors.push(`${branchLocation}: operator must be one of ${VALID_OPERATORS.map((value) => `“${value}”`).join(", ")}.`);
      } else {
        validateOperand(condition.left, "left", operator as ConditionOperator, branchLocation, errors);
        if (operator === "notExists") {
          if (condition.right !== undefined && condition.right !== "") {
            errors.push(`${branchLocation}: “notExists” takes no right operand; leave it empty.`);
          }
        } else {
          validateOperand(condition.right, "right", operator as ConditionOperator, branchLocation, errors);
        }
      }

      const branch = rawStep as unknown as WorkflowStep;
      if (ancestors.has(branch)) {
        errors.push(`${branchLocation}: circular nesting detected — a branch cannot contain itself.`);
        return;
      }
      if (depth + 1 > MAX_BRANCH_DEPTH) {
        errors.push(`${branchLocation}: branches are nested more than ${MAX_BRANCH_DEPTH} levels deep; flatten the workflow.`);
        return;
      }

      if (!Array.isArray(rawStep.then) || rawStep.then.length === 0) {
        errors.push(`${branchLocation}: the “then” path needs at least one step; empty branches are not allowed.`);
      }
      if (rawStep.else !== undefined && (!Array.isArray(rawStep.else) || rawStep.else.length === 0)) {
        errors.push(`${branchLocation}: the “else” path cannot be empty — add a step or remove the path.`);
      }

      const nextAncestors = new Set(ancestors).add(branch);
      if (Array.isArray(rawStep.then) && rawStep.then.length > 0) {
        validateStepList(rawStep.then, `${branchLocation} → then`, errors, seenIds, nextAncestors, depth + 1);
      }
      if (Array.isArray(rawStep.else) && rawStep.else.length > 0) {
        validateStepList(rawStep.else, `${branchLocation} → else`, errors, seenIds, nextAncestors, depth + 1);
      }
      return;
    }

    errors.push(`${stepLocation}: unknown step type “${String(type)}” (expected log, set, delay, or branch).`);
  });
}

/**
 * Validates a workflow definition before it is saved. All problems are
 * collected so the editor can show them together instead of failing one at a
 * time at runtime.
 */
export function validateWorkflowSteps(steps: unknown): ValidationResult {
  const errors: string[] = [];
  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push("Workflow: add at least one step before saving.");
    return { valid: false, errors };
  }
  validateStepList(steps, "Workflow", errors, new Map(), new Set(), 0);
  return { valid: errors.length === 0, errors };
}

/** Backwards-compatible boolean guard used by earlier server code. */
export function validateSteps(steps: unknown): steps is WorkflowStep[] {
  return validateWorkflowSteps(steps).valid;
}
