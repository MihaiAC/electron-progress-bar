"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const password_1 = require("./ipc/password");
const auth_1 = require("./ipc/auth");
const dropbox_1 = require("./ipc/dropbox");
const sounds_1 = require("./ipc/sounds");
const data_1 = require("./ipc/data");
const window_controls_1 = require("./ipc/window-controls");
/**
 * Main Electron Process
 *
 * This is the main entry point for the Electron application.
 * It handles app lifecycle, window creation, and IPC handler setup.
 *
 * The IPC handlers have been modularized into separate files for better organization:
 * - ipc/password.ts: Secure password storage using safeStorage
 * - ipc/auth.ts: OAuth authentication flow with Dropbox
 * - ipc/dropbox.ts: Cloud sync operations with Dropbox API
 * - ipc/sounds.ts: Sound file management for UI events
 * - ipc/data.ts: Local application data persistence
 * - ipc/window-controls.ts: Window minimize/maximize/close operations
 *
 * NOTE: DevTools may show Autofill.enable and Autofill.setAddresses errors.
 * These are harmless console messages from DevTools trying to use Chrome protocol
 * features not available in Electron's Chromium build. They cannot be suppressed
 * and do not affect application functionality.
 */
dotenv_1.default.config();
// Ensure GNOME/Wayland maps this process to the correct .desktop entry.
// Electron reads CHROME_DESKTOP to derive the desktop file ID, which becomes
// the Wayland app_id (desktop file basename without ".desktop").
// Must be set before app.whenReady().
if (process.platform === "linux") {
    process.env.CHROME_DESKTOP = "progress-tracker.desktop";
}
// Global reference to window to prevent garbage collection
let mainWindow = null;
/**
 * Sets up Content Security Policy for the application
 * Configures different CSP rules for development and production environments
 */
function setupContentSecurityPolicy() {
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        // Base CSP directives for both dev and production
        const baseDirectives = [
            "default-src 'self'",
            "font-src 'self' data:",
            "img-src 'self' data:",
            "connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com",
            "media-src 'self' blob:",
        ];
        // Add development-specific directives when in dev mode
        const isDev = !!process.env.VITE_DEV_SERVER_URL;
        const cspDirectives = isDev
            ? [
                ...baseDirectives,
                // Allow connections to Vite dev server
                "connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com ws: http://localhost:*",
                // Allow unsafe-eval AND unsafe-inline for development
                "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
                // Allow unsafe-inline for styles in development
                "style-src 'self' 'unsafe-inline'",
            ]
            : [
                ...baseDirectives,
                // Stricter CSP for production
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'", // Required for styled-components
            ];
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [cspDirectives.join("; ")],
            },
        });
    });
}
/**
 * Creates the main application window with security-focused web preferences.
 * Loads either the Vite dev server or the built frontend based on environment.
 */
function createWindow() {
    // Try PNG first (better for Ubuntu), fall back to SVG
    const pngIconPath = path_1.default.join(__dirname, "../assets/icon.png");
    const svgIconPath = path_1.default.join(__dirname, "../assets/icon.svg");
    const iconPath = fs_1.default.existsSync(pngIconPath) ? pngIconPath : svgIconPath;
    mainWindow = new electron_1.BrowserWindow({
        title: "Progress Tracker",
        width: 1000,
        height: 800,
        minWidth: 900,
        minHeight: 700,
        show: false,
        frame: false,
        icon: iconPath,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
        },
    });
    // Load the appropriate frontend based on environment
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, "../frontend/dist/index.html"));
    }
    // Show window when ready to prevent visual flash
    mainWindow.once("ready-to-show", () => {
        if (mainWindow) {
            mainWindow.show();
        }
    });
    // Clean up reference when window is closed
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
/**
 * Initialize application when Electron is ready
 * Sets up all IPC handlers and creates the main window
 */
electron_1.app.whenReady().then(() => {
    electron_1.app.setName("ProgressTracker");
    // First time we're opening app?
    const firstRunFlagPath = path_1.default.join(electron_1.app.getPath("userData"), ".auto-launch-configured");
    // Enable auto launch if first app open.
    if (!fs_1.default.existsSync(firstRunFlagPath)) {
        electron_1.app.setLoginItemSettings({
            openAtLogin: true,
            openAsHidden: false,
            name: "Progress Tracker",
        });
        // Create flag file.
        fs_1.default.writeFileSync(firstRunFlagPath, "");
        console.info("[startup] Auto-launch enabled on first run.");
    }
    setupContentSecurityPolicy();
    (0, password_1.setupPasswordIpc)();
    (0, auth_1.setupAuthIpc)();
    (0, dropbox_1.setupDropboxIpc)();
    (0, sounds_1.setupSoundsIpc)();
    (0, data_1.setupDataIpc)();
    createWindow();
    (0, window_controls_1.setupWindowControlsIpc)(mainWindow);
});
// Quit when all windows are closed
electron_1.app.on("window-all-closed", () => {
    electron_1.app.quit();
});
// Handle any uncaught exceptions to prevent crashes
process.on("uncaughtException", (error) => {
    console.error("Uncaught exception: ", error);
});
//# sourceMappingURL=main.js.map