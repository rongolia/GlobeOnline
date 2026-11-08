import type { CountryDescription } from './countries';
import { flagEmoji } from './flags';

/**
 * Impossible country dataset: everything else on the globe.
 *
 * The long tail - every one of the remaining features the map draws, from countries down
 * to the scattered island territories, once the easy, medium and hard groups have taken
 * their thirty. It exists so no country is a blank: hover one before a game and it still has a
 * name, a flag and something to say.
 *
 * ONE FACT EACH, deliberately. The other three groups carry three because the game walks
 * them backwards as a ladder of clues that gets easier with every miss. There is nothing
 * to ration here, and three good facts about every country on Earth would mean writing a
 * great many weak ones. Nothing had to change to allow it: the ladder is derived from the
 * length of funFacts, so one fact simply makes a shorter ladder - the fact, then the
 * flag, then the name.
 *
 * The "only the first fact may name a place or a landmark" rule still holds, and is
 * simply vacuous here: the one fact IS the first. That matters - for most of these
 * countries a landmark is the only thing a player would have to go on.
 */

// [map name, ISO numeric, display name, the one fact]
const ROWS: [string, string, string, string][] = [
  ['Afghanistan', '004', 'Afghanistan', 'Most of the country is mountainous, crossed by the Hindu Kush range.'],
  ['Albania', '008', 'Albania', 'A nod of the head traditionally means "no" and a shake means "yes".'],
  ['Algeria', '012', 'Algeria', 'The largest country in Africa by area.'],
  ['Angola', '024', 'Angola', "Portuguese is the official language, and Luanda is one of Africa's largest Portuguese-speaking cities."],
  ['Antarctica', '010', 'Antarctica', 'The coldest, windiest and driest continent, shared for science under an international treaty.'],
  ['Armenia', '051', 'Armenia', 'The first country to adopt Christianity as a state religion, in 301 AD.'],
  ['Austria', '040', 'Austria', 'Mozart was born in Salzburg.'],
  ['Azerbaijan', '031', 'Azerbaijan', 'Nicknamed the "Land of Fire" for its naturally burning gas vents.'],
  ['Bahamas', '044', 'Bahamas', 'A chain of hundreds of low coral islands scattered across clear, shallow water.'],
  ['Bangladesh', '050', 'Bangladesh', 'Shares the Sundarbans, the largest mangrove forest in the world, with India.'],
  ['Belarus', '112', 'Belarus', "Białowieża Forest, one of Europe's last primeval forests, straddles its border with Poland."],
  ['Belgium', '056', 'Belgium', 'Famous for chocolate, waffles and comics like Tintin.'],
  ['Belize', '084', 'Belize', 'Its barrier reef is the second-longest in the world.'],
  ['Benin', '204', 'Benin', 'Considered the birthplace of the Vodun (Voodoo) religion.'],
  ['Bhutan', '064', 'Bhutan', 'Measures its progress with Gross National Happiness.'],
  ['Bosnia and Herz.', '070', 'Bosnia and Herzegovina', "Mostar's Old Bridge is a famous Ottoman-era landmark."],
  ['Botswana', '072', 'Botswana', 'Home to the Okavango Delta, a huge inland river delta full of wildlife.'],
  ['Brunei', '096', 'Brunei', "The Sultan's palace is one of the largest residential palaces in the world."],
  ['Bulgaria', '100', 'Bulgaria', 'A nod traditionally means "no" and a head shake means "yes".'],
  ['Burkina Faso', '854', 'Burkina Faso', 'Its name means "land of upright people".'],
  ['Burundi', '108', 'Burundi', 'Borders Lake Tanganyika, one of the deepest lakes in the world.'],
  ['Cambodia', '116', 'Cambodia', 'Angkor Wat is the largest religious monument in the world.'],
  ['Cameroon', '120', 'Cameroon', 'Often called "Africa in miniature" for its variety of landscapes.'],
  ['Central African Rep.', '140', 'Central African Republic', 'Sits close to the geographic centre of Africa.'],
  ['Chad', '148', 'Chad', 'Named after a large lake that has shrunk dramatically since the 1960s.'],
  ['Chile', '152', 'Chile', 'The Atacama Desert is one of the driest places on Earth.'],
  ['Colombia', '170', 'Colombia', 'One of the most biodiverse countries, with more bird species than almost anywhere else.'],
  ['Congo', '178', 'Republic of the Congo', "Its capital faces another country's capital directly across a great river."],
  ['Costa Rica', '188', 'Costa Rica', 'Abolished its army in 1948.'],
  ["Côte d'Ivoire", '384', "Côte d'Ivoire", "The world's largest producer of cocoa beans."],
  ['Croatia', '191', 'Croatia', 'The necktie is said to come from the scarves once worn by its soldiers.'],
  ['Cuba', '192', 'Cuba', 'The largest island in the Caribbean.'],
  ['Cyprus', '196', 'Cyprus', 'Legend says it is the birthplace of Aphrodite.'],
  ['Czechia', '203', 'Czechia', 'Drinks more beer per person than any other country.'],
  ['Dem. Rep. Congo', '180', 'Democratic Republic of the Congo', 'The river it takes its name from is the deepest in the world.'],
  ['Denmark', '208', 'Denmark', 'LEGO was invented here.'],
  ['Djibouti', '262', 'Djibouti', 'Lake Assal is the lowest point in Africa.'],
  ['Dominican Rep.', '214', 'Dominican Republic', 'Santo Domingo is the oldest continuously inhabited European settlement in the Americas.'],
  ['Ecuador', '218', 'Ecuador', 'Named after the equator, and the Galápagos Islands belong to it.'],
  ['El Salvador', '222', 'El Salvador', 'The smallest country in Central America by area.'],
  ['Eq. Guinea', '226', 'Equatorial Guinea', 'The only African country with Spanish as an official language.'],
  ['Eritrea', '232', 'Eritrea', 'Asmara is famous for its Italian modernist architecture.'],
  ['Estonia', '233', 'Estonia', 'One of the most digital societies, with online voting since 2005.'],
  ['eSwatini', '748', 'Eswatini', 'One of the last absolute monarchies in the world.'],
  ['Ethiopia', '231', 'Ethiopia', 'Uses its own calendar, which runs about seven to eight years behind the Gregorian one.'],
  ['Falkland Is.', '238', 'Falkland Islands', 'A windswept South Atlantic group of islands with far more sheep than people.'],
  ['Fiji', '242', 'Fiji', 'More than 300 islands, famous for coral reefs and a fierce love of rugby.'],
  ['Finland', '246', 'Finland', 'Has more than 180,000 lakes.'],
  ['Fr. S. Antarctic Lands', '260', 'French Southern and Antarctic Lands', 'Scattered islands near the polar ice with no permanent residents, only visiting researchers.'],
  ['Gabon', '266', 'Gabon', 'Most of the country is covered by rainforest.'],
  ['Gambia', '270', 'The Gambia', 'The smallest country on mainland Africa.'],
  ['Georgia', '268', 'Georgia', 'One of the oldest wine-making regions in the world, with an 8,000-year tradition.'],
  ['Ghana', '288', 'Ghana', 'In 1957 it became the first sub-Saharan African colony to gain independence.'],
  ['Greece', '300', 'Greece', 'Birthplace of democracy and the Olympic Games.'],
  ['Greenland', '304', 'Greenland', "The largest island in the world that isn't a continent."],
  ['Guatemala', '320', 'Guatemala', 'Tikal was one of the largest cities of the ancient Maya.'],
  ['Guinea', '324', 'Guinea', 'Several major West African rivers, including the Niger, rise in its highlands.'],
  ['Guinea-Bissau', '624', 'Guinea-Bissau', 'The Bijagós Archipelago off its coast has dozens of islands.'],
  ['Guyana', '328', 'Guyana', 'The only South American country with English as its official language.'],
  ['Haiti', '332', 'Haiti', 'In 1804 it became the first independent nation in Latin America and the Caribbean.'],
  ['Honduras', '340', 'Honduras', 'The ancient Maya city of Copán is in its western highlands.'],
  ['Hungary', '348', 'Hungary', 'Lake Balaton is the largest lake in Central Europe.'],
  ['Iceland', '352', 'Iceland', 'There are no mosquitoes.'],
  ['Iran', '364', 'Iran', "Home to one of the world's oldest continuous major civilisations."],
  ['Iraq', '368', 'Iraq', 'Mesopotamia, between the Tigris and Euphrates, is called a cradle of civilisation.'],
  ['Ireland', '372', 'Ireland', 'Halloween traces its roots to the Celtic festival of Samhain.'],
  ['Israel', '376', 'Israel', 'The Dead Sea, on its border, is the lowest point on land.'],
  ['Jamaica', '388', 'Jamaica', 'The birthplace of reggae, and home to some of the fastest sprinters in history.'],
  ['Jordan', '400', 'Jordan', 'Home to Petra, the ancient city carved into rose-red rock.'],
  ['Kenya', '404', 'Kenya', 'The Great Rift Valley runs right through it.'],
  ['Kosovo', '174', 'Kosovo', 'Has one of the youngest populations in Europe.'],
  ['Kuwait', '414', 'Kuwait', 'Its currency is the highest-valued currency unit in the world.'],
  ['Kyrgyzstan', '417', 'Kyrgyzstan', 'Issyk-Kul is one of the largest mountain lakes, and it never freezes.'],
  ['Laos', '418', 'Laos', 'The only landlocked country in Southeast Asia.'],
  ['Latvia', '428', 'Latvia', 'Riga has one of the largest collections of Art Nouveau buildings in the world.'],
  ['Lebanon', '422', 'Lebanon', 'The cedar tree on its flag has been a national symbol for millennia.'],
  ['Lesotho', '426', 'Lesotho', "Entirely surrounded by South Africa, and its lowest point is higher than any other country's."],
  ['Liberia', '430', 'Liberia', "Africa's oldest republic, founded in 1847."],
  ['Libya', '434', 'Libya', 'More than 90% of the country is desert.'],
  ['Lithuania', '440', 'Lithuania', 'Basketball is often called its second religion.'],
  ['Luxembourg', '442', 'Luxembourg', "The world's only remaining Grand Duchy."],
  ['Macedonia', '807', 'North Macedonia', 'Lake Ohrid is one of the oldest lakes in Europe.'],
  ['Malawi', '454', 'Malawi', 'The lake that shares its name has more fish species than any other lake.'],
  ['Malaysia', '458', 'Malaysia', 'Home to the Petronas Twin Towers in Kuala Lumpur.'],
  ['Mauritania', '478', 'Mauritania', 'Home to the Eye of the Sahara, a giant circular rock formation visible from space.'],
  ['Moldova', '498', 'Moldova', 'Mileștii Mici is the largest wine cellar in the world by number of bottles.'],
  ['Montenegro', '499', 'Montenegro', 'Its name means "Black Mountain".'],
  ['Morocco', '504', 'Morocco', 'Fez is home to al-Qarawiyyin, often called the oldest existing university.'],
  ['Mozambique', '508', 'Mozambique', 'Its flag is the only national flag featuring a modern rifle.'],
  ['N. Cyprus', '160', 'Northern Cyprus', 'Covers the northern part of a Mediterranean island.'],
  ['Nepal', '524', 'Nepal', 'Home to Mount Everest, and its flag is the only non-rectangular national flag.'],
  ['Netherlands', '528', 'Netherlands', 'About a quarter of the country lies below sea level.'],
  ['New Caledonia', '540', 'New Caledonia', 'A Pacific territory ringed by one of the largest coral lagoons in the world.'],
  ['New Zealand', '554', 'New Zealand', 'In 1893 it became the first country where women won the right to vote.'],
  ['Nicaragua', '558', 'Nicaragua', 'Home to the largest lake in Central America.'],
  ['Niger', '562', 'Niger', 'Named after the great river that flows through it.'],
  ['Nigeria', '566', 'Nigeria', 'The most populous country in Africa.'],
  ['North Korea', '408', 'North Korea', 'Most of the country is mountainous.'],
  ['Norway', '578', 'Norway', 'Famous for its fjords, and the Nobel Peace Prize is awarded in Oslo.'],
  ['Oman', '512', 'Oman', 'Frankincense has been traded from its southern region for thousands of years.'],
  ['Pakistan', '586', 'Pakistan', 'K2, the second-highest mountain on Earth, is on its border with China.'],
  ['Palestine', '275', 'Palestine', 'Jericho is one of the oldest continuously inhabited cities in the world.'],
  ['Panama', '591', 'Panama', 'Its famous canal links the Atlantic and Pacific oceans.'],
  ['Paraguay', '600', 'Paraguay', "Shares the Itaipu Dam, one of the world's largest hydroelectric plants, with Brazil."],
  ['Peru', '604', 'Peru', 'Home to Machu Picchu, the 15th-century Inca citadel.'],
  ['Philippines', '608', 'Philippines', 'Made up of more than 7,000 islands.'],
  ['Poland', '616', 'Poland', 'The Wieliczka Salt Mine has whole chapels carved out of salt.'],
  ['Portugal', '620', 'Portugal', 'Its borders have stayed almost unchanged since the 13th century.'],
  ['Puerto Rico', '630', 'Puerto Rico', 'A Caribbean island whose mountain rainforest is kept as a national forest.'],
  ['Qatar', '634', 'Qatar', 'Hosted the FIFA World Cup in 2022.'],
  ['Romania', '642', 'Romania', 'Bran Castle is linked to the legend of Dracula.'],
  ['Rwanda', '646', 'Rwanda', 'Known as the "land of a thousand hills".'],
  ['S. Sudan', '728', 'South Sudan', "The world's youngest country, independent since 2011."],
  ['Saudi Arabia', '682', 'Saudi Arabia', 'Has no permanent rivers.'],
  ['Senegal', '686', 'Senegal', 'Dakar is the westernmost city on the African mainland.'],
  ['Serbia', '688', 'Serbia', 'One of the largest raspberry producers in the world.'],
  ['Sierra Leone', '694', 'Sierra Leone', 'Freetown has one of the largest natural harbours in the world.'],
  ['Slovakia', '703', 'Slovakia', 'Bratislava is the only capital that borders two other countries.'],
  ['Slovenia', '705', 'Slovenia', 'More than half of the country is covered by forest.'],
  ['Solomon Is.', '090', 'Solomon Islands', 'Made up of hundreds of islands in the South Pacific.'],
  ['Somalia', '706', 'Somalia', 'Has the longest coastline in mainland Africa.'],
  ['Somaliland', '167', 'Somaliland', 'The Laas Geel caves hold some of the oldest known rock art in the Horn of Africa.'],
  ['South Korea', '410', 'South Korea', 'Its alphabet, Hangul, was created in the 15th century.'],
  ['Sri Lanka', '144', 'Sri Lanka', "One of the world's largest exporters of tea."],
  ['Sudan', '729', 'Sudan', 'Has more ancient pyramids than Egypt.'],
  ['Suriname', '740', 'Suriname', 'The smallest country in South America.'],
  ['Sweden', '752', 'Sweden', 'Has more islands than almost any other country.'],
  ['Switzerland', '756', 'Switzerland', 'Has four national languages.'],
  ['Syria', '760', 'Syria', 'Damascus is one of the oldest continuously inhabited cities in the world.'],
  ['Taiwan', '158', 'Taiwan', "A mountainous island that makes most of the world's most advanced computer chips."],
  ['Tajikistan', '762', 'Tajikistan', 'More than 90% of the country is mountains.'],
  ['Tanzania', '834', 'Tanzania', "Home to Mount Kilimanjaro, Africa's highest peak."],
  ['Timor-Leste', '626', 'Timor-Leste', "One of the world's youngest countries, independent since 2002."],
  ['Togo', '768', 'Togo', 'Its capital, Lomé, is also its main port on the Gulf of Guinea.'],
  ['Trinidad and Tobago', '780', 'Trinidad and Tobago', 'Twin islands famous for carnival and for the steelpan, invented there in the 1930s.'],
  ['Tunisia', '788', 'Tunisia', 'Parts of Star Wars were filmed in its desert.'],
  ['Turkmenistan', '795', 'Turkmenistan', 'Home to the Darvaza gas crater, nicknamed the "Door to Hell".'],
  ['Uganda', '800', 'Uganda', "Home to about half of the world's mountain gorillas."],
  ['Ukraine', '804', 'Ukraine', 'The largest country entirely within Europe.'],
  ['United Arab Emirates', '784', 'United Arab Emirates', 'Home to the Burj Khalifa, the tallest building in the world.'],
  ['Uruguay', '858', 'Uruguay', 'Hosted and won the very first FIFA World Cup in 1930.'],
  ['Vanuatu', '548', 'Vanuatu', 'A volcanic island chain in the Pacific, among the most disaster-prone places on Earth.'],
  ['Venezuela', '862', 'Venezuela', 'Home to Angel Falls, the tallest uninterrupted waterfall in the world.'],
  ['Vietnam', '704', 'Vietnam', 'One of the largest coffee producers in the world.'],
  ['W. Sahara', '732', 'Western Sahara', "A sparsely populated, mostly desert territory on Africa's Atlantic coast."],
  ['Yemen', '887', 'Yemen', "Shibam's mudbrick high-rises earned it the nickname \"Manhattan of the Desert\"."],
  ['Zimbabwe', '716', 'Zimbabwe', 'Shares Victoria Falls with Zambia.'],
];

export const IMPOSSIBLE_COUNTRY_DESCRIPTIONS: CountryDescription[] = ROWS.map(
  ([name, isoNumeric, displayName, funFact]) => ({
    name,
    displayName,
    isoNumeric,
    flag: flagEmoji(isoNumeric),
    funFacts: [funFact],
  })
);

const BY_NAME = new Map(IMPOSSIBLE_COUNTRY_DESCRIPTIONS.map((d) => [d.name.toLowerCase(), d]));

/** Looks up a country in the impossible set by its map name (case-insensitive). */
export function getImpossibleCountryDescription(name: string): CountryDescription | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}
