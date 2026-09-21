import { randomUUID } from 'node:crypto';
import type { CreateFlagInput, FeatureFlag, FlagRule } from './types.js';

export class DuplicateFlagError extends Error {
  statusCode = 409;
}

export class MissingFlagError extends Error {
  statusCode = 404;
}

function withRuleIds(rules: CreateFlagInput['rules'] = []): FlagRule[] {
  return rules.map((rule) => ({ ...rule, id: randomUUID() }) as FlagRule);
}

export class InMemoryFlagStore {
  private readonly flags = new Map<string, FeatureFlag>();

  constructor(seed: CreateFlagInput[] = []) {
    seed.forEach((input) => this.create(input));
  }

  list(): FeatureFlag[] {
    return [...this.flags.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  get(key: string): FeatureFlag {
    const flag = this.flags.get(key);
    if (!flag) throw new MissingFlagError(`Flag '${key}' was not found`);
    return flag;
  }

  create(input: CreateFlagInput): FeatureFlag {
    if (this.flags.has(input.key)) throw new DuplicateFlagError(`Flag '${input.key}' already exists`);
    const now = new Date().toISOString();
    const flag: FeatureFlag = {
      ...input,
      description: input.description ?? '',
      rules: withRuleIds(input.rules),
      createdAt: now,
      updatedAt: now,
    };
    this.flags.set(flag.key, flag);
    return flag;
  }

  update(key: string, input: CreateFlagInput): FeatureFlag {
    const existing = this.get(key);
    if (input.key !== key && this.flags.has(input.key)) {
      throw new DuplicateFlagError(`Flag '${input.key}' already exists`);
    }
    const updated: FeatureFlag = {
      ...input,
      description: input.description ?? '',
      rules: withRuleIds(input.rules),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.flags.delete(key);
    this.flags.set(updated.key, updated);
    return updated;
  }

  delete(key: string): void {
    this.get(key);
    this.flags.delete(key);
  }
}
