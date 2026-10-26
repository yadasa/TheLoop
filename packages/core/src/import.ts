import type { Conference, LoopEvent } from './types';
import { safeURL } from './selectors';
import { exceedsUTF8Bytes } from './text';

export type EventDraft = Omit<LoopEvent, 'id' | 'hostId' | 'attendeeIds' | 'waitlistIds'>;
export type EventCSVRow = { row: number; event?: EventDraft; errors: string[]; duplicate: boolean };
export type EventCSVPreview = { columns: string[]; rows: EventCSVRow[]; events: EventDraft[]; errors: string[] };
export type EventCSVOptions = {
  conferences: Pick<Conference, 'id'>[];
  existingEvents?: Pick<LoopEvent, 'title' | 'startAt'>[];
  defaultConferenceId?: string;
  defaultTimezone?: string;
  /** Reject events in the past when a reference instant is supplied. */
  now?: string;
};

const columns = ['title', 'description', 'startAt', 'endAt', 'timezone', 'location', 'conferenceId', 'kind', 'capacity', 'tags', 'url'] as const;
const headerFor = (value: string) => columns.find(column => column.toLowerCase() === value.trim().toLowerCase());
const identity = (title: string, instant: string) => `${title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')}\u0000${Date.parse(instant)}`;

/** CSV is data: no formula evaluation, HTML interpretation, or URL fetching occurs here. */
function parseCSV(input: string): { records: { line: number; cells: string[]; errors: string[] }[]; errors: string[] } {
  const records: { line: number; cells: string[]; errors: string[] }[] = [];
  let cells: string[] = [], cell = '', inQuotes = false, afterQuote = false;
  let line = 1, recordLine = 1, errors: string[] = [];
  const finishCell = () => { cells.push(cell); cell = ''; afterQuote = false; };
  const finishRecord = () => {
    finishCell();
    if (cells.some(value => value.trim() !== '') || errors.length) records.push({ line: recordLine, cells, errors });
    cells = []; errors = []; recordLine = line + 1;
  };
  const csv = input.replace(/^\uFEFF/, '');
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (inQuotes) {
      if (char === '"') {
        if (csv[index + 1] === '"') { cell += '"'; index += 1; }
        else { inQuotes = false; afterQuote = true; }
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && csv[index + 1] === '\n') index += 1;
        cell += '\n'; line += 1;
      } else cell += char;
      continue;
    }
    if (char === ',') { finishCell(); continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && csv[index + 1] === '\n') index += 1;
      finishRecord(); line += 1; continue;
    }
    if (char === '"') {
      if (!cell && !afterQuote) inQuotes = true;
      else { errors.push('Unexpected quote. Enclose the complete cell in double quotes and double any embedded quotes.'); cell += char; }
      continue;
    }
    if (afterQuote) {
      if (char === ' ' || char === '\t') continue;
      errors.push('Unexpected text after a closing quote.');
      afterQuote = false;
    }
    cell += char;
  }
  if (inQuotes) errors.push('Quoted cell is not closed.');
  if (cell || cells.length || errors.length || afterQuote) finishRecord();
  return { records, errors: [] };
}

const zoneValid = (zone: string) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0); return true; }
  catch { return false; }
};

/** Local timestamps require a unique real wall-clock instant in the selected IANA zone. */
function parseInstant(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(value.trim());
  if (!match) throw new Error('Use YYYY-MM-DDTHH:mm, optionally with seconds and an explicit Z or ±HH:mm offset.');
  const [year, month, day, hour, minute, second] = [match[1], match[2], match[3], match[4], match[5], match[6] ?? '0'].map(Number);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0'));
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day); wall.setUTCHours(hour, minute, second, millisecond);
  if (month < 1 || month > 12 || day < 1 || wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error('Date or time is not a valid calendar value.');
  const suffix = match[8];
  if (suffix) {
    if (suffix.toUpperCase() === 'Z') return wall.toISOString();
    const offsetHours = Number(suffix.slice(1, 3)), offsetMinutes = Number(suffix.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) throw new Error('UTC offset is invalid.');
    const offset = (offsetHours * 60 + offsetMinutes) * 60000 * (suffix[0] === '+' ? 1 : -1);
    return new Date(wall.getTime() - offset).toISOString();
  }
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wallTime = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const date = new Date(0); date.setUTCFullYear(parts.year, parts.month - 1, parts.day); date.setUTCHours(parts.hour, parts.minute, parts.second, 0); return date.getTime();
  };
  const desired = wall.getTime(), offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = Math.floor((desired + hours * 3600000) / 1000) * 1000;
    offsets.add(wallTime(sample) - sample);
  }
  const candidates = [...offsets].map(offset => desired - offset).filter(instant => wallTime(instant) === desired - millisecond);
  if (!candidates.length) throw new Error('Local time does not exist because the clock changes. Supply an explicit UTC offset.');
  if (candidates.length !== 1) throw new Error('Local time is ambiguous because the clock changes. Supply an explicit UTC offset.');
  return new Date(candidates[0]).toISOString();
}

