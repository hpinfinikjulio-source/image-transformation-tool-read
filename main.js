// Constants for canvas dimensions
const CANVAS_SIZE = 64;

// DOM element references
let baseImageInput;
let targetImageInput;
let baseCanvas;
let targetCanvas;
let outputCanvas;
let transformButton;
let basePixelDebugOutput; // New element for debug output

// Global variables for animation state
let currentPixelIndex = 0;
let animationFrameId = null;
let outputImageData = null;
let outputPixels = null;
let baseImagePixelCounts = null; // Map to store unique base colors and their available counts
let targetPixels = null;
let outputCtx = null;

const FALLBACK_COLOR = [255, 255, 255, 255]; // White with full opacity, used when base pixels are exhausted

// Function to initialize DOM elements and event listeners
function init() {
    baseImageInput = document.getElementById('baseImageInput');
    targetImageInput = document.getElementById('targetImageInput');
    baseCanvas = document.getElementById('baseCanvas');
    targetCanvas = document.getElementById('targetCanvas');
    outputCanvas = document.getElementById('outputCanvas');
    transformButton = document.getElementById('transformButton');
    basePixelDebugOutput = document.getElementById('basePixelDebugOutput'); // Get reference to new debug output div

    // Set canvas internal dimensions (which is the actual resolution)
    baseCanvas.width = CANVAS_SIZE;
    baseCanvas.height = CANVAS_SIZE;
    targetCanvas.width = CANVAS_SIZE;
    targetCanvas.height = CANVAS_SIZE;
    outputCanvas.width = CANVAS_SIZE;
    outputCanvas.height = CANVAS_SIZE;

    // Event listeners
    baseImageInput.addEventListener('change', (event) => loadImageToCanvas(event, baseCanvas, true)); // Pass true for base image
    targetImageInput.addEventListener('change', (event) => loadImageToCanvas(event, targetCanvas, false)); // Pass false for target image
    transformButton.addEventListener('click', transformImage);
}

/**
 * Loads an image from a file input and draws it to a specified canvas,
 * downscaling it to CANVAS_SIZE x CANVAS_SIZE.
 * @param {Event} event The change event from the file input.
 * @param {HTMLCanvasElement} canvas The canvas to draw the image onto.
 * @param {boolean} isBaseImage True if this is the base image, false otherwise.
 */
async function loadImageToCanvas(event, canvas, isBaseImage) {
    const file = event.target.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous image

        // Create a temporary canvas for accurate downscaling
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        tempCanvas.width = CANVAS_SIZE;
        tempCanvas.height = CANVAS_SIZE;

        // Draw image to temporary canvas, scaled to CANVAS_SIZE x CANVAS_SIZE
        tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

        // Draw the scaled image from temp canvas to the actual canvas
        ctx.drawImage(tempCanvas, 0, 0);

        URL.revokeObjectURL(img.src); // Clean up object URL to free memory

        if (isBaseImage) {
            // Calculate and display pixel counts for the base image
            const counts = getBaseImagePixelCounts(baseCanvas);
            displayBasePixelDebug(counts);
        }
    };
    img.onerror = () => {
        console.error("Error loading image.");
        URL.revokeObjectURL(img.src);
    };
}

/**
 * Extracts pixel data (RGBA array) from a given canvas.
 * @param {HTMLCanvasElement} canvas The canvas to get pixels from.
 * @returns {Uint8ClampedArray} A flat array of R, G, B, A values.
 */
function getPixelsFromCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return imageData.data;
    } catch (e) {
        console.error("Could not get image data from canvas. Ensure it's not tainted or empty.", e);
        return new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4); // Return empty data
    }
}

/**
 * Helper to serialize color array to a string key.
 * @param {Array<number>} color An array [r, g, b, a].
 * @returns {string} A string representation of the color.
 */
function colorArrayToKey(color) {
    return color.join(',');
}

/**
 * Extracts unique pixel colors and their counts from the base image canvas.
 * @param {HTMLCanvasElement} baseCanvas The canvas containing the base image.
 * @returns {Map<string, { r: number, g: number, b: number, a: number, currentCount: number }>}
 *          A map where keys are "r,g,b,a" strings and values are objects
 *          containing the color components and their available count.
 */
function getBaseImagePixelCounts(baseCanvas) {
    const pixels = getPixelsFromCanvas(baseCanvas);
    const colorCounts = new Map();

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        const color = { r, g, b, a };
        const key = colorArrayToKey([r, g, b, a]);

        if (colorCounts.has(key)) {
            colorCounts.get(key).currentCount++;
        } else {
            colorCounts.set(key, { ...color, currentCount: 1 });
        }
    }
    return colorCounts;
}

/**
 * Displays the unique pixel colors and their initial counts from the base image
 * in the debug output section.
 * @param {Map<string, { r: number, g: number, b: number, a: number, currentCount: number }>} countsMap
 *        A map of color keys to color data objects.
 */
