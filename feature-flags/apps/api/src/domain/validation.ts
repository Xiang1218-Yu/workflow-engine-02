import type { CreateFlagInput, FlagRule, Primitive } from './types.js';

export class ValidationError extends Error {
  statusCode = 400;
}

const isPrimitive = (value: unknown): value is Primitive =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export function validateFlagInput(input: unknown): CreateFlagInput {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Request body must be an object');
  }

  const candidate = input as Record<string, unknown>;
  const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';

  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/.test(key)) {
    throw new ValidationError('key must be 2-64 characters using letters, numbers, dot, underscore, or hyphen');
  }
  if (!name) throw new ValidationError('name is required');
  if (typeof candidate.defaultValue !== 'boolean') {
    throw new ValidationError('defaultValue must be boolean');
  }

  const rawRules = candidate.rules ?? [];
  if (!Array.isArray(rawRules)) throw new ValidationError('rules must be an array');

  const rules = rawRules.map((rawRule, index) => {
    if (!rawRule || typeof rawRule !== 'object') {
      throw new ValidationError(`rules[${index}] must be an object`);
    }
    const rule = rawRule as Record<string, unknown>;
    const type = rule.type;
    const serve = rule.serve;
    if (typeof serve !== 'boolean') throw new ValidationError(`rules[${index}].serve must be boolean`);

    if (type === 'attribute_equals') {
      const attribute = typeof rule.attribute === 'string' ? rule.attribute.trim() : '';
      if (!attribute) throw new ValidationError(`rules[${index}].attribute is required`);
      if (!isPrimitive(rule.value)) throw new ValidationError(`rules[${index}].value must be a string, number, or boolean`);
      return { type, attribute, value: rule.value, serve } as Omit<Extract<FlagRule, { type: 'attribute_equals' }>, 'id'>;
    }

    if (type === 'percentage') {
      if (typeof rule.percentage !== 'number' || !Number.isFinite(rule.percentage) || rule.percentage < 0 || rule.percentage > 100) {
        throw new ValidationError(`rules[${index}].percentage must be between 0 and 100`);
      }
      return { type, percentage: rule.percentage, serve } as Omit<Extract<FlagRule, { type: 'percentage' }>, 'id'>;
    }

    throw new ValidationError(`rules[${index}].type must be attribute_equals or percentage`);
  });

  return {
    key,
    name,
    description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    defaultValue: candidate.defaultValue,
    rules,
  };
}
