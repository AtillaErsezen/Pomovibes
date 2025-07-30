:: cleanup_and_build.bat - Script to clean up existing modules and dist, then reinstall and build the project

:: Step 1: Remove node_modules and dist directories
if exist node_modules (
    echo Removing node_modules directory...
    rmdir /s /q node_modules
    if %ERRORLEVEL% equ 0 (
        echo node_modules removed successfully.
    ) else (
        echo Failed to remove node_modules. Please check permissions or try manually.
        exit /b 1
    )
) else (
    echo node_modules directory not found. Skipping removal.
)

if exist dist (
    echo Removing dist directory...
    rmdir /s /q dist
    if %ERRORLEVEL% equ 0 (
        echo dist removed successfully.
    ) else (
        echo Failed to remove dist. Please check permissions or try manually.
        exit /b 1
    )
) else (
    echo dist directory not found. Skipping removal.
)

:: Step 2: Install dependencies
echo Installing dependencies...
npm install
if %ERRORLEVEL% equ 0 (
    echo Dependencies installed successfully.
) else (
    echo Failed to install dependencies. Check your internet connection or package.json.
    exit /b 1
)

:: Step 3: Build the project
echo Building the project...
npm run build
if %ERRORLEVEL% equ 0 (
    echo Build completed successfully. Check the dist/ directory for output.
) else (
    echo Build failed. Check the console for errors.
    exit /b 1
)

echo Cleanup and rebuild process finished.