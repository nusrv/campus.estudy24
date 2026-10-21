import { createInitialOwner } from "../src/server/administrator-service.ts";
import { createDatabase } from "../src/server/database-client.ts";
import { createInterface } from "node:readline/promises";

import { loginSchema } from "../src/server/validation.ts";

if (!process.stdin.isTTY) throw new Error("Run in an interactive terminal. Passwords must never be passed in command arguments.");
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Administrator email: ")).trim().toLowerCase();
const name = (await rl.question("Administrator display name: ")).trim();
rl.close();
function hidden(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
    const cleanup = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData); process.stdout.write("\n"); };
    const onData = (chunk: string | Buffer) => {
      for (const char of String(chunk)) {
        if (char === "\u0003") { cleanup(); reject(new Error("Cancelled.")); return; }
        if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && value.length < 256) value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
const password = await hidden("Password (8–256 characters, hidden): ");
const confirm = await hidden("Confirm password (hidden): ");
if (password !== confirm) throw new Error("Passwords do not match.");
loginSchema.parse({ email, password });
if (!name || name.length > 200) throw new Error("A display name of 1–200 characters is required.");
const db = createDatabase();
try {
  await createInitialOwner(db, { email, name, password });
  console.log("Initial administrator created successfully.");
} finally { await db.$disconnect(); }
