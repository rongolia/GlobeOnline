/**
 * Flag emoji for the countries drawn on the globe.
 *
 * The datasets key countries by ISO 3166-1 *numeric* code (that is also the map feature
 * id in world-atlas), but a flag emoji is built from the *alpha-2* code, so the two have
 * to be bridged by a table - there is no arithmetic relation between them.
 */

/**
 * ISO 3166-1 numeric -> alpha-2, covering every country the map draws.
 *
 * Three of the territories on the map have no ISO alpha-2 code at all and so are
 * deliberately absent: 160 Northern Cyprus, 167 Somaliland and 174 Kosovo. (Kosovo is
 * often written XK, but that is user-assigned rather than ISO, and Unicode defines no
 * flag for it.) flagEmoji() returns '' for those rather than rendering tofu.
 */
const ALPHA2_BY_NUMERIC: Record<string, string> = {
  '004': 'AF', // Afghanistan
  '008': 'AL', // Albania
  '010': 'AQ', // Antarctica
  '012': 'DZ', // Algeria
  '024': 'AO', // Angola
  '031': 'AZ', // Azerbaijan
  '032': 'AR', // Argentina
  '036': 'AU', // Australia
  '040': 'AT', // Austria
  '044': 'BS', // Bahamas
  '050': 'BD', // Bangladesh
  '051': 'AM', // Armenia
  '056': 'BE', // Belgium
  '064': 'BT', // Bhutan
  '068': 'BO', // Bolivia
  '070': 'BA', // Bosnia and Herzegovina
  '072': 'BW', // Botswana
  '076': 'BR', // Brazil
  '084': 'BZ', // Belize
  '090': 'SB', // Solomon Islands
  '096': 'BN', // Brunei
  '100': 'BG', // Bulgaria
  '104': 'MM', // Myanmar
  '108': 'BI', // Burundi
  '112': 'BY', // Belarus
  '116': 'KH', // Cambodia
  '120': 'CM', // Cameroon
  '124': 'CA', // Canada
  '140': 'CF', // Central African Republic
  '144': 'LK', // Sri Lanka
  '148': 'TD', // Chad
  '152': 'CL', // Chile
  '156': 'CN', // China
  '158': 'TW', // Taiwan
  '170': 'CO', // Colombia
  '178': 'CG', // Congo
  '180': 'CD', // DR Congo
  '188': 'CR', // Costa Rica
  '191': 'HR', // Croatia
  '192': 'CU', // Cuba
  '196': 'CY', // Cyprus
  '203': 'CZ', // Czechia
  '204': 'BJ', // Benin
  '208': 'DK', // Denmark
  '214': 'DO', // Dominican Republic
  '218': 'EC', // Ecuador
  '222': 'SV', // El Salvador
  '226': 'GQ', // Equatorial Guinea
  '231': 'ET', // Ethiopia
  '232': 'ER', // Eritrea
  '233': 'EE', // Estonia
  '238': 'FK', // Falkland Islands
  '242': 'FJ', // Fiji
  '246': 'FI', // Finland
  '250': 'FR', // France
  '260': 'TF', // French Southern and Antarctic Lands
  '262': 'DJ', // Djibouti
  '266': 'GA', // Gabon
  '268': 'GE', // Georgia
  '270': 'GM', // Gambia
  '275': 'PS', // Palestine
  '276': 'DE', // Germany
  '288': 'GH', // Ghana
  '300': 'GR', // Greece
  '304': 'GL', // Greenland
  '320': 'GT', // Guatemala
  '324': 'GN', // Guinea
  '328': 'GY', // Guyana
  '332': 'HT', // Haiti
  '340': 'HN', // Honduras
  '348': 'HU', // Hungary
  '352': 'IS', // Iceland
  '356': 'IN', // India
  '360': 'ID', // Indonesia
  '364': 'IR', // Iran
  '368': 'IQ', // Iraq
  '372': 'IE', // Ireland
  '376': 'IL', // Israel
  '380': 'IT', // Italy
  '384': 'CI', // Côte d'Ivoire
  '388': 'JM', // Jamaica
  '392': 'JP', // Japan
  '398': 'KZ', // Kazakhstan
  '400': 'JO', // Jordan
  '404': 'KE', // Kenya
  '408': 'KP', // North Korea
  '410': 'KR', // South Korea
  '414': 'KW', // Kuwait
  '417': 'KG', // Kyrgyzstan
  '418': 'LA', // Laos
  '422': 'LB', // Lebanon
  '426': 'LS', // Lesotho
  '428': 'LV', // Latvia
  '430': 'LR', // Liberia
  '434': 'LY', // Libya
  '440': 'LT', // Lithuania
  '442': 'LU', // Luxembourg
  '450': 'MG', // Madagascar
  '454': 'MW', // Malawi
  '458': 'MY', // Malaysia
  '466': 'ML', // Mali
  '478': 'MR', // Mauritania
  '484': 'MX', // Mexico
  '496': 'MN', // Mongolia
  '498': 'MD', // Moldova
  '499': 'ME', // Montenegro
  '504': 'MA', // Morocco
  '508': 'MZ', // Mozambique
  '512': 'OM', // Oman
  '516': 'NA', // Namibia
  '524': 'NP', // Nepal
  '528': 'NL', // Netherlands
  '540': 'NC', // New Caledonia
  '548': 'VU', // Vanuatu
  '554': 'NZ', // New Zealand
  '558': 'NI', // Nicaragua
  '562': 'NE', // Niger
  '566': 'NG', // Nigeria
  '578': 'NO', // Norway
  '586': 'PK', // Pakistan
  '591': 'PA', // Panama
  '598': 'PG', // Papua New Guinea
  '600': 'PY', // Paraguay
  '604': 'PE', // Peru
  '608': 'PH', // Philippines
  '616': 'PL', // Poland
  '620': 'PT', // Portugal
  '624': 'GW', // Guinea-Bissau
  '626': 'TL', // Timor-Leste
  '630': 'PR', // Puerto Rico
  '634': 'QA', // Qatar
  '642': 'RO', // Romania
  '643': 'RU', // Russia
  '646': 'RW', // Rwanda
  '682': 'SA', // Saudi Arabia
  '686': 'SN', // Senegal
  '688': 'RS', // Serbia
  '694': 'SL', // Sierra Leone
  '703': 'SK', // Slovakia
  '704': 'VN', // Vietnam
  '705': 'SI', // Slovenia
  '706': 'SO', // Somalia
  '710': 'ZA', // South Africa
  '716': 'ZW', // Zimbabwe
  '724': 'ES', // Spain
  '728': 'SS', // South Sudan
  '729': 'SD', // Sudan
  '732': 'EH', // Western Sahara
  '740': 'SR', // Suriname
  '748': 'SZ', // Eswatini
  '752': 'SE', // Sweden
  '756': 'CH', // Switzerland
  '760': 'SY', // Syria
  '762': 'TJ', // Tajikistan
  '764': 'TH', // Thailand
  '768': 'TG', // Togo
  '780': 'TT', // Trinidad and Tobago
  '784': 'AE', // United Arab Emirates
  '788': 'TN', // Tunisia
  '792': 'TR', // Turkey
  '795': 'TM', // Turkmenistan
  '800': 'UG', // Uganda
  '804': 'UA', // Ukraine
  '807': 'MK', // North Macedonia
  '818': 'EG', // Egypt
  '826': 'GB', // United Kingdom
  '834': 'TZ', // Tanzania
  '840': 'US', // United States
  '854': 'BF', // Burkina Faso
  '858': 'UY', // Uruguay
  '860': 'UZ', // Uzbekistan
  '862': 'VE', // Venezuela
  '887': 'YE', // Yemen
  '894': 'ZM', // Zambia
};

// 'A' -> U+1F1E6 REGIONAL INDICATOR SYMBOL LETTER A, and so on through the alphabet.
const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = 'A'.charCodeAt(0);

/**
 * Flag emoji for an ISO 3166-1 numeric code, or '' when the country has no alpha-2 code.
 * A flag emoji is just its alpha-2 code spelled in regional indicator letters.
 */
export function flagEmoji(isoNumeric: string): string {
  const alpha2 = ALPHA2_BY_NUMERIC[isoNumeric];
  if (!alpha2) return '';
  return String.fromCodePoint(
    ...[...alpha2].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A),
  );
}
