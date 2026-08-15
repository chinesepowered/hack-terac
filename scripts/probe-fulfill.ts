import fs from "node:fs/promises";
import { fulfillOrder } from "../src/lib/superserve";

async function main() {
  const dir = "data/orders/maya-1786826745946";
  const book = JSON.parse(await fs.readFile(`${dir}/book.json`, "utf8"));
  const result = await fulfillOrder(book, `${dir}/book.html`);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
