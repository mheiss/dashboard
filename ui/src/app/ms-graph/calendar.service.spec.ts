import { describe, expect, it } from 'vitest';
import { toEvent } from './calendar.service';
import { graphToDate } from './graph.model';

describe('Backend calendar presentation', () => {
  it('preserves server-provided dates and calendar identity', () => {
    const event = toEvent({
      id: 'occurrence', subject: 'Appointment', isAllDay: false,
      startsAt: '2026-10-25T08:00:00Z', endsAt: '2026-10-25T09:00:00Z',
      calendar: { id: 'calendar', name: 'Family', theme: 'rose' },
    });
    expect(event.id).toBe('occurrence');
    expect(event.myConfig.tailwindClasses).toContain('rose');
    expect(graphToDate(event.start).toISOString()).toBe('2026-10-25T08:00:00.000Z');
  });

  it('does not append a second UTC marker or replace explicit offsets', () => {
    expect(graphToDate({ dateTime: '2026-10-25T08:00:00', timeZone: 'UTC' }).toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(graphToDate({ dateTime: '2026-10-25T09:00:00+01:00', timeZone: 'UTC' }).toISOString()).toBe('2026-10-25T08:00:00.000Z');
  });
});
