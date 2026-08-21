import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe("staff-only schema migration scope", () => {
  it("reads and backs up only /users", async () => {
    const requests: string[] = [];
    const users = {
      "staff-1": {
        id: "staff-1",
        role: "ADMIN",
        permissions: { admin: true },
        pinHash: "hash",
        salt: "salt",
        active: true,
      },
    };
    const server = createServer((request, response) => {
      requests.push(request.url ?? "");
      if (request.url?.startsWith("/users.json")) {
        response.writeHead(200, {
          "content-type": "application/json",
          etag: '"users-etag"',
        });
        response.end(JSON.stringify(users));
        return;
      }
      response.writeHead(500);
      response.end("root access is outside staff-only scope");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("mock server did not start");

    const backupDirectory = await mkdtemp(`${tmpdir()}/staff-migration-`);
    try {
      const result = await execFileAsync(
        "node",
        ["scripts/fixDatabaseSchema.mjs", "--staff-only"],
        {
          env: {
            ...process.env,
            FIREBASE_DATABASE_URL: `http://127.0.0.1:${address.port}`,
            FIREBASE_DATABASE_AUTH_TOKEN: "test-token",
            FIREBASE_MIGRATION_BACKUP_DIR: backupDirectory,
          },
        },
      );
      const output = JSON.parse(result.stdout);
      const backup = JSON.parse(await readFile(output.backupPath, "utf8"));

      expect(requests).toEqual(["/users.json?auth=test-token"]);
      expect(Object.keys(backup)).toEqual(["exportedAt", "users"]);
      expect(backup.users).toEqual(users);
      expect(output.conflicts).toBe(0);
      expect(output.safeToApply).toBe(true);
    } finally {
      await rm(backupDirectory, { recursive: true, force: true });
    }
  });
});