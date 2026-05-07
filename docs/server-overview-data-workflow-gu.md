# Server Overview Page માટે Data Workflow (Gujarati)

આ દસ્તાવેજ `Server Overview` સ્ક્રીન (તમારા screenshot જેવી) માટે backend અને frontend માં શું કરવું અને કયો data store કરવો તે સમજાવે છે.

---

## સ્ક્રીન પરથી દેખાતી મુખ્ય માહિતી

આ UI માટે સામાન્ય રીતે નીચેનો data જોઈએ:

- સર્વર info: `guildId`, `guildName`, `icon`, `plan`
- live counters: `members`, `channels`, `categories`, `roles`
- usage quota: `usedCharacters`, `maxCharacters` (જેમ કે `0/10,000`)
- summary cards: `translatedCharacters`, `translatedMessages`
- graph filters: `dataType`, `timePeriod`, `scope` (Whole server / specific channels)
- chart series: સમય પ્રમાણે usage points

---

## High-level architecture

1. User Discord OAuth થી login થાય.
2. User manageable serversમાંથી એક પસંદ કરે.
3. Backend એ guild માટે cached/live Discord metadata + તમારો usage data combine કરે.
4. Frontend `/dashboard/manage/:guildId` પેજ પર cards + chart render કરે.

---

## MongoDB schema (પ્રસ્તાવિત)

હાલમાં તમારી પાસે `User`, `GuildInstallation`, `PendingBotOAuth` છે. આ overview page માટે નીચેના collections ઉમેરવા.

### 1) `GuildSettings`

હેતુ: દરેક guild માટે plan, quota, feature toggles.

ફિલ્ડ્સ (example):

- `guildId` (unique, indexed)
- `ownerDiscordId`
- `plan` (`free`, `premium`, `pro`)
- `maxCharactersPerDay` (default 10000)
- `locale` (default `en`)
- `enabledModules` (auto-translation, role-translation, વગેરે)
- `createdAt`, `updatedAt`

### 2) `GuildStatsDaily`

હેતુ: દરરોજ aggregated usage.

- `guildId` (index)
- `date` (YYYY-MM-DD / UTC day)
- `translatedCharacters`
- `translatedMessages`
- `eventsCount` (optional)
- unique index: `(guildId, date)`

### 3) `GuildStatsHourly` (optional but recommended for charts)

- `guildId` (index)
- `hourBucket` (timestamp rounded to hour)
- `translatedCharacters`
- `translatedMessages`
- unique index: `(guildId, hourBucket)`

### 4) `GuildSnapshotCache`

હેતુ: Discord API પરથી મળતા counts cache કરવું.

- `guildId` (unique)
- `memberCount`
- `channelCount`
- `categoryCount`
- `roleCount`
- `fetchedAt`
- TTL policy: 1-5 minutes refresh strategy

---

## Backend API design

### Existing auth/permission reuse

- session cookie + `requireAuth`
- guild access check: owner / manage-guild permission (તમારે પહેલેથી છે)

### New endpoints

#### `GET /api/guilds/:guildId/overview`

response:

- `guild` block: name/icon/plan/installed
- `counts` block: members/channels/categories/roles
- `quota` block: used/max/resetAt
- `summary` block: translatedCharacters/translatedMessages

flow:

1. User auth check
2. user ને guild access છે કે નહીં verify
3. `GuildSettings` read
4. `GuildSnapshotCache` read (expired હોય તો Discord/worker refresh)
5. આજનો usage `GuildStatsDaily`/`Hourly` માંથી sum
6. combined JSON return

#### `GET /api/guilds/:guildId/analytics?metric=characters&period=24h&scope=all`

response:

- `points: [{ ts, value }]`
- `total`
- `period`

### Data write pipeline (bot side)

જ્યારે બોટ message translate કરે ત્યારે:

1. raw event પરથી chars/messages ગણો
2. `GuildStatsHourly` upsert + increment
3. દિવસ માટે `GuildStatsDaily` upsert + increment

આ update API request સમયે નહીં, પણ event સમયે થવો જોઈએ.

---

## Frontend responsibilities (overview page)

Route: `dashboard/manage/:guildId`

### Initial load

1. `GET /api/me` (session alive check)
2. `GET /api/guilds/:guildId/overview`
3. default chart: `GET /api/guilds/:guildId/analytics?metric=characters&period=24h&scope=all`

### UI sections mapping

- Header card → `guild.name`, `guild.id`, `plan`
- Count cards → `counts.members/channels/categories/roles`
- Used characters bar → `quota.used`, `quota.max`
- Summary cards → `summary.translatedCharacters`, `summary.translatedMessages`
- Chart controls → local state (`metric`, `period`, `scope`) + analytics endpoint recall

### State handling

- loading skeleton for cards/chart
- empty state: “No data for selected period”
- retry button on 429/5xx
- optimistic નહીં, કારણકે mostly read dashboards છે

---

## Permissions and security

- કોઈપણ `guildId` માટે data ન આપવો; પહેલાં user access verify કરવો.
- `client_secret` frontend માં ન મોકલવો.
- session cookie httpOnly રાખવી (તમારે already છે).
- rate-limit: analytics endpoint પર per-user throttle ઉમેરવો.

---

## Performance notes

- Discord counts (members/channels/roles) દરેક requestે live ન ખેંચવા; cache/worker વાપરવો.
- analytics query માટે indexes જરૂર:
  - `GuildStatsDaily(guildId, date)`
  - `GuildStatsHourly(guildId, hourBucket)`
- high-traffic હોય તો Redis cache ઉપયોગી.

---

## Implementation checklist (તમારા project માટે)

1. `server/models` માં નવા models ઉમેરો: `GuildSettings`, `GuildStatsDaily`, `GuildStatsHourly`, `GuildSnapshotCache`.
2. bot event pipeline માં stats increment ઉમેરો.
3. `server/routes/api.js` માં:
   - `GET /guilds/:guildId/overview`
   - `GET /guilds/:guildId/analytics`
4. `dashboard/src` માં નવી manage page + chart component ઉમેરો.
5. `.env` માં optional cache/worker configs ઉમેરો (જો જોઈએ).
6. postman/browser થી guild auth + response shape verify કરો.

---

## MVP vs Next phase

### MVP (ઝડપથી ship કરવા)

- `GuildSettings` + `GuildStatsDaily` + `overview` endpoint
- basic cards + “last 24h characters” chart

### Next phase

- hourly charts, channel-level scope
- billing/quota reset jobs
- premium/pro feature gates

