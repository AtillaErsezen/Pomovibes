# Background Sound Feature

This feature adds support for different background sounds during your Pomodoro study sessions. You can choose between:

1. Background Music (original feature)
2. Brown Noise (deep, relaxing sound that helps mask distractions)
3. White Noise (higher-pitched ambient sound good for concentration)

## Sound Files

For this feature to work properly, you need to add two sound files that aren't included in this repository:

1. `brown_noise.mp3` - A brown noise audio file
2. `white_noise.mp3` - A white noise audio file

## How to Add Sound Files

1. Find suitable audio files for brown noise and white noise. You can find free audio files on websites like:
   - freesound.org
   - pixabay.com
   - zapsplat.com

2. Download the files and rename them to `brown_noise.mp3` and `white_noise.mp3`

3. Place these files in the `/assets` folder of the extension

4. The files should be loopable and ideally 1-3 minutes in length to avoid large file sizes

## Using the Feature

1. Open the extension settings
2. Under "Background Sound Type", select your preferred sound type
3. Adjust the volume using the volume slider
4. Make sure "Background Sound" is enabled in the main interface
5. The selected sound will play automatically during your study sessions
