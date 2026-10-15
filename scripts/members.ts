/**
 * Team member admin CLI.
 *
 *   npm run members -- list
 *   npm run members -- add <username> "<Full Name>" [--password <pw>]
 *   npm run members -- set-password <username> [--password <pw>]
 *   npm run members -- deactivate <username>
 *   npm run members -- activate <username>
 *
 * Add --allow-weak-password to accept a short password (e.g. for a local demo).
 * Don't use that on a board reachable from the internet.
 *
 * Without --password a strong random password is generated and printed once.
 * Changing a password or deactivating someone signs them out everywhere.
 */
import { generatePassword } from "@/lib/auth/password";
import { resetMongoForTests } from "@/lib/mongodb";
import { memberNameSchema, newPasswordSchema, usernameSchema } from "@/lib/validations/auth";
import { createMember, listMembers, setMemberActive, setMemberPassword } from "@/services/members";

function takeFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

function takeSwitch(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) fail(`${what}: ${r.error.issues[0]?.message}`);
  return r.data;
}

async function main() {
  const args = process.argv.slice(2);
  const allowWeak = takeSwitch(args, "--allow-weak-password");
  const password = takeFlag(args, "--password");
  const checkPassword = (pw: string): string => {
    if (!allowWeak) return parse(newPasswordSchema, pw, "Password");
    if (pw.length < 1) fail("Password can't be empty.");
    if (pw.length < 10) console.warn("⚠ Weak password accepted (--allow-weak-password). Fine for a local demo, not for a public board.");
    return pw;
  };
  const [command, ...rest] = args;

  switch (command) {
    case "list": {
      const members = await listMembers();
      if (members.length === 0) console.log("No members yet. Add one with: npm run members -- add <username> \"<Full Name>\"");
      for (const m of members) console.log(`${m.active ? "●" : "○"} ${m.username.padEnd(20)} ${m.name}${m.active ? "" : "  (deactivated)"}`);
      break;
    }
    case "add": {
      const [rawUsername, ...nameParts] = rest;
      const username = parse(usernameSchema, rawUsername ?? "", "Username");
      const name = parse(memberNameSchema, nameParts.join(" ") || rawUsername, "Name");
      const pw = password ? checkPassword(password) : generatePassword();
      try {
        await createMember({ username, name, password: pw });
      } catch (err) {
        if ((err as { code?: number }).code === 11000) fail(`Username "${username}" is already taken.`);
        throw err;
      }
      console.log(`✔ Added ${name} (@${username})`);
      if (!password) console.log(`  Temporary password: ${pw}\n  Share it privately; they can change it from the account menu.`);
      break;
    }
    case "set-password": {
      const username = parse(usernameSchema, rest[0] ?? "", "Username");
      const pw = password ? checkPassword(password) : generatePassword();
      if (!(await setMemberPassword(username, pw))) fail(`No member called "${username}".`);
      console.log(`✔ Password reset for @${username}. Their existing sessions were signed out.`);
      if (!password) console.log(`  New password: ${pw}`);
      break;
    }
    case "deactivate":
    case "activate": {
      const username = parse(usernameSchema, rest[0] ?? "", "Username");
      if (!(await setMemberActive(username, command === "activate"))) fail(`No member called "${username}".`);
      console.log(`✔ @${username} ${command === "activate" ? "re-activated" : "deactivated and signed out"}.`);
      break;
    }
    default:
      console.log(`Usage:
  npm run members -- list
  npm run members -- add <username> "<Full Name>" [--password <pw>]
  npm run members -- set-password <username> [--password <pw>]
  npm run members -- deactivate <username>
  npm run members -- activate <username>
Options: --password <pw>, --allow-weak-password (local demos only)`);
      if (command) process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("✖", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => resetMongoForTests());
