# Aesthetic Pomodoro Extension: Overview and Detailed Report

## What is the Aesthetic Pomodoro Extension?

The **Aesthetic Pomodoro Extension** is a Chrome browser extension designed to enhance productivity using the **Pomodoro Technique**, a time management method where work is divided into focused intervals (typically 25 minutes) followed by short breaks (5 minutes), with a longer break after four cycles. This extension customizes the intervals (e.g., 50-minute study sessions, 10-minute short breaks, 20-minute long breaks) and adds features like task management, study tracking, and a visually appealing interface with light/dark themes.

### Purpose and Intended Functionality
- **Core Goal**: Assist users in focusing on tasks by implementing the Pomodoro Technique with a modern, aesthetic design.
- **Features**:
  - A timer for work and break sessions.
  - A to-do list for task management.
  - A calendar to track study history and completed tasks.
  - Customizable settings for session lengths and alarm sounds.
  - A floating timer that works on any webpage.
  - Visual feedback like study streaks on the calendar.
  - Support for light and dark themes.
- **What It Does**:
  - Runs a Pomodoro cycle: long study (50 minutes), short break (10 minutes), long study, short break, long study, long break (20 minutes), then repeats.
  - Plays an alarm sound (`bell_sound.mp3` or a user-uploaded audio) when a session ends.
  - Tracks study time and completed tasks, displaying them on a calendar.
  - Allows users to block distractions indirectly by encouraging focused sessions.
  - Provides a visually appealing experience with gradients, shadows, and animations.

### What a Customer Should Expect
- **Ease of Use**: A simple interface to start a timer, manage tasks, and track progress effortlessly.
- **Customization**: Adjust session lengths and upload custom alarm sounds.
- **Visual Appeal**: A modern design with gradients, shadows, and theme options (light/dark).
- **Productivity Boost**: Focused work sessions with regular breaks to avoid burnout, plus a to-do list for organization.
- **Study Tracking**: A calendar showing study history, with streaks for motivation and tooltips for daily stats (study minutes, completed tasks).
- **Floating Timer**: A small timer on any webpage, so you don’t need the popup open.
- **Reliability**: The timer runs smoothly in the background, saves settings, and plays the correct alarm sound.

---

## Functions of the Extension

Here’s a detailed breakdown of the main functionalities:

1. **Timer (Pomodoro Cycles)**:
   - Runs a cycle: long study (50 minutes), short break (10 minutes), long study, short break, long study, long break (20 minutes), then repeats.
   - Plays an alarm sound when a session ends.
   - Updates in real-time, ticking down every second.

2. **To-Do List**:
   - Add, edit, and delete tasks.
   - Mark tasks as completed, which are logged on the calendar for the current day.

3. **Calendar (Study Tracking)**:
   - Displays a monthly calendar with study activity.
   - Highlights study days (gray background) and streaks (green background for consecutive study days).
   - Shows a tooltip on hover with study minutes and completed tasks for each day.

4. **Settings**:
   - Customize session lengths (long study, short break, long break).
   - Upload a new audio file to replace the default alarm sound.
   - Explicitly save changes with a “Save Changes” button.

5. **Floating Timer**:
   - A small timer window on any webpage, showing the current session’s remaining time.
   - Syncs with the main timer for consistent tracking.

6. **Dark/Light Mode**:
   - Switches between light and dark themes based on user or system preferences.
   - Ensures readability in both themes (e.g., white text in dark mode).

---

## What Each File Does

The project consists of several files, each with a specific role. Below is a detailed explanation of each file’s purpose in simple terms:

### 1. `Settings.js`
- **Purpose**: Manages the settings section for user customization.
- **What It Does**:
  - Displays inputs to adjust session lengths (long study, short break, long break).
  - Provides a file input to upload a new alarm sound.
  - Includes a “Save Changes” button to store settings.
  - Saves the uploaded audio to `chrome.storage.local` and timer settings to `chrome.storage.sync`.
- **Key Features**:
  - Styled with gradients and shadows for a modern look.
  - File upload button has a gradient background, icon, and smooth hover effects.
  - Text and placeholders are white in both themes for readability.

### 2. `Calendar.js`
- **Purpose**: Displays a calendar to track study history and tasks.
- **What It Does**:
  - Shows a monthly calendar with days highlighted for study activity.
  - Marks streaks for consecutive study days.
  - Displays tooltips on hover with study minutes and completed tasks.
  - Allows month navigation and a “Go to Today” button.
  - Includes a date input (MM/YYYY) to jump to a specific month/year.
- **Key Features**:
  - Date input text, placeholders, and separator are white in both light and dark themes.
  - Uses `chrome.storage.sync` to retrieve study data and completed tasks.

