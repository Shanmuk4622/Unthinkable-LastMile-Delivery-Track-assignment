/**
 * Seed fixtures — the demo network.
 *
 * Six zones across three Indian metros, with real pincodes and real
 * coordinates, so that "detect the zone" and "find the nearest agent" have
 * something meaningful to chew on rather than synthetic points on a grid.
 */

export interface ZoneFixture {
  code: string;
  name: string;
  city: string;
  state: string;
  description: string;
  centerLat: number;
  centerLng: number;
  areas: Array<{ pincode: string; name: string; lat: number; lng: number }>;
}

export const ZONES: ZoneFixture[] = [
  {
    code: 'BLR-C',
    name: 'Central Bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    description: 'CBD, MG Road, Shivajinagar — highest order density, tight delivery windows.',
    centerLat: 12.9716,
    centerLng: 77.5946,
    areas: [
      { pincode: '560001', name: 'MG Road', lat: 12.9752, lng: 77.6069 },
      { pincode: '560002', name: 'Bangalore GPO', lat: 12.9634, lng: 77.5855 },
      { pincode: '560025', name: 'Richmond Town', lat: 12.9591, lng: 77.6008 },
      { pincode: '560051', name: 'Shivajinagar', lat: 12.9861, lng: 77.6055 },
    ],
  },
  {
    code: 'BLR-S',
    name: 'South Bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    description: 'Koramangala, Jayanagar, JP Nagar — dense residential + D2C warehouses.',
    centerLat: 12.9279,
    centerLng: 77.6271,
    areas: [
      { pincode: '560034', name: 'Koramangala', lat: 12.9352, lng: 77.6245 },
      { pincode: '560011', name: 'Jayanagar', lat: 12.9299, lng: 77.5826 },
      { pincode: '560078', name: 'JP Nagar', lat: 12.9063, lng: 77.5857 },
      { pincode: '560029', name: 'Bannerghatta Road', lat: 12.9165, lng: 77.5995 },
      { pincode: '560076', name: 'BTM Layout', lat: 12.9166, lng: 77.6101 },
    ],
  },
  {
    code: 'BLR-E',
    name: 'East Bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    description: 'Whitefield, Marathahalli, Indiranagar — tech parks and B2B bulk pickups.',
    centerLat: 12.9698,
    centerLng: 77.7500,
    areas: [
      { pincode: '560066', name: 'Whitefield', lat: 12.9698, lng: 77.7499 },
      { pincode: '560037', name: 'Marathahalli', lat: 12.9569, lng: 77.7011 },
      { pincode: '560038', name: 'Indiranagar', lat: 12.9784, lng: 77.6408 },
      { pincode: '560048', name: 'Kadugodi', lat: 12.9962, lng: 77.7606 },
    ],
  },
  {
    code: 'BLR-N',
    name: 'North Bengaluru',
    city: 'Bengaluru',
    state: 'Karnataka',
    description: 'Hebbal, Yelahanka, airport corridor — long hauls, fewer drops per trip.',
    centerLat: 13.0827,
    centerLng: 77.5877,
    areas: [
      { pincode: '560024', name: 'Hebbal', lat: 13.0358, lng: 77.5970 },
      { pincode: '560064', name: 'Yelahanka', lat: 13.1007, lng: 77.5963 },
      { pincode: '560092', name: 'Sahakar Nagar', lat: 13.0631, lng: 77.5851 },
      { pincode: '560300', name: 'Devanahalli / KIAL', lat: 13.1986, lng: 77.7066 },
    ],
  },
  {
    code: 'HYD-C',
    name: 'Central Hyderabad',
    city: 'Hyderabad',
    state: 'Telangana',
    description: 'Banjara Hills, Begumpet, HITEC City — the primary inter-city lane from BLR.',
    centerLat: 17.4239,
    centerLng: 78.4483,
    areas: [
      { pincode: '500034', name: 'Banjara Hills', lat: 17.4126, lng: 78.4482 },
      { pincode: '500016', name: 'Begumpet', lat: 17.4435, lng: 78.4645 },
      { pincode: '500081', name: 'HITEC City', lat: 17.4435, lng: 78.3772 },
      { pincode: '500032', name: 'Gachibowli', lat: 17.4401, lng: 78.3489 },
    ],
  },
  {
    code: 'MUM-W',
    name: 'West Mumbai',
    city: 'Mumbai',
    state: 'Maharashtra',
    description: 'Andheri, Bandra, Goregaon — highest-value B2B lane, premium rate card.',
    centerLat: 19.1136,
    centerLng: 72.8697,
    areas: [
      { pincode: '400053', name: 'Andheri West', lat: 19.1364, lng: 72.8296 },
      { pincode: '400050', name: 'Bandra West', lat: 19.0596, lng: 72.8295 },
      { pincode: '400063', name: 'Goregaon East', lat: 19.1663, lng: 72.8526 },
      { pincode: '400069', name: 'Andheri East', lat: 19.1136, lng: 72.8697 },
    ],
  },
];

