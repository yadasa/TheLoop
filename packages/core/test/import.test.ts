import assert from 'node:assert/strict';
import test from 'node:test';
import { previewEventCSV } from '../src/import';

const options = { conferences: [{ id: 'afrotech' }], defaultConferenceId: 'afrotech', defaultTimezone: 'America/Chicago' };
const header = 'title,description,startAt,endAt,timezone,location,conferenceId,kind,capacity,tags,url';
const line = 'Coffee circle,Good people,2026-11-03T09:00,2026-11-03T10:00,America/Chicago,Downtown,afrotech,meetup,30,Coffee|Community,https://example.org/coffee';

test('CSV handles BOM, escaped quotes, commas, and newlines in quoted fields', () => {
  const csv = `\uFEFF${header}\r\n"Coffee, code","Say ""hello""\r\nBring a friend",2026-11-03T09:00,2026-11-03T10:00,America/Chicago,Downtown,afrotech,social,0,Coffee|Community,\r\n${line}`;
  const preview = previewEventCSV(csv, options);
  assert.deepEqual(preview.errors, []); assert.equal(preview.events.length, 2);
  assert.equal(preview.events[0].title, 'Coffee, code');
  assert.equal(preview.events[0].description, 'Say "hello"\nBring a friend');
  assert.equal(preview.rows[1].row, 4, 'row reports use physical source line numbers');
  assert.equal(preview.events[0].startAt, '2026-11-03T15:00:00.000Z');
});

test('explicit offsets normalize before ordering and duplicate comparison', () => {
  const csv = `${header}\n${line}\n coffee   circle ,Details,2026-11-03T15:00:00Z,2026-11-03T16:00:00Z,UTC,Downtown,afrotech,meetup,30,,`;
  const preview = previewEventCSV(csv, options);
  assert.equal(preview.events.length, 1); assert.equal(preview.rows[1].duplicate, true);
  const existing = previewEventCSV(`${header}\n${line}`, { ...options, existingEvents: [{ title: 'COFFEE CIRCLE', startAt: '2026-11-03T10:00:00-05:00' }] });
  assert.equal(existing.events.length, 0); assert.equal(existing.rows[0].duplicate, true);
});

test('real calendar validation rejects date rollovers and backwards durations', () => {
  const csv = `${header}\n${line.replace(/2026-11-03/g, '2026-02-30')}\n${line.replace('2026-11-03T10:00', '2026-11-03T08:00')}`;
  const preview = previewEventCSV(csv, options);
  assert.equal(preview.events.length, 0);
  assert.match(preview.rows[0].errors.join(' '), /valid calendar/);
  assert.match(preview.rows[1].errors.join(' '), /end must be after start/);
});

test('invalid IANA zones and DST gaps or overlaps need correction', () => {
  const csv = `${header}\n${line.replace('America/Chicago', 'Mars/Unknown')}\n${line.replace('2026-11-03T09:00', '2026-03-08T02:30').replace('2026-11-03T10:00', '2026-03-08T04:00')}\n${line.replace('2026-11-03T09:00', '2026-11-01T01:30').replace('2026-11-03T10:00', '2026-11-01T03:00')}`;
  const preview = previewEventCSV(csv, options);
  assert.equal(preview.events.length, 0);
  assert.match(preview.rows[0].errors.join(' '), /IANA timezone/);
  assert.match(preview.rows[1].errors.join(' '), /does not exist/);
  assert.match(preview.rows[2].errors.join(' '), /ambiguous/);
  const explicit = previewEventCSV(`${header}\n${line.replace('2026-11-03T09:00', '2026-11-01T01:30-05:00').replace('2026-11-03T10:00', '2026-11-01T03:00-06:00')}`, options);
  assert.equal(explicit.events.length, 1);
});

test('formula-shaped text remains inert while dangerous event links are rejected', () => {
  const preview = previewEventCSV(`${header}\n${line.replace('Coffee circle', '=HYPERLINK(""""danger"""" )')}\n${line.replace('https://example.org/coffee', 'javascript:alert(1)')}`, options);
  assert.equal(preview.events.length, 0, 'malformed quoting and unsafe URLs are rejected independently');
  const inert = previewEventCSV(`title,description,startAt,endAt,location\n"=SUM(1,2)",@test,2026-11-03T15:00Z,2026-11-03T16:00Z,+1+1`, options);
  assert.equal(inert.events.length, 1); assert.equal(inert.events[0].title, '=SUM(1,2)');
  assert.equal(inert.events[0].description, '@test'); assert.equal(inert.events[0].location, '+1+1');
});

test('rows report invalid capacity, conference, kind, links, and column counts', () => {
  const csv = `${header}\n${line.replace(',30,', ',-1,')}\n${line.replace(',afrotech,meetup,', ',missing,unknown,')}\n${line},extra`;
  const preview = previewEventCSV(csv, options);
  assert.equal(preview.rows.length, 3); assert.equal(preview.events.length, 0);
  assert.match(preview.rows[0].errors.join(' '), /capacity/);
  assert.match(preview.rows[1].errors.join(' '), /conferenceId/);
  assert.match(preview.rows[1].errors.join(' '), /kind/);
  assert.match(preview.rows[2].errors.join(' '), /Expected 11 cells/);
});

test('headers and malformed quoting fail explicitly without creating partial drafts', () => {
  assert.match(previewEventCSV('title,startAt\nHello,2026-11-03T09:00', options).errors.join(' '), /Missing required column/);
  assert.match(previewEventCSV('title,title,startAt,endAt,location\nA,A,2026-11-03T09:00,2026-11-03T10:00,Downtown', options).errors.join(' '), /only once/);
  const unclosed = previewEventCSV(`${header}\n"Coffee,never closes`, options);
  assert.equal(unclosed.events.length, 0); assert.match(unclosed.rows[0].errors.join(' '), /not closed/);
});

test('import never mutates existing records and rejects past events when requested', () => {
  const existingEvents = [{ title: 'Another event', startAt: '2026-11-04T10:00:00Z' }];
  const before = JSON.stringify(existingEvents);
  const preview = previewEventCSV(`${header}\n${line}`, { ...options, existingEvents, now: '2026-11-04T00:00:00Z' });
  assert.equal(preview.events.length, 0); assert.match(preview.rows[0].errors.join(' '), /future/);
  assert.equal(JSON.stringify(existingEvents), before);
});
