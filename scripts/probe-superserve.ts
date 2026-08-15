import { Sandbox } from "@superserve/sdk";

async function main() {
  const sandbox = await Sandbox.create({ name: "storyline-probe" });
  console.log("created:", sandbox.id);
  const r1 = await sandbox.commands.run("echo hello && python3 --version");
  console.log("run result keys:", Object.keys(r1 as object));
  console.log("stdout:", JSON.stringify((r1 as { stdout?: string }).stdout));
  console.log("full:", JSON.stringify(r1).slice(0, 400));
  await sandbox.files.write("/tmp/x.py", "print('py works')");
  const r2 = await sandbox.commands.run("python3 /tmp/x.py");
  console.log("py stdout:", JSON.stringify((r2 as { stdout?: string }).stdout));
  await sandbox.kill();
  console.log("killed ok");
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