// ---------------------------------------------------------------------------
//  Pricing
// ---------------------------------------------------------------------------

export interface RateCardFixture {
  name: string;
  orderType: 'B2B' | 'B2C';
  scope: 'INTRA_ZONE' | 'INTER_ZONE';
  fromZoneCode?: string;
  toZoneCode?: string;
  baseWeightKg: number;
  basePrice: number;
  incrementalWeightKg: number;
  incrementalPrice: number;
  fuelSurchargePct: number;
  gstPct: number;
  handlingFee: number;
  priority: number;
}

/**
 * Four generic cards (2 order types x 2 scopes) plus two lane overrides that
 * demonstrate the resolution precedence rules.
 *
 * B2C pays more per kilo than B2B — a business shipping volume negotiates a
 * lower rate but a higher entry slab, which is exactly how real contracts work.
 */
export const RATE_CARDS: RateCardFixture[] = [
  {
    name: 'B2C Local — standard',
    orderType: 'B2C',
    scope: 'INTRA_ZONE',
    baseWeightKg: 0.5,
    basePrice: 49,
    incrementalWeightKg: 0.5,
    incrementalPrice: 22,
    fuelSurchargePct: 6,
    gstPct: 18,
    handlingFee: 0,
    priority: 50,
  },
  {
    name: 'B2C Regional — standard',
    orderType: 'B2C',
    scope: 'INTER_ZONE',
    baseWeightKg: 0.5,
    basePrice: 79,
    incrementalWeightKg: 0.5,
    incrementalPrice: 38,
    fuelSurchargePct: 8,
    gstPct: 18,
    handlingFee: 10,
    priority: 50,
  },
  {
    name: 'B2B Local — contract',
    orderType: 'B2B',
    scope: 'INTRA_ZONE',
    baseWeightKg: 5,
    basePrice: 180,
    incrementalWeightKg: 1,
    incrementalPrice: 18,
    fuelSurchargePct: 6,
    gstPct: 18,
    handlingFee: 25,
    priority: 50,
  },
  {
    name: 'B2B Regional — contract',
    orderType: 'B2B',
    scope: 'INTER_ZONE',
    baseWeightKg: 5,
    basePrice: 320,
    incrementalWeightKg: 1,
    incrementalPrice: 28,
    fuelSurchargePct: 8,
    gstPct: 18,
    handlingFee: 40,
    priority: 50,
  },
  {
    name: 'B2B Bengaluru → Mumbai express lane',
    orderType: 'B2B',
    scope: 'INTER_ZONE',
    fromZoneCode: 'BLR-E',
    toZoneCode: 'MUM-W',
    baseWeightKg: 5,
    basePrice: 460,
    incrementalWeightKg: 1,
    incrementalPrice: 34,
    fuelSurchargePct: 10,
    gstPct: 18,
    handlingFee: 60,
    priority: 100,
  },
  {
    name: 'B2C Bengaluru → Hyderabad promo',
    orderType: 'B2C',
    scope: 'INTER_ZONE',
    fromZoneCode: 'BLR-S',
    toZoneCode: 'HYD-C',
    baseWeightKg: 1,
    basePrice: 69,
    incrementalWeightKg: 0.5,
    incrementalPrice: 32,
    fuelSurchargePct: 8,
    gstPct: 18,
    handlingFee: 0,
    priority: 100,
  },
];

export const COD_RULES = [
  {
    orderType: 'B2C' as const,
    flatFee: 40,
    percentOfValue: 1.5,
    minFee: 40,
    maxFee: 500,
  },
  {
    orderType: 'B2B' as const,
    flatFee: 90,
    percentOfValue: 1,
    minFee: 90,
    maxFee: 2500,
  },
];

// ---------------------------------------------------------------------------
//  People
// ---------------------------------------------------------------------------

