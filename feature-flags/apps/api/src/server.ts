import { createServer } from 'node:http';
import { createApp } from './http/app.js';

const port = Number(process.env.PORT ?? 4000);
const server = createServer(createApp());

server.listen(port, () => {
  console.log(`Feature Flag API listening on http://localhost:${port}`);
});
