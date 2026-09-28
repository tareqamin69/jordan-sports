import { BRAND_NAME_LATIN } from '@jordan-sports/brand';

/** Jordanian numeric date: DD/MM/YYYY (Western digits) from a YYYY-MM-DD calendar date. */
export function dmy(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** "Monday 28/09/2026" style label: localized weekday + Jordanian numeric date. */
export function dayLabel(date: string, weekday: string): string {
  return `${weekday} ${dmy(date)}`;
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** "HH:mm" of an instant in a time zone. */
export function timeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

type Place = { lat: number; lng: number } | null;

/** Google Maps directions (opens the Maps app on phones). */
export function directionsUrl(location: Place, fallbackQuery: string): string {
  const destination = location ? `${location.lat},${location.lng}` : fallbackQuery;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function icsStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/[,;]/g, (c) => `\\${c}`)
    .replace(/\n/g, '\\n');
}

export interface CalendarEvent {
  uid: string;
  title: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
}

/** An iCalendar file (Apple Calendar, Outlook, and most phone calendars). */
export function icsFile(e: CalendarEvent): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${BRAND_NAME_LATIN}//Booking//EN`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(e.start)}`,
    `DTEND:${icsStamp(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `LOCATION:${icsEscape(e.location)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${icsStamp(e.start)}/${icsStamp(e.end)}`,
    location: e.location,
    details: e.description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
