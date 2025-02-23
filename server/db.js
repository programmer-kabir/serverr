import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI);
const dbName = "Discount_App";

let db;

export async function connectDB() {
  if (!db) {
    await client.connect();
    console.log("Connected to MongoDB ");
    db = client.db(dbName);
  }
  return db;
}
