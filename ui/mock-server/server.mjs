import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const imagesDirectory = join(directory, 'images');
const fixture = JSON.parse(await readFile(join(directory, 'fixtures.json'), 'utf8'));
const panelPage = await readFile(join(directory, 'panel.html'));
const port = Number(process.env.MOCK_PORT ?? 8081);
const photoById = new Map(fixture.photos.map((photo) => [photo.id, photo]));
const cameraById = new Map(fixture.cameras.map((camera) => [camera.id, camera]));
const snapshotById = new Map(fixture.motionGroups.flatMap((group) => group.snapshots.map((snapshot) => [snapshot.id, snapshot])));
const memoryYears = [...new Set(fixture.memories.flatMap((memory) => memory.photos.map((photo) => photo.year)))].sort(
  (left, right) => right - left,
);

function imageRecord(photoId, year, month, day) {
  const photo = photoById.get(photoId);
  if (!photo) throw new Error(`Unknown mock photo: ${photoId}`);

  const takenAt = year === undefined ? photo.takenAt : new Date(Date.UTC(year, month - 1, day, 9, 30)).toISOString();
  const id = year === undefined ? photo.id : `${photo.id}-${year}-${month}-${day}`;
  return {
    id,
    name: photo.name,
    takenAt,
    modifiedAt: takenAt,
    thumbnailUrl: `/api/media/images/${photo.id}/thumbnail?v=1`,
    originalUrl: `/api/media/images/${photo.id}/original?v=1`,
    width: fixture.imageSize.width,
    height: fixture.imageSize.height,
  };
}

function dayOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function calendarEvent(date, event, isAllDay = false) {
  const start = isAllDay ? '00:00' : event.start;
  const end = isAllDay ? '23:59' : event.end;
  return {
    id: event.id,
    subject: event.subject,
    startsAt: `${date}T${start}:00Z`,
    endsAt: `${date}T${end}:00Z`,
    isAllDay,
    calendar: { id: event.calendar, name: event.calendar, theme: event.theme },
  };
}

function agenda() {
  return {
    revision: fixture.revision,
    timezone: fixture.timezone,
    days: fixture.agenda.map((day) => {
      const date = dayOffset(day.offset);
      return {
        date,
        allDay: day.allDay.map((event) => calendarEvent(date, event, true)),
        events: day.events.map((event) => calendarEvent(date, event)),
      };
    }),
  };
}

function memoryDates(variables = {}) {
  return fixture.memories
    .filter((memory) => !variables.month || variables.month === memory.month)
    .filter((memory) => !variables.photoYear || memory.photos.some((photo) => photo.year === variables.photoYear))
    .map(({ month, day, photos }) => {
      const filtered = variables.photoYear ? photos.filter((photo) => photo.year === variables.photoYear) : photos;
      return { month, day, photoYearCount: new Set(filtered.map((photo) => photo.year)).size, photoCount: filtered.length };
    });
}

function memoryDay(month, day) {
  const memory = fixture.memories.find((entry) => entry.month === month && entry.day === day);
  return {
    month,
    day,
    images: (memory?.photos ?? []).map((photo) => imageRecord(photo.id, photo.year, month, day)),
  };
}

function memoryImages(month, day, after = null) {
  const images = memoryDay(month, day).images;
  const start = after ? Number(after) : 0;
  const items = images.slice(start, start + 25);
  return {
    revision: fixture.revision,
    totalCount: images.length,
    endCursor: items.length ? String(start + items.length) : null,
    hasNextPage: start + items.length < images.length,
    items,
  };
}

function motionGroups() {
  return fixture.motionGroups.map((group) => {
    const snapshots = group.snapshots.map((snapshot) => ({
      id: snapshot.id,
      camera: snapshot.camera,
      timestamp: snapshot.timestamp,
      type: snapshot.type,
      url: `/api/media/protect/${snapshot.id}`,
    }));
    return { id: group.id, snapshots, preview: snapshots[0] };
  });
}

