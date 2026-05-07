import mongoose from 'mongoose';
import { GuildSettings } from '../server/models/GuildSettings.js';

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/discord_dashboard');
  const settings = await GuildSettings.findOne({ guildId: '1497127483105869874' });
  console.log('GUILD SETTINGS:', JSON.stringify(settings, null, 2));
  process.exit(0);
}

check();
