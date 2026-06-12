import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function fixIndex() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");
    
    console.log("Attempting to drop old index: guildId_1_day_1 from guildstatsdailies...");
    try {
      await mongoose.connection.collection("guildstatsdailies").dropIndex("guildId_1_day_1");
      console.log("✅ Successfully dropped the old index!");
    } catch (e) {
      if (e.message.includes("index not found")) {
        console.log("✅ Old index not found, nothing to do. It might have been already deleted.");
      } else {
        console.log("Error dropping index:", e.message);
      }
    }

    console.log("Attempting to drop old index: guildId_1_hourBucket_1 from guildstatshourlies...");
    try {
      await mongoose.connection.collection("guildstatshourlies").dropIndex("guildId_1_hourBucket_1");
      console.log("✅ Successfully dropped the old index for hourly stats!");
    } catch (e) {
      if (e.message.includes("index not found")) {
        console.log("✅ Old hourly index not found.");
      } else {
        console.log("Error dropping hourly index:", e.message);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
}

fixIndex();
