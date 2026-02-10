import { Client } from '@xhayper/discord-rpc';
import { statSync, openSync, readSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// --- CONFIGURATION ---
const CLIENT_ID = 'YOUR_APP_ID_HERE'; 
const PROCESS_NAMES = ["project8.exe", "deadlock.exe"];
const RESYNC_MAX_BYTES = 100 * 1024; // Only read the last 100KB for resync

// 1. AUTO-DETECT PATHS + PORTABLE MODE
const POSSIBLE_PATHS = [
    join(process.cwd(), "console.log"), // Check folder where .exe is running
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Deadlock\\game\\citadel\\console.log",
    "C:\\Program Files\\Steam\\steamapps\\common\\Deadlock\\game\\citadel\\console.log",
    "D:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\console.log",
    "E:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\console.log"
];

// Ensure LOG_PATH is a string (default to empty if not found)
let LOG_PATH = POSSIBLE_PATHS.find(path => existsSync(path)) || "";

// --- DICTIONARY ---
const HERO_NAMES: { [key: string]: string } = {
    "atlas": "Abrams",
    "fencer": "Apollo", 
    "punkgoat": "Billy",
    "nano": "Calico",
    "unicorn": "Celeste",
    "doorman": "Doorman",
    "drifter": "Drifter",
    "dynamo": "Dynamo",
    "necro": "Graves",
    "orion": "Grey Talon",
    "haze": "Haze",
    "astro": "Holliday",
    "inferno": "Infernus",
    "tengu": "Ivy",
    "kelvin": "Kelvin",
    "ghost": "Lady Geist",
    "lash": "Lash",
    "forge": "McGinnis",
    "vampirebat": "Mina",
    "mirage": "Mirage",
    "krill": "Mo & Krill", 
    "bookworm": "Paige", 
    "chrono": "Paradox", 
    "synth": "Pocket",
    "familiar": "Rem",
    "gigawatt": "Seven",
    "shiv" : "Shiv",
    "werewolf": "Silver",
    "magician": "Sinclair",
    "priest": "Venator",
    "frank": "Victor", 
    "hornet": "Vindicta",
    "viscous": "Viscous",
    "viper": "Vyper",
    "warden": "Warden",
    "wraith": "Wraith",
    "yamato": "Yamato",
};

// --- STATE ---
const client = new Client({ clientId: CLIENT_ID, transport: { type: 'ipc' } });
let isConnected = false;
let sessionStartTime: Date | null = null;
let matchStartTime: Date | null = null;
let lastFileSize = 0;

let gameState = {
    hero: "Unknown",
    map: "Unknown",
    inMatch: false,
};

const MAP_REGEX = /\[Client\] Map: "([a-zA-Z0-9_]+)"/;
const HERO_REGEX = /Loaded hero \d+\/hero_([a-zA-Z0-9_]+)/;

// --- PROCESS CHECKER ---
async function isGameRunning(): Promise<boolean> {
    try {
        // FIX: Added '!' to PROCESS_NAMES[0]! to tell TypeScript it is definitely defined
        const proc = Bun.spawn(["tasklist", "/FI", `IMAGENAME eq ${PROCESS_NAMES[0]!}`, "/NH"], { stdout: "pipe" });
        const text = await new Response(proc.stdout).text();
        if (text.includes(PROCESS_NAMES[0]!)) return true;
        
        // FIX: Added '!' to PROCESS_NAMES[1]! here too
        const proc2 = Bun.spawn(["tasklist", "/FI", `IMAGENAME eq ${PROCESS_NAMES[1]!}`, "/NH"], { stdout: "pipe" });
        const text2 = await new Response(proc2.stdout).text();
        return text2.includes(PROCESS_NAMES[1]!);
    } catch (e) {
        return false;
    }
}

// --- DISPLAY LOGIC ---
async function refreshPresence() {
    if (!client.user || !isConnected) return;

    let timeText = "";
    if (matchStartTime) {
        const diffMs = new Date().getTime() - matchStartTime.getTime();
        const minutes = Math.floor(diffMs / 60000);
        timeText = `(${minutes}m)`;
    }

    let details = "In Main Menu";
    if (gameState.map === "dl_hideout") details = `In Hideout ${timeText}`;
    else if (gameState.inMatch) details = `In Match ${timeText}`;

    let state = "Idling";
    if (gameState.hero !== "Unknown") state = `Playing ${gameState.hero}`;
    else if (gameState.inMatch) state = "Selecting Hero...";

    try {
        await client.user.setActivity({
            details: details,
            state: state,
            largeImageKey: 'logo',
            largeImageText: 'Deadlock',
            startTimestamp: sessionStartTime || undefined,
            instance: false,
        });
    } catch (e) {}
}

function processLine(line: string, suppressUpdate = false) {
    if (!line) return;
    let stateChanged = false;

    // Map Detection
    if (line.includes("[Client] Map:")) {
        const match = line.match(MAP_REGEX);
        if (match && match[1]) {
            const mapName = match[1];
            gameState.map = mapName;
            
            if (mapName === "dl_hideout") {
                gameState.inMatch = false;
                matchStartTime = new Date(); 
                stateChanged = true;
            } 
            else if (["street_test", "start", "street_test_bridge"].includes(mapName)) {
                gameState.inMatch = true;
                gameState.hero = "Unknown"; 
                matchStartTime = new Date(); 
                stateChanged = true;
            }
        }
    }

    // Hero Detection
    if (line.includes("Loaded hero")) {
        const match = line.match(HERO_REGEX);
        if (match && match[1]) {
            const rawName = match[1];
            const niceName = HERO_NAMES[rawName] || (rawName.charAt(0).toUpperCase() + rawName.slice(1));
            if (gameState.hero !== niceName) {
                gameState.hero = niceName;
                stateChanged = true;
            }
        }
    }

    // Disconnect
    if (line.includes("Disconnecting from server") || line.includes("LoopMode: menu")) {
        if (gameState.inMatch) {
            gameState.inMatch = false;
            gameState.map = "Menu";
            gameState.hero = "Unknown";
            matchStartTime = null;
            stateChanged = true;
        }
    }

    if (stateChanged && !suppressUpdate) refreshPresence();
}

function checkLog() {
    if (!LOG_PATH) return;
    try {
        const stats = statSync(LOG_PATH);
        if (stats.size > lastFileSize) {
            const fd = openSync(LOG_PATH, 'r');
            const buffer = Buffer.alloc(stats.size - lastFileSize);
            readSync(fd, buffer, 0, buffer.length, lastFileSize);
            lastFileSize = stats.size;
            buffer.toString('utf8').split('\n').forEach(l => processLine(l.trim()));
        } else if (stats.size < lastFileSize) lastFileSize = stats.size;
    } catch (err) {}
}

// --- RESYNC ---
function resyncLog() {
    // Re-check for path
    if (!LOG_PATH || !existsSync(LOG_PATH)) {
        LOG_PATH = POSSIBLE_PATHS.find(path => existsSync(path)) || "";
        if (!LOG_PATH) {
            console.log("Could not find console.log. Ensure '-condebug' is on.");
            return;
        }
    }

    console.log(`Reading state from: ${LOG_PATH}`);
    try {
        const stats = statSync(LOG_PATH);
        const fd = openSync(LOG_PATH, 'r');
        
        let readStart = 0;
        let readSize = stats.size;
        
        if (stats.size > RESYNC_MAX_BYTES) {
            readStart = stats.size - RESYNC_MAX_BYTES;
            readSize = RESYNC_MAX_BYTES;
        }

        const buffer = Buffer.alloc(readSize);
        readSync(fd, buffer, 0, readSize, readStart);
        
        const content = buffer.toString('utf8');
        const lines = content.split('\n');
        if (readStart > 0) lines.shift(); 
        
        lines.forEach(l => processLine(l.trim(), true));
        
        lastFileSize = stats.size;
        refreshPresence();
    } catch (e) {
        console.error("Resync error:", e);
    }
}

// --- MAIN LOOP ---
async function tick() {
    const running = await isGameRunning();

    if (running) {
        if (!isConnected) {
            console.log("Deadlock detected. Connecting...");
            try {
                await client.login();
                isConnected = true;
                sessionStartTime = new Date();
                resyncLog(); 
            } catch (e) {}
        } else {
            checkLog();
        }
    } else {
        if (isConnected) {
            console.log("Deadlock closed. Disconnecting...");
            try { await client.destroy(); } catch (e) {}
            isConnected = false;
            sessionStartTime = null;
            matchStartTime = null;
            gameState.inMatch = false;
            gameState.hero = "Unknown";
        }
    }
}

console.log("Deadlock RPC Watcher Started.");

setInterval(tick, 5000);
setInterval(() => { if (isConnected) refreshPresence(); }, 60000);
tick();