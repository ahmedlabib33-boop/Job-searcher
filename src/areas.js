// Areas of Greater Cairo people commonly search in. `query` is the location
// text sent to search engines that understand free-form places (JSearch).
export const AREAS = [
  { id: 'all', label: 'All of Greater Cairo', query: 'Cairo, Egypt' },
  { id: 'new-cairo', label: 'New Cairo / Fifth Settlement', query: 'New Cairo, Cairo, Egypt' },
  { id: 'nasr-city', label: 'Nasr City', query: 'Nasr City, Cairo, Egypt' },
  { id: 'heliopolis', label: 'Heliopolis / Sheraton', query: 'Heliopolis, Cairo, Egypt' },
  { id: 'maadi', label: 'Maadi', query: 'Maadi, Cairo, Egypt' },
  { id: 'downtown', label: 'Downtown / Garden City', query: 'Downtown, Cairo, Egypt' },
  { id: 'zamalek', label: 'Zamalek', query: 'Zamalek, Cairo, Egypt' },
  { id: 'mokattam', label: 'Mokattam', query: 'Mokattam, Cairo, Egypt' },
  { id: 'dokki-mohandessin', label: 'Dokki / Mohandessin', query: 'Dokki, Giza, Egypt' },
  { id: 'giza', label: 'Giza', query: 'Giza, Egypt' },
  { id: 'october', label: '6th of October City', query: '6th of October City, Giza, Egypt' },
  { id: 'sheikh-zayed', label: 'Sheikh Zayed', query: 'Sheikh Zayed City, Giza, Egypt' },
  { id: 'smart-village', label: 'Smart Village', query: 'Smart Village, Giza, Egypt' },
  { id: 'new-capital', label: 'New Administrative Capital', query: 'New Administrative Capital, Egypt' },
  { id: 'shorouk-obour', label: 'El Shorouk / El Obour', query: 'El Shorouk, Cairo, Egypt' },
];

export function findArea(id) {
  return AREAS.find((area) => area.id === id) ?? AREAS[0];
}
