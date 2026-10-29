// Areas of Greater Cairo people commonly search in. `query` is the location
// text for search engines that understand free-form places (JSearch, SerpApi);
// `place` is the plain place name for job boards with their own location
// lists (Careerjet, Jooble).
export const AREAS = [
  { id: 'all', label: 'All of Greater Cairo', query: 'Cairo, Egypt', place: 'Cairo' },
  { id: 'new-cairo', label: 'New Cairo / Fifth Settlement', query: 'New Cairo, Cairo, Egypt', place: 'New Cairo' },
  { id: 'nasr-city', label: 'Nasr City', query: 'Nasr City, Cairo, Egypt', place: 'Nasr City' },
  { id: 'heliopolis', label: 'Heliopolis / Sheraton', query: 'Heliopolis, Cairo, Egypt', place: 'Heliopolis' },
  { id: 'maadi', label: 'Maadi', query: 'Maadi, Cairo, Egypt', place: 'Maadi' },
  { id: 'downtown', label: 'Downtown / Garden City', query: 'Downtown, Cairo, Egypt', place: 'Cairo' },
  { id: 'zamalek', label: 'Zamalek', query: 'Zamalek, Cairo, Egypt', place: 'Zamalek' },
  { id: 'mokattam', label: 'Mokattam', query: 'Mokattam, Cairo, Egypt', place: 'Mokattam' },
  { id: 'dokki-mohandessin', label: 'Dokki / Mohandessin', query: 'Dokki, Giza, Egypt', place: 'Dokki' },
  { id: 'giza', label: 'Giza', query: 'Giza, Egypt', place: 'Giza' },
  { id: 'october', label: '6th of October City', query: '6th of October City, Giza, Egypt', place: '6th of October' },
  { id: 'sheikh-zayed', label: 'Sheikh Zayed', query: 'Sheikh Zayed City, Giza, Egypt', place: 'Sheikh Zayed' },
  { id: 'smart-village', label: 'Smart Village', query: 'Smart Village, Giza, Egypt', place: '6th of October' },
  { id: 'new-capital', label: 'New Administrative Capital', query: 'New Administrative Capital, Egypt', place: 'New Administrative Capital' },
  { id: 'shorouk-obour', label: 'El Shorouk / El Obour', query: 'El Shorouk, Cairo, Egypt', place: 'El Shorouk' },
];

export function findArea(id) {
  return AREAS.find((area) => area.id === id) ?? AREAS[0];
}
