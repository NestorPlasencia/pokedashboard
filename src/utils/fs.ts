import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File I/O utilities
export const readJSONFile = (filePath: string) => {
  try {
    const fullPath = path.resolve(__dirname, filePath);
    const data = fs.readFileSync(fullPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    throw error;
  }
};