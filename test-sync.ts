import "dotenv/config";
import { salesDbSelect } from "./lib/sales-db";

async function run() {
  const orders = await salesDbSelect("otp_orders", "select=id,items&limit=5&order=created_at.desc");
  if (orders.length > 0) {
    console.log("Recent order items:", JSON.stringify(orders[0].items, null, 2));
  } else {
    console.log("No orders found");
  }
}

run().catch(console.error);
