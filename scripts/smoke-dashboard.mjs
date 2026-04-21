import "dotenv/config";
import { getDashboard } from "../server/dashboard.ts";

// User 1 exists in dev DB
const payload = await getDashboard(1);
console.log("Dashboard payload:");
console.log(JSON.stringify(payload, null, 2));
process.exit(0);