function displayBasePixelDebug(countsMap) {
    basePixelDebugOutput.innerHTML = ''; // Clear previous content

    if (countsMap.size === 0) {
        basePixelDebugOutput.innerHTML = '<p>No pixel data found in the base image.</p>';
        return;
    }

    // Sort colors for consistent display (e.g., by hex value or by count)
    const sortedColors = Array.from(countsMap.entries()).sort(([,a], [,b]) => b.currentCount - a.currentCount);

    for (const [key, colorData] of sortedColors) {
        const pixelItem = document.createElement('div');
        pixelItem.className = 'pixel-item';

        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'color-swatch';
        colorSwatch.style.backgroundColor = `rgba(${colorData.r}, ${colorData.g}, ${colorData.b}, ${colorData.a / 255})`;
        
        const colorText = document.createElement('span');
        colorText.textContent = `RGBA(${colorData.r}, ${colorData.g}, ${colorData.b}, ${colorData.a}) - Count: ${colorData.currentCount}`;

        pixelItem.appendChild(colorSwatch);
        pixelItem.appendChild(colorText);
        basePixelDebugOutput.appendChild(pixelItem);
    }
}

/**
 * Calculates the squared Euclidean distance between two RGBA colors.
 * This version includes the alpha channel in the distance calculation to ensure
 * transparency is also considered when finding the "closest" base image pixel.
 * @param {Array<number>} color1 An array [r, g, b, a].
 * @param {Array<number>} color2 An array [r, g, b, a].
 * @returns {number} The squared distance between the two colors.
 */
function colorDistanceSq(color1, color2) {
    const dr = color1[0] - color2[0];
    const dg = color1[1] - color2[1];
    const db = color1[2] - color2[2];
    const da = color1[3] - color2[3]; // Include alpha in distance calculation
    return dr * dr + dg * dg + db * db + da * da;
}

/**
 * The animation loop for transforming the image incrementally.
 * It processes a batch of pixels and updates the output canvas,
 * then schedules itself for the next frame.
 */
function animateTransformation() {
    // Process a batch of pixels (e.g., one row at a time)
    const pixelsPerFrame = CANVAS_SIZE * 1; // Number of pixels to process per animation frame (1 row)

    let processedCount = 0;
    while (processedCount < pixelsPerFrame && currentPixelIndex < (CANVAS_SIZE * CANVAS_SIZE * 4)) {
        const i = currentPixelIndex;

        // Get the target pixel's RGBA color
        const targetColor = [
            targetPixels[i],
            targetPixels[i + 1],
            targetPixels[i + 2],
            targetPixels[i + 3]
        ];

        let closestColor = FALLBACK_COLOR; // Default to white fallback if no base colors are available
        let minDistanceSq = Infinity;
        let chosenColorKey = null;

        // Iterate through available base colors (those with currentCount > 0)
        for (const [key, colorData] of baseImagePixelCounts.entries()) {
            if (colorData.currentCount > 0) {
                const basePixelColorArray = [colorData.r, colorData.g, colorData.b, colorData.a];
                const distSq = colorDistanceSq(targetColor, basePixelColorArray);

                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestColor = basePixelColorArray;
                    chosenColorKey = key;
                }
            }
        }

        // Apply the chosen color (or fallback) to the output pixel
        outputPixels[i] = closestColor[0];
        outputPixels[i + 1] = closestColor[1];
        outputPixels[i + 2] = closestColor[2];
        outputPixels[i + 3] = closestColor[3];

        // Decrement count for the chosen base color if it was an actual base color (not fallback)
        if (chosenColorKey !== null) {
            baseImagePixelCounts.get(chosenColorKey).currentCount--;
        }

        currentPixelIndex += 4; // Move to the next pixel (4 components: R, G, B, A)
        processedCount++;
    }

    // Update the canvas immediately after processing the batch of pixels
    outputCtx.putImageData(outputImageData, 0, 0);

    // Continue animation if there are more pixels to process
    if (currentPixelIndex < (CANVAS_SIZE * CANVAS_SIZE * 4)) {
        animationFrameId = requestAnimationFrame(animateTransformation);
    } else {
        // Animation finished
        console.log("Transformation complete!");
        transformButton.disabled = false; // Re-enable button
    }
}

/**
 * Main function to transform the target image using pixels from the base image.
 * This now sets up and starts an animated, incremental transformation.
 */
function transformImage() {
    // Disable the button to prevent multiple transformations at once
    transformButton.disabled = true;

    // Stop any ongoing animation
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    // --- One-time setup for transformation ---
    // Get unique pixel colors and their counts from the base image.
    // This ensures a fresh set of counts for each transformation.
    baseImagePixelCounts = getBaseImagePixelCounts(baseCanvas);
    if (baseImagePixelCounts.size === 0) {
        alert("Please upload a base image first and ensure it has pixel data.");
        transformButton.disabled = false;
        return;
    }

    targetPixels = getPixelsFromCanvas(targetCanvas);
    if (targetPixels.length === 0 || targetPixels.every(val => val === 0)) {
        alert("Please upload a target image first and ensure it has pixel data.");
        transformButton.disabled = false;
        return;
    }

    outputCtx = outputCanvas.getContext('2d');
    // Clear the output canvas before starting a new transformation to ensure a clean slate
    outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    // Create new ImageData for the output, initially transparent black
    outputImageData = outputCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    outputPixels = outputImageData.data;

    // Reset pixel counter for the new animation
    currentPixelIndex = 0;

    // Start the animation loop
    animationFrameId = requestAnimationFrame(animateTransformation);
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);