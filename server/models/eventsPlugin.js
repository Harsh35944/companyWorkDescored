import { guildEvents } from "../lib/events.js";

export function guildEventsPlugin(schema) {
  schema.post("save", function (doc) {
    if (doc && doc.guildId) {
      guildEvents.emit("update", doc.guildId);
    }
  });

  schema.post("findOneAndUpdate", function (doc) {
    if (doc && doc.guildId) {
      guildEvents.emit("update", doc.guildId);
    }
  });

  schema.post("findOneAndDelete", function (doc) {
    if (doc && doc.guildId) {
      guildEvents.emit("update", doc.guildId);
    }
  });

  schema.post("deleteOne", function () {
    const filter = this.getFilter();
    if (filter && filter.guildId) {
      guildEvents.emit("update", filter.guildId);
    }
  });

  schema.post("deleteMany", function () {
    const filter = this.getFilter();
    if (filter && filter.guildId) {
      guildEvents.emit("update", filter.guildId);
    }
  });

  schema.post("updateOne", function () {
    const filter = this.getFilter();
    if (filter && filter.guildId) {
      guildEvents.emit("update", filter.guildId);
    }
  });

  schema.post("updateMany", function () {
    const filter = this.getFilter();
    if (filter && filter.guildId) {
      guildEvents.emit("update", filter.guildId);
    }
  });
}
