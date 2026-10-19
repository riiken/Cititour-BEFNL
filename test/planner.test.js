const { buildCandidates, validatePlan, planDeterministically, tripDays } = require('../services/itineraryPlanner');

const city = {
  name: 'Udaipur',
  attractions: [
    { name: 'City Palace', description: 'Palace', lat: 24.576, lon: 73.683, source: 'wikivoyage' },
    { name: 'Jagdish Temple', description: 'Hindu temple', lat: 24.579, lon: 73.684, source: 'wikivoyage' },
    { name: 'Lake Pichola', description: 'Lake', lat: 24.572, lon: 73.679, source: 'wikipedia' },
    { name: 'Sajjangarh Palace', description: 'Monsoon palace on a hill', lat: 24.594, lon: 73.638, source: 'wikipedia' },
    { name: 'Saheliyon ki Bari', description: 'Garden', lat: 24.603, lon: 73.687, source: 'wikivoyage' },
    { name: 'Fateh Sagar Lake', description: 'Lake', lat: 24.601, lon: 73.675, source: 'wikipedia' },
    { name: 'Bagore Ki Haveli', description: 'Haveli museum', source: 'wikivoyage' }
  ],
  hotels: [
    { name: 'Poonam Haveli', priceMin: 2000, price: '₹2,000' },
    { name: 'Budget Inn', priceMin: 650 },
    { name: 'Lake Palace Hotel', priceMin: 40000 }
  ],
  restaurants: [{ name: 'Ambrai' }, { name: '1559 AD' }]
};

const request = { checkIn: '2099-12-10', checkOut: '2099-12-13', travellers: 2, budget: 'Mid-range', interests: ['Culture'] };

describe('tripDays', () => {
  it('plans arrival, full and departure days', () => {
    expect(tripDays('2099-12-10', '2099-12-13').map((d) => d.kind)).toEqual(['arrival', 'full', 'full', 'departure']);
    expect(tripDays('2099-12-10', '2099-12-13')[3].date).toBe('2099-12-13');
  });
});

describe('buildCandidates', () => {
  it('assigns ids, zones and hotel price bands', () => {
    const c = buildCandidates(city, null, 2);
    expect(c.attractions[0].id).toBe('A1');
    expect(c.attractions.filter((a) => a.zone).length).toBe(6); // the one without coordinates has no zone
    expect(c.hotels.find((h) => h.name === 'Budget Inn').priceBand).toBe('budget');
    expect(c.hotels.find((h) => h.name === 'Lake Palace Hotel').priceBand).toBe('luxury');
    expect(c.stayAreas).toEqual([]); // hotels exist
  });

  it('offers stay areas when there are no hotels', () => {
    const c = buildCandidates({ ...city, hotels: [] }, null, 2);
    expect(c.stayAreas.length).toBeGreaterThan(0);
    expect(c.stayAreas[0].name).toMatch(/^Near /);
  });
});

describe('validatePlan', () => {
  const days = tripDays(request.checkIn, request.checkOut);
  const candidates = buildCandidates(city, null, 2);

  it('drops invented ids, wrong slots and duplicates', () => {
    const plan = validatePlan({
      days: [
        { day: 1, items: [{ id: 'A1', slot: 'morning' }, { id: 'A2', slot: 'evening' }] }, // morning not allowed on arrival
        { day: 2, items: [{ id: 'A99', slot: 'morning' }, { id: 'A2', slot: 'afternoon' }, { id: 'R1', slot: 'morning' }, { id: 'R1', slot: 'lunch' }] },
        { day: 3, items: [{ id: 'A2', slot: 'morning' }, { id: 'A3', slot: 'morning' }] }
      ],
      stays: [{ id: 'H1' }, { id: 'X5' }, { id: 'A1' }]
    }, { days, candidates });

    expect(plan.days[0].items.map((i) => i.candidateId)).toEqual(['A2']);
    expect(plan.days[1].items.map((i) => `${i.candidateId}:${i.slot}`)).toEqual(['R1:lunch']);
    expect(plan.days[2].items.map((i) => i.candidateId)).toEqual(['A3']);
    expect(plan.stays.map((s) => s.candidateId)).toEqual(['H1']);
  });

  it('rejects a plan with no valid activities', () => {
    expect(() => validatePlan({ days: [{ day: 1, items: [{ id: 'Z1', slot: 'evening' }] }] }, { days, candidates }))
      .toThrow(/no valid activities/);
  });
});

describe('planDeterministically', () => {
  const days = tripDays(request.checkIn, request.checkOut);
  const candidates = buildCandidates(city, null, 2);

  it('builds a complete plan without AI, never repeating attractions', () => {
    const plan = planDeterministically({ days, candidates, request });
    const activityIds = plan.days.flatMap((d) => d.items.filter((i) => !['lunch', 'dinner'].includes(i.slot)).map((i) => i.candidateId));
    expect(new Set(activityIds).size).toBe(activityIds.length);
    expect(plan.days[1].items.some((i) => i.slot === 'lunch')).toBe(true);
    expect(plan.stays.length).toBe(3);
    expect(plan.stays[0].candidateId).toBe(candidates.hotels.find((h) => h.priceBand === 'mid-range').id);
  });

  it('tops up a thin AI day instead of leaving it empty', () => {
    const thin = {
      title: 'T', summary: '', budget: {}, tips: [], stays: [],
      days: days.map((day) => ({ ...day, theme: 'x', items: day.day === 2 ? [{ candidateId: 'A1', slot: 'morning', note: 'n' }] : [] }))
    };
    const plan = planDeterministically({ days, candidates, request, existing: thin });
    const day2 = plan.days[1].items.filter((i) => !['lunch', 'dinner'].includes(i.slot));
    expect(day2.length).toBeGreaterThanOrEqual(2);
    expect(day2[0].note).toBe('n'); // AI item kept
  });
});
