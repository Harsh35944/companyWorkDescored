const fs = require('fs');
const files = [
  'AutoTranslateConfig.js',
  'FlagReactionConfig.js',
  'GuildSettings.js',
  'RoleTranslateConfig.js',
  'TextReplacement.js',
  'TranslateBan.js',
  'UserTranslateConfig.js'
];
for (const file of files) {
  const path = 'server/models/' + file;
  let code = fs.readFileSync(path, 'utf8');
  if (!code.includes('guildEventsPlugin')) {
    code = code.replace(/import mongoose from "mongoose";/, 'import mongoose from "mongoose";\nimport { guildEventsPlugin } from "./eventsPlugin.js";');
    const schemaNameMatch = code.match(/mongoose\.model\("\w+",\s*(\w+)\)/);
    if (schemaNameMatch) {
      const schemaName = schemaNameMatch[1];
      const regex = /(export const \w+\s*=\s*mongoose\.models\.\w+\s*\|\|\s*mongoose\.model\("\w+",\s*\w+\);)/;
      code = code.replace(regex, schemaName + '.plugin(guildEventsPlugin);\n\n$1');
      fs.writeFileSync(path, code);
      console.log('Updated ' + file);
    }
  }
}
