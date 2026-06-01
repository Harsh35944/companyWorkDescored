import { EventEmitter } from "events";

class GuildEventEmitter extends EventEmitter {}

export const guildEvents = new GuildEventEmitter();
