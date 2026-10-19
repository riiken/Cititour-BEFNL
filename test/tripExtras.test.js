const { buildIcs, buildPackingList } = require('../services/tripExtras');

const trip = {
  id: 'abcDEF123456',
  title: 'Udaipur, lakes & palaces',
  summary: 'Three relaxed days',
  request: { destination: 'Udaipur', checkIn: '2099-07-10', checkOut: '2099-07-12', travellers: 4 },
  destination: { name: 'Udaipur', displayName: 'Udaipur, Rajasthan, India' },
  stays: [{ place: { kind: 'hotel', name: 'Poonam Haveli' } }],
  days: [
    { day: 1, date: '2099-07-10', items: [
      { slot: 'afternoon', note: 'Go early, it gets crowded', place: { kind: 'attraction', name: 'Jagdish Temple', description: 'Hindu temple' } },
      { slot: 'dinner', place: { kind: 'restaurant', name: 'Ambrai, Lal Ghat; rooftop' } }
    ] },
    { day: 2, date: '2099-07-11', items: [{ slot: 'morning', place: { kind: 'attraction', name: 'Sajjangarh', description: 'Palace on a hill in a sanctuary' } }] }
  ]
};

describe('calendar export', () => {
  const ics = buildIcs(trip, 'https://cititour.example/trip/abcDEF123456');

  it('is a valid calendar with one event per stop plus the trip', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  });

  it('uses India time and slot times', () => {
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20990710T143000');
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20990711T090000');
    expect(ics).toContain('DTSTART;VALUE=DATE:20990710');
    expect(ics).toContain('DTEND;VALUE=DATE:20990713'); // all-day end is exclusive
  });

  it('escapes commas and semicolons and folds long lines', () => {
    expect(ics).toContain('Ambrai\\, Lal Ghat\\; rooftop');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });
});

describe('packing list', () => {
  const list = buildPackingList(trip);
  const items = list.map((entry) => entry.item).join(' | ');

  it('always includes essentials', () => {
    expect(items).toMatch(/ID proof/);
    expect(items).toMatch(/power bank/);
  });

  it('adds items for temples, monsoon months, hills and groups', () => {
    expect(items).toMatch(/covering shoulders and knees/);
    expect(items).toMatch(/Umbrella/);
    expect(items).toMatch(/Shoes with good grip/);
    expect(items).toMatch(/Split-expense/);
  });

  it('adds warm clothes for hill destinations in winter only', () => {
    const winterHills = { ...trip, request: { ...trip.request, destination: 'Manali', checkIn: '2099-12-20', checkOut: '2099-12-23' }, destination: { name: 'Manali', displayName: 'Manali, Himachal Pradesh, India' } };
    expect(buildPackingList(winterHills).map((e) => e.item).join(' ')).toMatch(/thermals/);
    expect(items).not.toMatch(/thermals/);
  });
});