/** Preview before import. Invalid and duplicate rows never appear in `events`. */
export function previewEventCSV(input: string, options: EventCSVOptions): EventCSVPreview {
  const preview: EventCSVPreview = { columns: [], rows: [], events: [], errors: [] };
  if (exceedsUTF8Bytes(input, 2_000_000)) { preview.errors.push('CSV is too large. Import a file smaller than 2 MB.'); return preview; }
  const parsed = parseCSV(input);
  const header = parsed.records.shift();
  if (!header) { preview.errors.push('Add a header row and at least one event.'); return preview; }
  preview.columns = header.cells.map(value => value.trim());
  if (header.errors.length) preview.errors.push(...header.errors.map(error => `Header: ${error}`));
  const mapping = header.cells.map(headerFor);
  const known = mapping.filter((key): key is typeof columns[number] => Boolean(key));
  if (new Set(known).size !== known.length) preview.errors.push('Each supported column may appear only once.');
  for (const required of ['title', 'startAt', 'endAt', 'location'] as const) if (!mapping.includes(required)) preview.errors.push(`Missing required column: ${required}.`);
  if (!mapping.includes('conferenceId') && !options.defaultConferenceId) preview.errors.push('Add a conferenceId column or choose a default conference.');
  if (parsed.records.length > 1000) preview.errors.push('Import at most 1,000 events at a time.');
  if (options.now && !Number.isFinite(Date.parse(options.now))) preview.errors.push('Reference time is invalid.');
  if (preview.errors.length) return preview;
  const seen = new Set((options.existingEvents ?? []).filter(event => Number.isFinite(Date.parse(event.startAt))).map(event => identity(event.title, event.startAt)));
  const allowedConferences = new Set(options.conferences.map(conference => conference.id));
  for (const record of parsed.records) {
    const row: EventCSVRow = { row: record.line, errors: [...record.errors], duplicate: false };
    preview.rows.push(row);
    if (record.cells.length !== mapping.length) row.errors.push(`Expected ${mapping.length} cells, found ${record.cells.length}.`);
    const data: Partial<Record<typeof columns[number], string>> = {};
    mapping.forEach((key, index) => { if (key) data[key] = (record.cells[index] ?? '').trim(); });
    const text = (key: 'title' | 'description' | 'location', maximum: number, required: boolean) => {
      const value = data[key] ?? '';
      if (required && !value) row.errors.push(`${key}: value is required.`);
      if (value.length > maximum) row.errors.push(`${key}: use at most ${maximum} characters.`);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) row.errors.push(`${key}: remove unsupported control characters.`);
      return value;
    };
    const title = text('title', 160, true), description = text('description', 3000, false), location = text('location', 300, true);
    const timezone = data.timezone || options.defaultTimezone || 'UTC';
    const timezoneOK = zoneValid(timezone);
    if (!timezoneOK) row.errors.push('timezone: use an IANA timezone such as America/Chicago.');
    const conferenceId = data.conferenceId || options.defaultConferenceId || '';
    if (!allowedConferences.has(conferenceId)) row.errors.push('conferenceId: conference was not found.');
    const kind = (data.kind || 'meetup') as LoopEvent['kind'];
    if (!['conference', 'meetup', 'workshop', 'social'].includes(kind)) row.errors.push('kind: choose conference, meetup, workshop, or social.');
    const capacityText = data.capacity || '0', capacity = Number(capacityText);
    if (!/^\d+$/.test(capacityText) || !Number.isInteger(capacity) || capacity > 10000) row.errors.push('capacity: use a whole number from 0 to 10,000 (0 means unlimited).');
    const tags = (data.tags || '').split('|').map(tag => tag.trim()).filter(Boolean);
    if (tags.length > 12 || tags.some(tag => tag.length > 50)) row.errors.push('tags: add at most 12 tags of up to 50 characters, separated by |.');
    const url = data.url || undefined;
    if (url && (url.length > 2048 || !safeURL(url))) row.errors.push('url: use a valid http or https link without credentials.');
    let startAt = '', endAt = '';
    if (timezoneOK) for (const key of ['startAt', 'endAt'] as const) {
      try { const value = parseInstant(data[key] || '', timezone); if (key === 'startAt') startAt = value; else endAt = value; }
      catch (error) { row.errors.push(`${key}: ${(error as Error).message}`); }
    }
    if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) row.errors.push('endAt: end must be after start.');
    if (startAt && options.now && Date.parse(startAt) < Date.parse(options.now)) row.errors.push('startAt: event must start in the future.');
    if (startAt && title) {
      const key = identity(title, startAt);
      if (seen.has(key)) { row.duplicate = true; row.errors.push('Duplicate event: the normalized title and start time already exist.'); }
      if (!row.errors.length) seen.add(key);
    }
    if (!row.errors.length) {
      row.event = { conferenceId, title, description, startAt, endAt, timezone, location, kind, capacity, tags: [...new Set(tags)], ...(url ? { url } : {}) };
      preview.events.push(row.event);
    }
  }
  if (!preview.rows.length) preview.errors.push('Add at least one event below the header.');
  return preview;
}
