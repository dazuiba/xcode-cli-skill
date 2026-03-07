import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTestSpecifier } from '../src/xcode-test.ts';

test('parseTestSpecifier parses explicit target::identifier value', () => {
  const parsed = parseTestSpecifier('AppTests::FeatureTests/testExample()');
  assert.deepEqual(parsed, {
    source: 'AppTests::FeatureTests/testExample()',
    targetName: 'AppTests',
    testIdentifier: 'FeatureTests/testExample()',
  });
});

test('parseTestSpecifier parses Target/Class/test() format', () => {
  const parsed = parseTestSpecifier('AppTests/FeatureTests/testExample()');
  assert.equal(parsed.targetName, 'AppTests');
  assert.equal(parsed.testIdentifier, 'FeatureTests/testExample()');
});

test('parseTestSpecifier parses Class#test shorthand with default target', () => {
  const parsed = parseTestSpecifier('AccessKeyTests#testParseEndpointSimple', 'DashProxyTests');
  assert.deepEqual(parsed, {
    source: 'AccessKeyTests#testParseEndpointSimple',
    targetName: 'DashProxyTests',
    testIdentifier: 'AccessKeyTests/testParseEndpointSimple()',
  });
});

test('parseTestSpecifier parses Class/test identifier without explicit target', () => {
  const parsed = parseTestSpecifier('AccessKeyTests/testParseEndpointSimple()');
  assert.deepEqual(parsed, {
    source: 'AccessKeyTests/testParseEndpointSimple()',
    targetName: undefined,
    testIdentifier: 'AccessKeyTests/testParseEndpointSimple()',
  });
});

test('parseTestSpecifier throws for invalid formats', () => {
  assert.throws(() => parseTestSpecifier('JustATarget'), /Invalid test specifier/);
  assert.throws(() => parseTestSpecifier('/testOnly()'), /Invalid test specifier/);
  assert.throws(() => parseTestSpecifier('Target::'), /Invalid test specifier/);
});
