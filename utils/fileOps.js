import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_FILE = path.join(process.cwd(), 'data', 'backup.json');

export async function saveToBackup(prompt, website) {
    try {
        await fs.mkdir(path.dirname(BACKUP_FILE), { recursive: true });
        let backupData = [];
        try {
            const fileContent = await fs.readFile(BACKUP_FILE, 'utf8');
            backupData = JSON.parse(fileContent);
        } catch (error) {}

        backupData.push({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            prompt,
            website // Changed from response to website for consistency
        });

        await fs.writeFile(BACKUP_FILE, JSON.stringify(backupData, null, 2));
    } catch (error) {
        console.error('Backup failed:', error);
    }
}
export async function getHistory() {
    try {
        const data = await fs.readFile(BACKUP_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}