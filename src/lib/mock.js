/* Seed data for demo mode. Mirrors the shape the Supabase adapter returns. */

const H = 3600e3;
const DAY = 24 * H;
const now = Date.now();

export const SEED_ITEMS = [
  { id: "i1", type: "lost", name: "Black Lenovo Laptop", cat: "electronics", brand: "Lenovo", color: "Black",
    loc: "Main Library", spot: "2nd floor, quiet study zone", ts: now - 2 * H, status: "match", views: 214, replies: 6, urgent: true,
    desc: "Black Lenovo ThinkPad in a grey sleeve. Small blue sticker on the lid and a scratch near the trackpad.",
    unique: "Blue sticker of a satellite on the lid", owner: "Nomsa D.", mine: true, photos: 3 },
  { id: "i2", type: "found", name: "Black Lenovo laptop in sleeve", cat: "electronics", brand: "Lenovo", color: "Black",
    loc: "Main Library", spot: "Handed to the library front desk", ts: now - 3 * H, status: "active", views: 88, replies: 2,
    desc: "Found a black laptop left on a study table near the stairs. Held at the library front desk.",
    owner: "Sipho M.", photos: 2 },
  { id: "i3", type: "lost", name: "Student ID Card — Faculty of Commerce", cat: "cards", color: "Blue",
    loc: "Cafeteria", spot: "Near the till", ts: now - 5 * H, status: "active", views: 61, replies: 1, urgent: true,
    desc: "Student card in a blue lanyard. I need it for an exam on Friday.", owner: "Thando N.", mine: true, photos: 1 },
  { id: "i4", type: "found", name: "Silver key set with bottle opener", cat: "keys", color: "Silver",
    loc: "Sports Centre", spot: "Changing room bench — now at reception", ts: now - 9 * H, status: "active", views: 44, replies: 3,
    desc: "Four keys on a ring with a small bottle opener. Left at Sports Centre reception.", owner: "Lindiwe K.", photos: 2 },
  { id: "i5", type: "lost", name: "Black Nike Backpack", cat: "bags", brand: "Nike", color: "Black",
    loc: "Lecture Hall B", spot: "Back row", ts: now - 1 * DAY, status: "active", views: 132, replies: 4,
    desc: "Black Nike backpack with a white swoosh. Has notebooks and a grey charger inside.",
    unique: "Green keyring shaped like a lizard on the zip", owner: "Bongani S.", photos: 2 },
  { id: "i6", type: "found", name: "AirPods case, no earbuds", cat: "electronics", brand: "Apple", color: "White",
    loc: "ICT Lab", spot: "Lab 3, under a desk", ts: now - 1.4 * DAY, status: "active", views: 97, replies: 0,
    desc: "White charging case found under a desk. Earbuds were not inside.", owner: "Ayanda P.", photos: 1 },
  { id: "i7", type: "lost", name: "Blue Samsung Phone", cat: "electronics", brand: "Samsung", color: "Blue",
    loc: "Student Centre", spot: "Near the printing shop", ts: now - 2 * DAY, status: "recovered", views: 301, replies: 9,
    desc: "Blue Samsung A54 with a cracked corner and a clear case.", owner: "Melusi Z.", mine: true, photos: 2 },
  { id: "i8", type: "found", name: "Engineering Mathematics textbook", cat: "books", color: "Red",
    loc: "Lecture Hall B", spot: "Left on the front desk", ts: now - 2.2 * DAY, status: "active", views: 38, replies: 1,
    desc: "Thick red textbook with handwritten notes in the margins and a name partly rubbed out.", owner: "Zanele H.", photos: 1 },
  { id: "i9", type: "lost", name: "Grey Hoodie", cat: "clothing", color: "Grey",
    loc: "Sports Centre", spot: "Gym area", ts: now - 3 * DAY, status: "closed", views: 52, replies: 0,
    desc: "Plain grey hoodie, size M, small paint stain on the left sleeve.", owner: "Katlego R.", photos: 1 },
  { id: "i10", type: "found", name: "Blue insulated water bottle", cat: "bottles", color: "Blue",
    loc: "Main Library", spot: "Study room 4 — at the front desk", ts: now - 6 * H, status: "active", views: 29, replies: 0,
    desc: "Navy metal bottle with stickers on the side. Waiting at the library desk.", owner: "Sipho M.", photos: 2 },
  { id: "i11", type: "lost", name: "Scientific Calculator", cat: "electronics", brand: "Casio", color: "Black",
    loc: "Science Block", spot: "Lab 2", ts: now - 4 * DAY, status: "recovered", views: 74, replies: 3,
    desc: "Casio fx-991 with initials scratched on the back cover.", owner: "Nomsa D.", photos: 1 },
  { id: "i12", type: "found", name: "Prescription glasses in a black case", cat: "accessories", color: "Black",
    loc: "Cafeteria", spot: "Table by the window", ts: now - 20 * H, status: "active", views: 41, replies: 2,
    desc: "Thin-framed glasses inside a hard black case. At the cafeteria manager's office.", owner: "Thabo G.", photos: 1 },
  { id: "i13", type: "lost", name: "Silver bracelet", cat: "jewellery", color: "Silver",
    loc: "Residence", spot: "Block C common room", ts: now - 5 * DAY, status: "active", views: 26, replies: 1,
    desc: "Thin silver bracelet, sentimental. Small engraving on the inside.",
    unique: "Engraved date on the inside of the clasp", owner: "Phumzile M.", photos: 1 },
  { id: "i14", type: "found", name: "Student card — Faculty of Commerce", cat: "cards", color: "Blue",
    loc: "Cafeteria", spot: "Handed to campus security", ts: now - 4 * H, status: "active", views: 55, replies: 1,
    desc: "Card found on the floor near the till. Handed to security so the owner can prove ownership.", owner: "Sana K.", photos: 1 },
  { id: "i15", type: "lost", name: "Car keys with a red tag", cat: "keys", color: "Red",
    loc: "Parking", spot: "Lot B, near the gate", ts: now - 8 * H, status: "active", views: 63, replies: 2, urgent: true,
    desc: "Toyota key with a red leather tag and a small torch attached.", owner: "Musa D.", photos: 1 },
  { id: "i16", type: "found", name: "Navy jacket, size L", cat: "clothing", color: "Navy",
    loc: "Lecture Hall B", spot: "Held at the venue office", ts: now - 30 * H, status: "active", views: 33, replies: 0,
    desc: "Navy zip-up jacket left after an evening lecture.", owner: "Ayanda P.", photos: 2 },
];

