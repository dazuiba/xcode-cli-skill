export type ParsedTestSpecifier = {
  source: string;
  targetName?: string;
  testIdentifier: string;
};

export function parseTestSpecifier(input: string, defaultTargetName?: string): ParsedTestSpecifier {
  const value = input.trim();
  if (!value) {
    throw new Error(
      `Invalid test specifier '${input}'. Expected formats: Target::Class/test(), Target/Class/test(), Class#test`,
    );
  }

  const explicit = parseExplicitTargetAndIdentifier(value);
  if (explicit) {
    return {
      source: input,
      targetName: explicit.targetName,
      testIdentifier: explicit.testIdentifier,
    };
  }

  const hashIdentifier = parseHashIdentifier(value);
  if (hashIdentifier) {
    return {
      source: input,
      targetName: normalizeTarget(defaultTargetName),
      testIdentifier: hashIdentifier,
    };
  }

  if (value.includes('/')) {
    const slashCount = countCharacter(value, '/');
    if (slashCount >= 2) {
      const firstSlash = value.indexOf('/');
      const targetName = value.slice(0, firstSlash).trim();
      const testIdentifier = value.slice(firstSlash + 1).trim();
      if (!targetName || !testIdentifier) {
        throw new Error(
          `Invalid test specifier '${input}'. Expected formats: Target::Class/test(), Target/Class/test()`,
        );
      }
      return {
        source: input,
        targetName,
        testIdentifier,
      };
    }

    const firstSlash = value.indexOf('/');
    if (firstSlash <= 0 || firstSlash >= value.length - 1) {
      throw new Error(
        `Invalid test specifier '${input}'. Expected formats: Target::Class/test(), Target/Class/test(), Class#test`,
      );
    }

    return {
      source: input,
      targetName: normalizeTarget(defaultTargetName),
      testIdentifier: value,
    };
  }

  throw new Error(
    `Invalid test specifier '${input}'. Expected formats: Target::Class/test(), Target/Class/test(), Class#test`,
  );
}

function parseExplicitTargetAndIdentifier(
  value: string,
): { targetName: string; testIdentifier: string } | undefined {
  const separator = value.indexOf('::');
  if (separator <= 0) {
    return undefined;
  }
  const targetName = value.slice(0, separator).trim();
  const identifierRaw = value.slice(separator + 2).trim();
  if (!targetName || !identifierRaw) {
    return undefined;
  }
  return {
    targetName,
    testIdentifier: parseHashIdentifier(identifierRaw) ?? identifierRaw,
  };
}

function parseHashIdentifier(value: string): string | undefined {
  const separator = value.indexOf('#');
  if (separator <= 0 || separator >= value.length - 1) {
    return undefined;
  }
  const suiteName = value.slice(0, separator).trim();
  const methodName = value.slice(separator + 1).trim();
  if (!suiteName || !methodName) {
    return undefined;
  }
  const normalizedMethod = methodName.endsWith('()') ? methodName : `${methodName}()`;
  return `${suiteName}/${normalizedMethod}`;
}

function normalizeTarget(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function countCharacter(value: string, character: string): number {
  let count = 0;
  for (const entry of value) {
    if (entry === character) {
      count += 1;
    }
  }
  return count;
}