function graphQLResponse(query, variables = {}) {
  if (query.includes('agenda(')) return { agenda: agenda() };
  if (query.includes('MemoryIndex')) return { memoryDates: memoryDates(), memoryYears };
  if (query.includes('MemoryDates(') || query.includes('memoryDates(')) {
    return { memoryDates: memoryDates(variables) };
  }
  if (query.includes('MemoryDays')) {
    const data = {};
    for (const match of query.matchAll(/memory(\d+):\s*memoryImages/g)) {
      const index = Number(match[1]);
      data[`memory${index}`] = memoryImages(variables[`month${index}`], variables[`day${index}`]);
    }
    return data;
  }
  if (query.includes('MemoryImages')) {
    return { memoryImages: memoryImages(variables.month, variables.day, variables.after) };
  }
  if (query.includes('images(first:')) {
    return {
      images: {
        revision: fixture.revision,
        totalCount: fixture.photos.length,
        endCursor: null,
        hasNextPage: false,
        items: fixture.photos.map((photo) => imageRecord(photo.id)),
      },
    };
  }
  if (query.includes('motionGroups')) return { motionGroups: motionGroups() };
  if (query.includes('securityArmed')) return { securityArmed: fixture.security.armed };
  if (query.includes('submitSecurityPin')) return { submitSecurityPin: fixture.security.pinAccepted };
  return {};
}

function json(response, value) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function sendImage(response, photoId) {
  const photo = photoById.get(photoId);
  if (!photo) return false;
  const file = resolve(imagesDirectory, photo.file);
  if (dirname(file) !== imagesDirectory) throw new Error('Invalid image path in mock fixture.');
  await stat(file);
  response.writeHead(200, {
    'content-type': 'image/jpeg',
    'cache-control': 'public, max-age=3600',
  });
  response.end(await readFile(file));
  return true;
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/config' && request.method === 'GET') {
    json(response, fixture.configuration);
    return;
  }

  if (url.pathname === '/api/graphql' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    json(response, { data: graphQLResponse(payload.query ?? '', payload.variables ?? {}) });
    return;
  }

  if (url.pathname === '/mock-data.json' && request.method === 'GET') {
    json(response, fixture);
    return;
  }

  if ((url.pathname === '/mock/openhab' || url.pathname === '/mock/evcc') && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(panelPage);
    return;
  }

  const photoMatch = url.pathname.match(/^\/api\/media\/images\/(sample-\d{2})(?:-\d{4}-\d{1,2}-\d{1,2})?\/(?:thumbnail|original)$/);
  if (photoMatch && request.method === 'GET' && (await sendImage(response, photoMatch[1]))) return;

  const snapshotMatch = url.pathname.match(/^\/api\/media\/protect\/([a-z0-9-]+)$/);
  if (snapshotMatch && request.method === 'GET') {
    const snapshot = snapshotById.get(snapshotMatch[1]);
    if (snapshot && (await sendImage(response, snapshot.photoId))) return;
  }

  if (url.pathname === '/api/webrtc/frame.jpeg' && request.method === 'GET') {
    const streamName = url.searchParams.get('src') ?? '';
    const cameraId = streamName.replace(/^unifi_/, '').replace(/_(?:high|medium)$/, '');
    const camera = cameraById.get(cameraId);
    if (camera && (await sendImage(response, camera.photoId))) return;
  }

  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Mock endpoint not found', path: url.pathname }));
}

function websocketFrame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Mock server request failed' }));
  });
});

server.on('upgrade', (request, socket) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const key = request.headers['sec-websocket-key'];
  if (!key || !['/api/graphql', '/api/ws/webrtc'].includes(url.pathname)) {
    socket.destroy();
    return;
  }

  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  const protocol = request.headers['sec-websocket-protocol'];
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : ''}\r\n`,
  );

  if (url.pathname === '/api/ws/webrtc') return;

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const masked = (buffer[1] & 0x80) !== 0;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const maskOffset = masked ? 4 : 0;
      if (buffer.length < offset + maskOffset + length) return;
      const mask = masked ? buffer.subarray(offset, offset + 4) : null;
      offset += maskOffset;
      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      buffer = buffer.subarray(offset + length);

      if (masked && mask) {
        for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
      }
      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode === 0x9) {
        socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
        continue;
      }
      if (url.pathname === '/api/graphql' && opcode === 0x1) {
        try {
          const message = JSON.parse(payload.toString());
          if (message.type === 'connection_init') socket.write(websocketFrame({ type: 'connection_ack' }));
        } catch (error) {
          console.error('Invalid mock GraphQL WebSocket message.', error);
          socket.destroy();
          return;
        }
      }
    }
  });
  socket.on('error', () => socket.destroy());
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Fictional dashboard API listening on http://127.0.0.1:${port}`);
});
