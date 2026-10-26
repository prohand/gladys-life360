// -----------------------------------------------------------------------------
// The dashboard widget: content valid for the core (validateWidgetContent
// returns [] = rendered exactly as sent), live tiles bound to real features,
// every button handled.
// -----------------------------------------------------------------------------

import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { CIRCLE_ACTIONS, CIRCLE_WIDGET } from '../src/capabilities/widget.js';
import { createFakeLife360, rawMember } from './helpers/fakeLife360.js';

async function setup(members) {
  const life = createFakeLife360(members ? { members: { 'c-family': members } } : {});
  const gladys = createFakeGladys({
    config: { access_token: 'tok' },
    houses: [{ id: 'h', name: 'Maison', selector: 'maison', latitude: 48.8566, longitude: 2.3522 }],
  });
  const app = createApp(gladys, { createClient: () => life });
  await gladys.connect();
  app.stop();
  await app.service.refresh();
  return { gladys, app, life };
}

test('the widget content fits the core vocabulary and budget', async (t) => {
  const members = Array.from({ length: 12 }, (_, i) =>
    rawMember({
      id: `m-${i}`,
      firstName: `Member with a very long first name ${i}`,
      place: i % 2 ? null : 'Home',
      latitude: 48.8566 + i * 0.01,
      address1: 'A street name long enough to overflow the forty characters limit',
      isDriving: i === 3 ? '1' : '0',
    }),
  );
  const { gladys } = await setup(members);
  t.after(() => gladys.disconnect());

  const ack = await gladys.fake.widgetGet(CIRCLE_WIDGET, { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);

  const features = new Set(
    gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  for (const component of content.components.filter((c) => c.device_feature)) {
    assert.ok(features.has(component.device_feature), component.device_feature);
  }
});

test('the empty widget is valid too', async (t) => {
  const { gladys } = await setup([]);
  t.after(() => gladys.disconnect());
  const ack = await gladys.fake.widgetGet(CIRCLE_WIDGET, { settings: {} });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
});

test('every widget button is handled', async (t) => {
  const { gladys, life } = await setup();
  t.after(() => gladys.disconnect());

  const content = (await gladys.fake.widgetGet(CIRCLE_WIDGET, { settings: {} })).data.content;
  const keys = content.components.filter((c) => c.action).map((c) => c.action.key);
  assert.deepEqual(keys.sort(), Object.values(CIRCLE_ACTIONS).sort());

  const refresh = await gladys.fake.widgetAction(CIRCLE_WIDGET, CIRCLE_ACTIONS.REFRESH, {}, {});
  assert.equal(refresh.success, true);
  const locate = await gladys.fake.widgetAction(CIRCLE_WIDGET, CIRCLE_ACTIONS.LOCATE_ALL, {}, {});
  assert.equal(locate.success, true);
  assert.equal(life.requests.length, 1);

  const unknown = await gladys.fake.widgetAction(CIRCLE_WIDGET, 'nope', {}, {});
  assert.equal(unknown.success, false);
});

test('every refresh nudges the widget', async (t) => {
  const { gladys, app } = await setup();
  t.after(() => gladys.disconnect());
  const before = gladys.fake.widgetRefreshes.length;
  await app.service.refresh();
  assert.equal(gladys.fake.widgetRefreshes.length, before + 1);
});