export const CUSTOMERS = [
  {
    email: 'customer@swiftroute.dev',
    fullName: 'Ananya Rao',
    phone: '+919845012345',
    companyName: null,
  },
  { email: 'rahul.menon@example.com', fullName: 'Rahul Menon', phone: '+919845112233', companyName: null },
  { email: 'priya.sharma@example.com', fullName: 'Priya Sharma', phone: '+919845223344', companyName: null },
  {
    email: 'ops@nimbuselectronics.in',
    fullName: 'Vikram Iyer',
    phone: '+919845334455',
    companyName: 'Nimbus Electronics Pvt Ltd',
  },
  {
    email: 'dispatch@harvestfoods.in',
    fullName: 'Meera Krishnan',
    phone: '+919845445566',
    companyName: 'Harvest Foods India',
  },
  { email: 'arjun.desai@example.com', fullName: 'Arjun Desai', phone: '+919845556677', companyName: null },
];

export interface AgentFixture {
  email: string;
  fullName: string;
  phone: string;
  vehicleType: 'BIKE' | 'SCOOTER' | 'VAN' | 'TRUCK';
  vehicleNumber: string;
  zoneCode: string;
  availability: 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';
  maxConcurrentOrders: number;
  lat: number;
  lng: number;
  totalDelivered: number;
  totalFailed: number;
  ratingAvg: number;
}

export const AGENTS: AgentFixture[] = [
  {
    email: 'agent@swiftroute.dev',
    fullName: 'Kiran Kumar',
    phone: '+919900112233',
    vehicleType: 'BIKE',
    vehicleNumber: 'KA-01-HH-4521',
    zoneCode: 'BLR-S',
    availability: 'AVAILABLE',
    maxConcurrentOrders: 5,
    lat: 12.9352,
    lng: 77.6245,
    totalDelivered: 142,
    totalFailed: 6,
    ratingAvg: 4.8,
  },
  {
    email: 'deepa.n@swiftroute.dev',
    fullName: 'Deepa Nair',
    phone: '+919900223344',
    vehicleType: 'SCOOTER',
    vehicleNumber: 'KA-05-MJ-8890',
    zoneCode: 'BLR-C',
    availability: 'AVAILABLE',
    maxConcurrentOrders: 6,
    lat: 12.9752,
    lng: 77.6069,
    totalDelivered: 208,
    totalFailed: 4,
    ratingAvg: 4.9,
  },
  {
    email: 'sameer.k@swiftroute.dev',
    fullName: 'Sameer Khan',
    phone: '+919900334455',
    vehicleType: 'VAN',
    vehicleNumber: 'KA-03-AB-1177',
    zoneCode: 'BLR-E',
    availability: 'AVAILABLE',
    maxConcurrentOrders: 8,
    lat: 12.9698,
    lng: 77.7499,
    totalDelivered: 96,
    totalFailed: 9,
    ratingAvg: 4.4,
  },
  {
    email: 'lakshmi.p@swiftroute.dev',
    fullName: 'Lakshmi Prasad',
    phone: '+919900445566',
    vehicleType: 'BIKE',
    vehicleNumber: 'KA-04-CD-6633',
    zoneCode: 'BLR-N',
    availability: 'AVAILABLE',
    maxConcurrentOrders: 5,
    lat: 13.0358,
    lng: 77.5970,
    totalDelivered: 74,
    totalFailed: 3,
    ratingAvg: 4.7,
  },
  {
    email: 'imran.s@swiftroute.dev',
    fullName: 'Imran Sheikh',
    phone: '+919900556677',
    vehicleType: 'TRUCK',
    vehicleNumber: 'TS-09-EF-2244',
    zoneCode: 'HYD-C',
    availability: 'AVAILABLE',
    maxConcurrentOrders: 10,
    lat: 17.4126,
    lng: 78.4482,
    totalDelivered: 51,
    totalFailed: 2,
    ratingAvg: 4.6,
  },
  {
    email: 'nisha.r@swiftroute.dev',
    fullName: 'Nisha Rane',
    phone: '+919900667788',
    vehicleType: 'VAN',
    vehicleNumber: 'MH-02-GH-9012',
    zoneCode: 'MUM-W',
    availability: 'ON_BREAK',
    maxConcurrentOrders: 7,
    lat: 19.1364,
    lng: 72.8296,
    totalDelivered: 63,
    totalFailed: 5,
    ratingAvg: 4.5,
  },
];
