// Imported first by the tests that run the integration: its log lines would
// drown the test report. Must run before src/app.js reads LOG_LEVEL.
process.env.LOG_LEVEL = 'silent';
