const { extractTemplates, splitArgs, toListing, parseInrPrice, plain, regionCityLinks } = require('../services/wikivoyageService');

describe('Wikivoyage parsing', () => {
  const wikitext = `
==See==
* {{see | name=[[City Palace, Udaipur|City Palace]] | lat=24.576 | long=73.683
| content=The largest palace complex in Rajasthan, with views over {{w|Lake Pichola}}. }}
==Sleep==
* {{sleep | name=Poonam Haveli | address=Lal Ghat | price=₹2,000-3,500 | url=https://example.com }}
* {{sleep | name=Budget Inn | price=Rs 650 per night }}
* {{eat | name=Ambrai | content=Lakeside dining with '''great''' views.}}
`;

  it('extracts listing templates with nested templates and links', () => {
    const templates = extractTemplates(wikitext);
    expect(templates.map((t) => t.type)).toEqual(['see', 'sleep', 'sleep', 'eat']);
    const listing = toListing(templates[0]);
    expect(listing.name).toBe('City Palace');
    expect(listing.lat).toBeCloseTo(24.576);
    expect(listing.description).toContain('Lake Pichola');
  });

  it('splits only on top-level pipes', () => {
    const fields = splitArgs(' name=[[A|B]] | content=x {{y|z}} | price=₹5');
    expect(fields).toEqual({ name: '[[A|B]]', content: 'x {{y|z}}', price: '₹5' });
  });

  it('parses rupee prices', () => {
    expect(parseInrPrice('₹2,000-3,500')).toBe(2000);
    expect(parseInrPrice('Rs 650 per night')).toBe(650);
    expect(parseInrPrice('From ₹ 800')).toBe(800);
    expect(parseInrPrice('US$40')).toBeUndefined();
  });

  it('strips markup', () => {
    expect(plain("'''Bold''' [[Target|text]] <ref>x</ref>")).toBe('Bold text');
  });

  it('turns "Other destinations" markers into highlights with coordinates', () => {
    const { destinationMarkers } = require('../services/wikivoyageService');
    const region = '==Other destinations==\n* {{marker|type=go|zoom=15\n| name=[[Anjuna]]\n|lat=15.58092 |long=73.74484\n}} &mdash; a town in Goa with Anjuna Beach\n==Understand==';
    expect(destinationMarkers(region)).toEqual([
      expect.objectContaining({ name: 'Anjuna', lat: 15.58092, lon: 73.74484, description: 'a town in Goa with Anjuna Beach' })
    ]);
  });

  it('finds sub-destinations of region articles', () => {
    const region = '==Cities==\n* [[Panaji]]\n* [[Margao|Madgaon]]\n==Other destinations==\n* [[Calangute]]\n==Understand==\n[[Not this]]';
    expect(regionCityLinks(region)).toEqual(['Calangute', 'Panaji', 'Margao']);
    expect(regionCityLinks(region, { highlightsFirst: false })).toEqual(['Panaji', 'Calangute', 'Margao']);
  });
});