/* Marks left behind by reports that were purged. No name, no description,
   no photos — only what campus insights and the profile counters need. */
export const SEED_ARCHIVE = [
  { id: "a1", itemId: "old1", type: "found", cat: "cards", loc: "Cafeteria", reportedAt: now - 34 * DAY, resolvedAt: now - 31 * DAY, outcome: "recovered", days: 3, mine: true },
  { id: "a2", itemId: "old2", type: "found", cat: "bottles", loc: "Sports Centre", reportedAt: now - 48 * DAY, resolvedAt: now - 44 * DAY, outcome: "recovered", days: 4, mine: false },
  { id: "a3", itemId: "old3", type: "found", cat: "keys", loc: "Main Library", reportedAt: now - 51 * DAY, resolvedAt: now - 50 * DAY, outcome: "recovered", days: 1, mine: true },
  { id: "a4", itemId: "old4", type: "lost", cat: "clothing", loc: "Residence", reportedAt: now - 160 * DAY, resolvedAt: now - 40 * DAY, outcome: "expired", days: 120, mine: false },
];

export const SEED_HELP = [
  { id: "h1", author: "Bongani S.", title: "Has anyone seen my backpack?", item: "Black Nike backpack",
    loc: "Main Library", time: "Around 14:30", ts: now - 22 * H,
    detail: "Black with a white Nike logo and a green lizard keyring on the zip.",
    replies: [
      { who: "Lerato M.", text: "I saw a bag like that near the cafeteria stairs around 15:00.", ts: now - 20 * H },
      { who: "Sana K.", text: "Someone handed a black backpack to security yesterday evening. Worth checking.", ts: now - 18 * H },
    ] },
  { id: "h2", author: "Thando N.", title: "Lost my student card before an exam", item: "Student ID card, blue lanyard",
    loc: "Cafeteria", time: "Around 12:10", ts: now - 5 * H,
    detail: "Faculty of Commerce card. Exam is on Friday, so I'm a bit desperate.",
    replies: [{ who: "Sana K.", text: "I found a Commerce card there and left it with security — go ask for it.", ts: now - 4 * H }] },
];

export const SEED_NOTIFS = [
  { id: "n1", kind: "match", title: "Possible match found", body: "Your Black Lenovo Laptop report may match an item found at the Main Library.", ts: now - 1.5 * H, read: false, link: "i2" },
  { id: "n2", kind: "reply", title: "Thando replied to your report", body: "\"I think I saw this near the printing shop on Tuesday.\"", ts: now - 6 * H, read: false, link: "i1" },
  { id: "n3", kind: "recovered", title: "Item recovered", body: "Blue Samsung Phone is marked as recovered. Nice one.", ts: now - 2 * DAY, read: true, link: "i7" },
  { id: "n4", kind: "claim", title: "Someone is claiming an item", body: "A student answered the ownership question on your found-item report.", ts: now - 3 * DAY, read: true, link: "i2" },
];
