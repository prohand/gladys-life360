// -----------------------------------------------------------------------------
// Handler registration, kept apart from index.js so the tests can run the
// whole integration against the SDK's fake Gladys (createFakeGladys).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { Life360Service } from './life360/service.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './capabilities/widget.js';
import { MESSAGES } from './messages.js';

const logger = createLogger({ name: 'app' });

// The level the container was started with, restored when the "Detailed
// logs" switch is turned off again.
const BASE_LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Register every handler on `gladys` and return the controls index.js needs.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ createClient?: (config: object) => object }} [options] injected by the tests
 */
export function createApp(gladys, { createClient } = {}) {
  const service = new Life360Service(gladys, {
    createClient,
    // Every refresh may move someone: nudge the open dashboards.
    onChange: () => refreshWidgets(gladys),
  });

  async function applyConfig(rawConfig) {
    const config = normalizeConfig(rawConfig);
    // The SDK logger reads LOG_LEVEL on every line: the switch is immediate.
    process.env.LOG_LEVEL = config.debug_logs ? 'debug' : BASE_LOG_LEVEL;
    await service.configure(config);
  }

  // --- Discovery: Gladys asks for the list of devices ------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the Life360 members');
    await service.publishDevices();
  });

  // --- A member device was created: send its states at once ------------------
  // Gladys drops the states of a feature that does not exist yet; the SDK
  // forgets them on device-created, so the next refresh re-sends them. Read
  // now instead of waiting for the next tick.
  gladys.onDeviceCreated(async () => {
    await service.refresh();
  });

  // --- Manifest actions: buttons in the Configuration screen -----------------
  gladys.onAction('test_connection', () => service.testConnection());

  gladys.onAction('request_location', async (fields) => {
    logger.info(`Action request_location <- ${fields.member}`);
    return (await service.requestLocationUpdate(fields.member))
      ? MESSAGES.locationRequested
      : MESSAGES.unknownMember;
  });

  // --- Scene actions (Gladys 5.1+) -------------------------------------------
  // Scene TRIGGERS need no handler: the service fires them with
  // publishSceneEvent (see src/capabilities/scenes.js).
  for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(actionKey, (fields) => handler(service, { fields }));
  }

  // --- Dashboard widget (Gladys 5.1+) ----------------------------------------
  for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(widgetKey, (request) => widget.get(gladys, { ...request, service }));
    gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
      widget.action(gladys, { actionKey, params, settings, service }),
    );
  }

  // --- Configuration saved by the user ---------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    service.stop();
    await applyConfig(newConfig);
    service.resetConnectionStatus();
    service.start();
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      await applyConfig(await gladys.getConfig());
      // The status, the badges and the widget nudges sent while the socket
      // was down were dropped: the first refresh sends them all again.
      service.resetConnectionStatus();
      service.publishedDeviceSignature = null;
      service.start();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Logs der Integration nach.',
          es: 'La inicialización falló, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    service.stop();
  });

  return {
    service,
    stop: () => service.stop(),
  };
}
