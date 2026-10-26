// -----------------------------------------------------------------------------
// Entry point of the Life360 integration for Gladys Assistant.
//
// SDK wiring only: every Life360 call and every decision lives in src/. This
// file instantiates the SDK, registers the handlers BEFORE connect(), and
// starts / stops the refresh loop with the connection to Gladys.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// The SDK reads them itself: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const app = createApp(gladys);

process.on('unhandledRejection', (err) => {
  // Logged, never fatal: a stray Life360 timeout must not stop the presence
  // of the whole family.
  logger.error('Unhandled promise rejection', err);
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the Life360 integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
