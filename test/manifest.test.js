// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there knows which
// handlers the code registers, nor that every text exists in the four
// languages: these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('../package.json'));
const appSource = await read('../src/app.js');

test('version, package.json and docker_image agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-life360:${pkg.version}`);
});

test('the cloud transport is declared, and only it', () => {
  // Life360 is reachable through its cloud only: no "Prefer local" toggle.
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('gladys_version covers every field declared', () => {
  // keywords: 5.3.0; "source": "houses": 5.2.0; widgets and scenes: 5.1.0.
  assert.equal(manifest.gladys_version, '>=5.3.0');
});

test('the description and keywords fit what the store allows', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${language}: ${text.length}`);
  }
  assert.ok(manifest.keywords.length >= 1 && manifest.keywords.length <= 10);
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, normalized.length, 'keywords must be unique');
});

const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('categories come from the store vocabulary', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), category);
  }
});

// Every multi-language text of the manifest: walk the whole document and keep
// the objects whose keys are languages.
function textsOf(node, path = '$', found = []) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => textsOf(child, `${path}[${i}]`, found));
  } else if (node && typeof node === 'object') {
    if ('en' in node && Object.values(node).every((value) => typeof value === 'string')) {
      found.push([path, node]);
    } else {
      for (const [key, child] of Object.entries(node)) textsOf(child, `${path}.${key}`, found);
    }
  }
  return found;
}

test('every manifest text exists in English, French, German and Spanish', () => {
  const texts = textsOf(manifest);
  assert.ok(texts.length > 50);
  for (const [path, text] of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), path);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

test('every field uses a type the store accepts, with a snake_case key', () => {
  const allFields = [
    ...manifest.config_schema,
    ...manifest.actions.flatMap((action) => action.fields ?? []),
    ...manifest.scene_triggers.flatMap((trigger) => trigger.fields ?? []),
    ...manifest.scene_actions.flatMap((action) => action.fields ?? []),
  ];
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `${field.key}: ${field.type}`);
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.placeholder !== undefined) {
      assert.ok(['string', 'number', 'secret'].includes(field.type), field.key);
    }
    if (field.source !== undefined) {
      assert.equal(field.options, undefined, `${field.key}: source and options`);
      assert.equal(field.default, undefined, `${field.key}: no default with a source`);
    }
    if (field.type === 'secret') {
      assert.equal(field.default, undefined, `${field.key}: a secret has no default`);
    }
  }
  // Scene trigger filters cannot be booleans (no "any" state).
  for (const field of manifest.scene_triggers.flatMap((trigger) => trigger.fields ?? [])) {
    assert.notEqual(field.type, 'boolean', field.key);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') continue;
    assert.ok(field.key in DEFAULT_CONFIG, `${field.key} missing from DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
    }
  }
});

test('every manifest action is registered', () => {
  for (const action of manifest.actions) {
    assert.match(appSource, new RegExp(`onAction\\('${action.key}'`), action.key);
  }
});

test('scene triggers fired by the code and declared in the manifest are the same', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
});

test('scene actions: one handler per key, returning exactly the declared outputs', async () => {
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.keys(SCENE_ACTIONS).sort(),
  );
  // A service that knows nobody: the "unknown member" answers.
  const service = { findByDevice: () => undefined, requestLocationUpdate: async () => false };
  for (const action of manifest.scene_actions) {
    const outputs = await SCENE_ACTIONS[action.key](service, { fields: { member: 'x' } });
    assert.deepEqual(
      Object.keys(outputs).sort(),
      action.outputs.map((output) => output.key).sort(),
      action.key,
    );
    for (const output of action.outputs) {
      assert.equal(typeof outputs[output.key], output.type, `${action.key}.${output.key}`);
    }
  }
});

test('every widget has a handler', () => {
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.keys(WIDGETS).sort(),
  );
});

test('the house location is requested, for the distance from home', () => {
  assert.equal(manifest.location, true);
});

test('the user documentation exists in the four languages', async () => {
  for (const language of LANGUAGES) {
    const text = await read(`../docs/${language}.md`);
    assert.ok(text.length > 1000, `docs/${language}.md`);
    // Every scene trigger and action key is documented, in every language.
    for (const key of [...Object.values(SCENE_TRIGGERS), ...Object.keys(SCENE_ACTIONS)]) {
      assert.ok(text.includes(`\`${key}\``), `docs/${language}.md: ${key}`);
    }
  }
});
