# Background Sound Feature

This feature plays a background sound during your Pomodoro study sessions. You can choose between:

1. Brown Noise (deep, relaxing sound that helps mask distractions)
2. White Noise (higher-pitched ambient sound good for concentration)

## How the Sounds Are Made

Both sounds are generated in code with the Web Audio API (`src/components/offscreen.js`), so no audio files are needed. A 10-second noise buffer is created once and looped, with a short crossfade at the loop point so it doesn't click.

- **White noise** — random samples with equal energy at every frequency.
- **Brown noise** — white noise passed through a leaky integrator, so energy falls off at higher frequencies (-6 dB/octave).

## Using the Feature

1. Open the extension settings
2. Under "Background Sound Type", select your preferred sound type
3. Adjust the volume using the volume slider
4. Make sure "Background Sound" is enabled in the main interface
5. The selected sound will play automatically during your study sessions
