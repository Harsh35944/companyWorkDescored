# iTranslator જેવી Features માટે Backend + Database Roadmap (Gujarati)

આ દસ્તાવેજમાં તમે આપેલી feature list પ્રમાણે backend side શું બનાવવું, કયા APIs જોઈએ, અને MongoDB માં કયો data model રાખવો તે પ્રોડક્શન દૃષ્ટિએ સમજાવ્યું છે.

---

## 1) Scope (આવશ્યક Features)

આ roadmap ખાસ આ features માટે છે:

- Text Translation
- Translation by Flag
- Automatic Translation
- Auto-Erase Messages
- Language Detection
- User-based Translate Ban
- Text Styling Options
- Role Translation
- Auto-Disappear
- Text-to-Speech
- Translate Users

Reference docs:
- [Translation by Flag](https://docs.itranslator.app/amazing-features/translation-by-flag)
- [Automatic Translation](https://docs.itranslator.app/amazing-features/automatic-translation)
- [Role Translation](https://docs.itranslator.app/amazing-features/role-translation)
- [Auto-Erase](https://docs.itranslator.app/amazing-features/auto-erase)
- [Auto-React](https://docs.itranslator.app/amazing-features/auto-react)
- [Statistics](https://docs.itranslator.app/amazing-features/statistics)
- [Voice Features](https://docs.itranslator.app/amazing-features/voice-features)
- [Translate-Ban](https://docs.itranslator.app/amazing-features/translate-ban-role-and-user)
- [Text-Replacement](https://docs.itranslator.app/amazing-features/text-replacement)
- [Premium](https://docs.itranslator.app/overview/premium)

---

## 2) High-Level Backend Architecture

Backend ને 4 layers માં તોડો:

1. **Discord Gateway Layer**
   - `messageCreate`, `messageReactionAdd`, `messageDelete`, slash command interactions, voice events.
2. **Feature Engine Layer**
   - translate service, detect service, style renderer, policy checks (ban/premium/limits).
3. **Persistence Layer (MongoDB)**
   - guild config, mappings, usage stats, translation linkage.
4. **Dashboard/API Layer**
   - guild overview, analytics, feature config CRUD.

---

## 3) Feature-wise Backend Requirements

## 3.1 Text Translation (slash/context/user message translate)

- `/translate` command handler
- optional target language + style + ephemeral/public output
- user/guild permissions check
- usage billing (characters/messages)
- translation output record save (for auto-erase and stats)

### જરૂરી services
- `translationProvider.translate(text, source, target)`
- `styleRenderer.render(mode: text|embed|webhook)`
- `usageTracker.increment(guildId, chars, messages)`

---

## 3.2 Language Detection [COMPLETED]

- `/detect` command (Enhanced with language names)
- Context Menu "Detect Language" support
- Robust Indian language detection (Telugu, Tamil, Hindi, etc.)
- Auto-detect flags feature implemented

---

## 3.3 Translation by Flag

- `messageReactionAdd` eventમાં country flag emoji ઓળખો
- મૂળ message translate કરો
- style પ્રમાણે reply/embed/webhook મોકલો
- optional DM/thread mode support
- auto-disappear timer integration

### policy checks
- banned user/role?
- feature enabled for guild?
- target channel permission available?

---

## 3.4 Automatic Translation (channel/category mapping)

- source channel -> one/many target channel + target language
- category-level mapping support (premium gate)
- webhook-based forwarding with style options
- source language optional override

### pipeline
1. incoming message
2. config lookup
3. replacement rules apply (text-replacement)
4. translate
5. styled send to targets
6. mapping + stats persist

---

## 3.5 Role Translation

- role-bound translation configs
- જો user પાસે mapped role હોય તો તેના messages translate
- role changes માટે cache/lookup optimize

---

## 3.6 Auto-Erase + Auto-Disappear

- translation linkage table જરૂરી (original message id <-> translated message ids)
- `messageDelete` event પર mode મુજબ cascade delete:
  - `ALL`
  - `ONLY_FROM_ORIGINAL`
- auto-disappear માટે delayed delete job/scheduler

---

## 3.7 User-based Translate Ban

- guild-level ban list (user + role)
- translate pipeline પહેલા quick deny check
- slash commands:
  - ban
  - unban
  - list

---

## 3.8 Text Styling Options

- style enum:
  - `TEXT`
  - `EMBED`
  - `WEBHOOK`
- per-feature/per-config style override

---

## 3.9 Text-to-Speech (TTS)

- `/tts` live voice channel playback
- `/tts-file` output as file
- voice session lifecycle management
- rate-limit + queue

### note
- voice features generally premium/pro gates સાથે રાખો.

---

## 3.10 Translate Users (User-install / DM / GDM style scope)

- user-scoped configs (guild independent)
- command અથવા context-menu પરથી translate anywhere
- privacy/safety checks

---

## 4) MongoDB Data Model (Recommended)

હાલના models ઉપરાંત નીચે ઉમેરો:

## 4.1 `GuildSettings`
- `guildId` (unique)
- `plan` (`free|premium|pro`)
- `features` object toggles:
  - `translationByFlagEnabled`
  - `autoTranslateEnabled`
  - `roleTranslateEnabled`
  - `autoEraseEnabled`
  - `autoReactEnabled`
  - `ttsEnabled`
- `autoEraseMode` (`ALL|ONLY_FROM_ORIGINAL`)
- `defaultStyle` (`TEXT|EMBED|WEBHOOK`)
- `maxCharactersPerDay`

## 4.2 `AutoTranslateConfig`
- `guildId`
- `name` (unique per guild)
- `sourceType` (`CHANNEL|CATEGORY`)
- `sourceId`
- `targets`: array of `{ targetType, targetId, targetLanguage }`
- `sourceLanguage` (optional)
- `style`
- `enabled`

## 4.3 `RoleTranslateConfig`
- `guildId`
- `roleId`
- `targetLanguage`
- `style`
- `enabled`

## 4.4 `FlagReactionConfig`
- `guildId`
- `enabled`
- `style`
- `sendInPm`
- `sendInThread`
- `autoDisappearSeconds`

## 4.5 `TranslateBan`
- `guildId`
- `userIds: []`
- `roleIds: []`

## 4.6 `TextReplacement`
- `guildId`
- `input`
- `output`
- index on `(guildId, input)` unique

## 4.7 `TranslationMessageMap`
- `guildId`
- `featureType` (`AUTO|ROLE|FLAG|COMMAND`)
- `originalMessageId`
- `translatedMessageIds: []`
- `createdAt`
- TTL optional (free/premium policy પ્રમાણે)

## 4.8 `UsageEvent` (optional raw events)
- `guildId`
- `timestamp`
- `featureType`
- `translatedCharacters`
- `translatedMessages`
- `context` (channel/category/user)

## 4.9 `GuildStatsHourly` / `GuildStatsDaily`
- તમે પહેલેથી add કર્યું છે; આને usage aggregation માટે primary રાખો.

## 4.10 `VoiceSession` (optional)
- `guildId`
- `channelId`
- `mode` (`LIVE_TTS|TRANSCRIBE`)
- `status`
- `startedAt`, `endedAt`

---

## 5) API Endpoints (Dashboard માટે)

## Core
- `GET /api/me`
- `GET /api/me/guilds`
- `GET /api/guilds/:guildId/overview`
- `GET /api/guilds/:guildId/analytics`

## Feature Config CRUD
- `GET /api/guilds/:guildId/features`
- `PATCH /api/guilds/:guildId/features`

- `GET /api/guilds/:guildId/auto-translate-configs`
- `POST /api/guilds/:guildId/auto-translate-configs`
- `PATCH /api/guilds/:guildId/auto-translate-configs/:id`
- `DELETE /api/guilds/:guildId/auto-translate-configs/:id`

- role/flag/text-replacement/ban માટે same CRUD pattern રાખો.

---

## 6) Queue/Job requirements

Productionમાં નીચે job queue જોઈએ (BullMQ/Redis અથવા equivalent):

- auto-disappear delete jobs
- retry for webhook/send failures
- stats aggregation jobs
- cleanup (expired mappings, stale sessions)

---

## 7) Premium / Plan Gating

દરેક feature endpoint + command handler માં gate function:

- `assertPlan(guildId, featureName)`
- limits:
  - replacements count
  - ban list size
  - premium-only features (auto-react/advanced voice વગેરે)

આ plan model [Premium docs](https://docs.itranslator.app/overview/premium) પ્રમાણે align કરવો.

---

## 8) Security + Reliability Checklist

- OAuth tokens encrypt-at-rest
- per-user + per-guild rate-limits
- Discord API retry with backoff
- idempotent writes for translation map + stats
- structured logs (featureType, guildId, requestId)
- audit trail for config changes

---

## 9) Suggested Implementation Order (Practical)

1. Core translate/detect + stats write stable કરો
2. Translation mapping (`TranslationMessageMap`) finalize કરો
3. Auto-erase + auto-disappear add કરો
4. Auto-translate + role-translate configs CRUD
5. Flag-reaction pipeline + style variants
6. Ban + text-replacement
7. TTS/transcription + advanced premium gating

---

## 10) Current project સામે Gap Summary

હાલ project માં OAuth/dashboard/overview/analytics base છે. હવે feature-complete બનવા માટે જરૂરી મુખ્ય gaps:

- feature config models + CRUD endpoints
- message translation pipelines (auto/role/flag)
- translation linkage + erase logic
- text-replacement and ban enforcement
- TTS/transcription runtime + queue
- full premium gate + limits engine

---

આ document roadmap છે. જો તમે કહો તો next step માં હું આમાંથી **Phase-1 (Text Translation + Language Detection + Translation Map + Auto-Erase)** actual codeમાં implement કરી દઈશ.

---

## 11) User Activity થી Dashboard Auto-Update Process (End-to-End)

આ વિભાગ તમારા પ્રશ્ન માટે છે: “યુઝર activity થાય ત્યારે dashboard data auto-update કેવી રીતે થશે?”

### Step 1: Activity Trigger

નીચેમાંથી કોઈ પણ action થાય:

- user `/translate` command ચલાવે
- flag reaction થી translate થાય
- auto-translation config થી message forward/translate થાય
- role-translation થી message translate થાય
- detect command ચાલે
- auto-erase delete flow ચાલે

### Step 2: Feature Engine Processing

backend feature engine આ activity માટે:

1. permission/premium/ban checks કરે
2. source text લે
3. text-replacement rules apply કરે (જો enabled હોય)
4. translation/detection/TTS service call કરે
5. output message Discord માં મોકલે

### Step 3: Persist Business Data (MongoDB)

દરેક successful feature event પછી DB write થવું જોઈએ:

- `TranslationMessageMap` માં linkage save:
  - original message id
  - translated message ids
  - feature type
- `GuildStatsHourly` increment:
  - `translatedCharacters += n`
  - `translatedMessages += 1`
- `GuildStatsDaily` increment (same counters)
- જરૂર હોય તો `UsageEvent` raw log insert

આ સ્ટેપ dashboard update માટે core છે.

### Step 4: Optional Cleanup/Async Jobs

જો feature auto-disappear/erase હોય તો:

- queue job schedule (delay delete)
- delete થાય ત્યારે related mapping/status update

### Step 5: Dashboard API Read

dashboard page open/refresh પર:

- `GET /api/guilds/:guildId/overview`
  - આજનો quota usage, summary cards
- `GET /api/guilds/:guildId/analytics`
  - hourly/daily graph points

આ endpoints real-time-like data આપે છે કારણ કે Step-3 માં counters સતત update થાય છે.

### Step 6: Frontend Refresh Strategy

frontendમાં data update માટે recommended pattern:

- page load પર fetch
- filter change પર re-fetch
- 30-60 sec polling (optional)
- manual refresh button
- future માટે websocket/SSE push model

### Step 7: Consistency Rules

ડેટા mismatch ટાળવા:

- event write idempotent રાખો (duplicate event ફરી ના ગણાય)
- hourly + daily બંનેમાં same transaction-like update pattern
- failed Discord send હોય તો stats increment ન કરો
- retriesમાં duplicate increment રોકો

### Step 8: Expected Result

આ process follow થાય તો:

- user activity પછી 1-2 API refreshમાં overview cards update થશે
- chartમાં નવા points વધતા દેખાશે
- auto-erase/translation mapping moderation સાથે synced રહેશે

અર્થાત “Bot configured server” માટે dashboard ખરેખર live operational બને છે, માત્ર static UI નહીં.
