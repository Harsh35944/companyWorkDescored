/** Discord PermissionFlagsBits — user-over-guild permission integer from /users/@me/guilds */
const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

/**
 * Dashboard rule: owner always; else ADMINISTRATOR or MANAGE_GUILD.
 */
export function canConfigureGuild(owner, permissionsString) {
  if (owner) return true;
  try {
    const perms = BigInt(permissionsString);
    if ((perms & ADMINISTRATOR) === ADMINISTRATOR) return true;
    if ((perms & MANAGE_GUILD) === MANAGE_GUILD) return true;
  } catch {
    return false;
  }
  return false;
}
