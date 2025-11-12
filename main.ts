import { app, BrowserWindow, session } from "electron";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { setupPasswordIpc } from "./ipc/password";
import { setupAuthIpc } from "./ipc/auth";
import { setupDropboxIpc } from "./ipc/dropbox";
import { setupSoundsIpc } from "./ipc/sounds";
import { setupDataIpc } from "./ipc/data";
import { setupWindowControlsIpc } from "./ipc/window-controls";

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

dotenv.config();

// Ensure GNOME/Wayland maps this process to the correct .desktop entry.
// Electron reads CHROME_DESKTOP to derive the desktop file ID, which becomes
// the Wayland app_id (desktop file basename without ".desktop").
// Must be set before app.whenReady().
if (process.platform === "linux") {
  process.env.CHROME_DESKTOP = "progress-tracker.desktop";
}

// Global reference to window to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

/**
 * Sets up Content Security Policy for the application
 * Configures different CSP rules for development and production environments
 */
function setupContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
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
  const pngIconPath = path.join(__dirname, "../assets/icon.png");
  const svgIconPath = path.join(__dirname, "../assets/icon.svg");
  const iconPath = fs.existsSync(pngIconPath) ? pngIconPath : svgIconPath;

  mainWindow = new BrowserWindow({
    title: "Progress Tracker",
    width: 1000,
    height: 800,
    minWidth: 900,
    minHeight: 700,
    show: false,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Load the appropriate frontend based on environment
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../frontend/dist/index.html"));
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
app.whenReady().then(() => {
  app.setName("ProgressTracker");

  // First time we're opening app?
  const firstRunFlagPath = path.join(
    app.getPath("userData"),
    ".auto-launch-configured"
  );

  // Enable auto launch if first app open.
  if (!fs.existsSync(firstRunFlagPath)) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,
      name: "Progress Tracker",
    });

    // Create flag file.
    fs.writeFileSync(firstRunFlagPath, "");
    console.info("[startup] Auto-launch enabled on first run.");
  }

  setupContentSecurityPolicy();
  setupPasswordIpc();
  setupAuthIpc();
  setupDropboxIpc();
  setupSoundsIpc();
  setupDataIpc();
  createWindow();
  setupWindowControlsIpc(mainWindow);
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  app.quit();
});

// Handle any uncaught exceptions to prevent crashes
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception: ", error);
});
