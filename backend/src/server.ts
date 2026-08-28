import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config({ path: '../.env' });

const port = Number(process.env.PORT || 3001);
const app = createApp();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`CForge backend listening on port ${port}`);
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

const shutdown = (signal: string) => {
  console.log(`Received ${signal}; shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