### 3. `background.js`
- **Purpose**: Runs in the background to manage the timer and alarms.
- **What It Does**:
  - Uses `chrome.alarms` to tick down the timer every second.
  - Updates the timer state (time left, phase) and saves it to `chrome.storage.sync`.
  - Plays the alarm sound (`bell_sound.mp3` or a custom sound) when a session ends.
  - Transitions between phases (e.g., long study to short break).
  - Sends messages to update the popup or floating timer with the current time.
- **Key Features**:
  - Ensures the timer runs even if the popup is closed.
  - Handles messages like “START_TIMER”, “STOP_TIMER”, and “RESET_TIMER”.

### 4. `manifest.json`
- **Purpose**: The configuration file that tells Chrome how to run the extension.
- **What It Does**:
  - Defines the extension’s name, version, and description.
  - Specifies permissions (`storage`, `alarms`, `notifications`).
  - Sets the background script (`background.js`), popup file (`dist/index.html`), and content scripts (`floatingTimer.js`).
  - Lists resources like the default alarm sound and icons.
- **Key Features**:
  - Ensures the extension has access to necessary APIs and resources.
  - Defines which files are accessible on all webpages (e.g., for the floating timer).

### 5. `styles/tailwind.css`
- **Purpose**: Defines the styles for the extension using Tailwind CSS.
- **What It Does**:
  - Provides styles for light and dark themes (background gradients, text colors).
  - Adds animations (fade-in, wave effects) and custom utilities (e.g., `placeholder-white`).
  - Styles buttons, inputs, and elements with gradients, shadows, and transitions.
- **Key Features**:
  - Ensures a consistent aesthetic (e.g., white text in dark mode, gradient buttons).
  - Includes custom color palettes for buttons and backgrounds.

### 6. `floatingTimer.js` (Content Script)
- **Purpose**: Manages the floating timer on webpages.
- **What It Does**:
  - Injects a small timer window into any webpage when toggled.
  - Communicates with `background.js` to get the current timer state.
  - Updates the displayed time every second.
- **Key Features**:
  - Styled using `custom.css` to match the app’s aesthetic.
  - Lightweight and non-intrusive for browsing.

### 7. `dist/index.html` (Popup File)
- **Purpose**: The main HTML file for the popup when you click the extension icon.
- **What It Does**:
  - Renders the main interface (timer, to-do list, calendar, settings).
  - Acts as the container for React components like `Settings.js` and `Calendar.js`.
- **Key Features**:
  - Built with React for dynamic updates.
  - Styled to match the app’s aesthetic theme.

---

## How It All Works Together

- When you click the extension icon, `dist/index.html` opens the popup, showing the timer, to-do list, calendar, and settings.
- The timer is controlled by `background.js`, which runs in the background and updates the timer state every second.
- `Settings.js` lets you customize session lengths and upload a new alarm sound, which `background.js` uses when a session ends.
- `Calendar.js` displays your study history, pulling data from `chrome.storage.sync`.
- `floatingTimer.js` shows a small timer on any webpage, syncing with the timer state from `background.js`.
- `manifest.json` ties everything together, ensuring Chrome knows which files to load and what permissions are needed.
- `styles/tailwind.css` ensures the entire extension looks polished and consistent.

---

## Potential Improvements (What a Customer Might Want)

- **More Customization**: Options to change alarm volume or add more themes.
- **Website Blocking**: Block distracting websites during sessions (like Habitica Pomodoro).
- **Task Analytics**: Detailed stats on task completion or time spent per task (like Focus Booster).
- **Notifications**: Desktop notifications when a session ends, especially if the popup is closed.

---

## How to Test It

### 1. Install the Extension
- Navigate to your project directory in Command Prompt:
  ```cmd
  cd C:\Users\Cagan\Desktop\Pomodoro-Extension
  ```
- Clean and build:
  ```cmd
  npm install
  npm run build
  ```
- Load in Chrome (`chrome://extensions/`, enable Developer mode, “Load unpacked”, select the folder).

### 2. Test Features
- Start the timer and verify it transitions between phases (long study → short break → etc.).
- Upload a new audio file in Settings and confirm it plays at the end of a session.
- Add tasks, mark them as completed, and check the calendar to see them logged.
- Switch between light and dark modes to ensure text readability (e.g., white text in the date input).
- Toggle the floating timer on a webpage and confirm it updates in sync with the main timer.

---

## Summary

The **Aesthetic Pomodoro Extension** is a well-rounded productivity tool that combines the Pomodoro Technique with a modern, visually appealing design. It’s ideal for students, professionals, or anyone looking to manage their time effectively while enjoying a polished interface. With features like a customizable timer, to-do list, study tracking calendar, and floating timer, it provides a seamless experience to boost focus and productivity.