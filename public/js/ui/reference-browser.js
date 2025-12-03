import {
    toolModelBtn, referenceBrowser, btnBrowserClose, browserUrlInput, btnBrowserGo, browserHeader, imageResultsGrid,
    btnBrowserPin, browserOpacity, btnBrowserUnpin, layersList, canvasWrapper, gameToolbar
} from '../dom-elements.js';
import { state } from '../state.js';
import { showToast } from '../utils.js';
import { CANVAS_CONFIG } from '../config.js';
import { socket } from '../dom-elements.js'; // socket is exported from dom-elements.js in ui-manager imports, let's verify

export class ReferenceBrowser {
    constructor() {
        this.currentHits = [];
        this.currentSingleImageUrl = null;
        this.init();
    }

    init() {
        if (!toolModelBtn || !referenceBrowser) return;

        // Toggle Visibility
        toolModelBtn.addEventListener('click', () => {
            const isHidden = referenceBrowser.classList.contains('hidden');
            referenceBrowser.classList.toggle('hidden');
            toolModelBtn.classList.toggle('active');

            if (isHidden) {
                // Auto-search if word is defined
                const wordText = document.getElementById('word-display')?.textContent.trim();
                if (wordText && !wordText.includes('_')) {
                    this.searchImages(wordText);
                } else if (imageResultsGrid && imageResultsGrid.children.length <= 1) { // Empty or just empty-state
                     // Focus input
                     if (browserUrlInput) browserUrlInput.focus();
                }
            }
        });

        if (btnBrowserClose) {
            btnBrowserClose.addEventListener('click', () => {
                referenceBrowser.classList.add('hidden');
                toolModelBtn.classList.remove('active');
            });
        }

        if (btnBrowserGo) {
            btnBrowserGo.addEventListener('click', () => { this.searchImages(); });
        }

        if (browserUrlInput) {
            browserUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchImages();
            });
        }

        // Dragging
        if (browserHeader) {
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            browserHeader.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return; // Don't drag if clicking buttons
                
                isDragging = true;
                
                startX = e.clientX;
                startY = e.clientY;
                initialLeft = referenceBrowser.offsetLeft;
                initialTop = referenceBrowser.offsetTop;
                
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;

                // Clamp to viewport
                const rect = referenceBrowser.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                if (newLeft < 0) newLeft = 0;
                if (newLeft + width > viewportWidth) newLeft = viewportWidth - width;
                if (newTop < 0) newTop = 0;
                if (newTop + height > viewportHeight) newTop = viewportHeight - height;

                referenceBrowser.style.left = newLeft + 'px';
                referenceBrowser.style.top = newTop + 'px';
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
        }

        // Listen for custom event from Layers or Button
        document.addEventListener('request-toggle-pin-mode', (e) => {
            this.togglePinMode(e.detail.active);
        });

        if (btnBrowserPin) btnBrowserPin.addEventListener('click', () => this.togglePinMode(true));
        if (btnBrowserUnpin) btnBrowserUnpin.addEventListener('click', () => this.togglePinMode(false));

        if (browserOpacity) {
            browserOpacity.addEventListener('input', (e) => {
                const tracingImage = document.getElementById('tracing-image');
                if (tracingImage) {
                    tracingImage.style.opacity = e.target.value;
                }
            });
        }

        // Auto-cleanup on turn end
        const cleanupTracing = () => {
             this.togglePinMode(false);
             if (referenceBrowser) referenceBrowser.classList.add('hidden');
             if (toolModelBtn) toolModelBtn.classList.remove('active');
             if (imageResultsGrid) imageResultsGrid.innerHTML = '';
             if (browserUrlInput) browserUrlInput.value = '';
        };

        socket.on('turnStart', cleanupTracing);
        socket.on('roundEnd', cleanupTracing);
        socket.on('gameEnded', cleanupTracing);

        // Creative & Telephone Mode Cleanup
        socket.on('creativeRoundStart', cleanupTracing);
        socket.on('creativeRoundEnd', cleanupTracing);
        socket.on('telephoneRoundStart', cleanupTracing);
        socket.on('telephoneRoundEnd', cleanupTracing);
    }

    renderGrid() {
        this.currentSingleImageUrl = null;
        if (!imageResultsGrid) return;
        
        imageResultsGrid.innerHTML = '';
        imageResultsGrid.classList.remove('single-view');
        
        if (this.currentHits.length > 0) {
            this.currentHits.forEach(hit => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'image-result-item';
                
                const img = document.createElement('img');
                img.src = hit.previewURL;
                img.alt = hit.tags;
                img.title = hit.tags;
                
                // Click to open in single view
                imgContainer.onclick = () => {
                    this.showSingleImage(hit.webformatURL);
                };
                
                imgContainer.appendChild(img);
                imageResultsGrid.appendChild(imgContainer);
            });
        } else {
            imageResultsGrid.innerHTML = '<div class="empty-state">Aucune image trouvée.</div>';
        }
    }

    showSingleImage(url) {
        this.currentSingleImageUrl = url;
        if (!imageResultsGrid) return;
        
        imageResultsGrid.innerHTML = '';
        imageResultsGrid.classList.add('single-view');
        
        const container = document.createElement('div');
        container.className = 'single-image-view';
        
        // Header with Back and Use buttons
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '10px';

        const backBtn = document.createElement('button');
        backBtn.className = 'back-to-grid-btn';
        backBtn.innerHTML = '<i class="fas fa-arrow-left"></i> Retour';
        backBtn.onclick = () => {
            this.renderGrid();
        };

        const useBtn = document.createElement('button');
        useBtn.className = 'use-as-layer-btn';
        useBtn.innerHTML = 'Utiliser comme calque <i class="fas fa-check"></i>';

        // Check if user can draw
        const canDraw = () => {
            if (state.isSpectator) return false;
            
            // Allow in Lobby/Configuring
            if (state.currentGameState === 'LOBBY' || state.currentGameState === 'CONFIGURING' || state.currentGameState === 'WAITING') return true;

            if (state.currentGameState !== 'PLAYING') return false;
            
            // Check global setting (default to true if undefined)
            const allowTracing = state.settings ? (state.settings.allowTracing !== false) : true;
            if (!allowTracing) return false;

            if (state.settings && (state.settings.mode === 'creative' || state.settings.mode === 'telephone')) {
                return true;
            } else {
                return state.currentDrawerId === socket.id;
            }
        };

        if (!canDraw()) {
            useBtn.disabled = true;
            useBtn.title = "Vous ne pouvez pas dessiner pour le moment";
            useBtn.style.opacity = '0.5';
            useBtn.style.cursor = 'not-allowed';
        } else {
            useBtn.onclick = () => {
                // Trigger pin mode
                const event = new CustomEvent('request-toggle-pin-mode', { detail: { active: true } });
                document.dispatchEvent(event);
            };
        }
        
        header.appendChild(backBtn);
        header.appendChild(useBtn);

        const imgContainer = document.createElement('div');
        imgContainer.className = 'single-image-container';
        
        const img = document.createElement('img');
        img.src = url;
        
        imgContainer.appendChild(img);
        container.appendChild(header);
        container.appendChild(imgContainer);
        
        imageResultsGrid.appendChild(container);
    }

    async searchImages(query = null) {
        let searchTerm = query || browserUrlInput.value.trim();
        if (!searchTerm) return;

        // Update input if direct call
        if (query) browserUrlInput.value = query;

        // Show loading state
        if (imageResultsGrid) {
            imageResultsGrid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';
        }

        try {
            const response = await fetch(`/api/pixabay?q=${encodeURIComponent(searchTerm)}`);
            const data = await response.json();

            if (data.hits) {
                this.currentHits = data.hits;
                this.renderGrid();
            } else {
                 if (imageResultsGrid) imageResultsGrid.innerHTML = '<div class="empty-state">Aucune image trouvée.</div>';
            }
        } catch (error) {
            console.error('Search error:', error);
            if (imageResultsGrid) {
                imageResultsGrid.innerHTML = '<div class="empty-state">Erreur lors de la recherche.</div>';
            }
        }
    }

    togglePinMode(active) {
        if (active) {
            // Cleanup existing tracing elements first
            const existingImage = document.getElementById('tracing-image');
            if (existingImage) existingImage.remove();

            const existingControls = document.getElementById('tracing-controls');
            if (existingControls) {
                if (existingControls.cleanup) existingControls.cleanup();
                existingControls.remove();
            }

            const existingDummy = document.getElementById('dummy-model-layer');
            if (existingDummy) existingDummy.remove();

            const existingCartridge = document.getElementById('tracing-actions-cartridge');
            if (existingCartridge) existingCartridge.remove();
            
            // Reset clipping and add model class
            if (canvasWrapper) {
                canvasWrapper.classList.remove('clipped');
                canvasWrapper.classList.add('has-model');
            }

            if (!this.currentSingleImageUrl) {
                showToast("Veuillez sélectionner une image d'abord", "warning");
                return;
            }

            // Create Tracing Image
            if (canvasWrapper) {
                const img = new Image();
                // Add crossOrigin to avoid tainting issues if we were to draw it (though we just display it)
                img.crossOrigin = "Anonymous"; 
                img.src = this.currentSingleImageUrl;

                img.onerror = () => {
                    showToast("Impossible de charger l'image modèle.", "error");
                    // Clean up if image fails
                    this.togglePinMode(false);
                };

                img.onload = () => {
                    // Calculate dimensions
                    const canvasW = CANVAS_CONFIG.width;
                    const canvasH = CANVAS_CONFIG.height;

                    const imgRatio = img.width / img.height;
                    const canvasRatio = canvasW / canvasH;

                    let finalW, finalH, finalTop, finalLeft;

                    if (imgRatio > canvasRatio) {
                        // Width constrained
                        finalW = canvasW;
                        finalH = canvasW / imgRatio;
                        finalLeft = 0;
                        finalTop = (canvasH - finalH) / 2;
                    } else {
                        // Height constrained
                        finalH = canvasH;
                        finalW = canvasH * imgRatio;
                        finalTop = 0;
                        finalLeft = (canvasW - finalW) / 2;
                    }

                    let tracingImage = document.createElement('img');
                    tracingImage.id = 'tracing-image';
                    tracingImage.className = 'tracing-image';
                    canvasWrapper.appendChild(tracingImage);
                    
                    tracingImage.src = this.currentSingleImageUrl;
                    tracingImage.style.width = finalW + 'px';
                    tracingImage.style.height = finalH + 'px';
                    tracingImage.style.left = finalLeft + 'px';
                    tracingImage.style.top = finalTop + 'px';
                    tracingImage.style.objectFit = 'fill'; // Since we control size
                    
                    if (browserOpacity) {
                        tracingImage.style.opacity = browserOpacity.value;
                    }

                    // Create Controls Element
                    let tracingControls = document.createElement('div');
                    tracingControls.id = 'tracing-controls';
                    tracingControls.className = 'tracing-controls';
                    tracingControls.innerHTML = `
                        <div class="resize-handle nw" data-dir="nw"></div>
                        <div class="resize-handle ne" data-dir="ne"></div>
                        <div class="resize-handle sw" data-dir="sw"></div>
                        <div class="resize-handle se" data-dir="se"></div>
                    `;
                    canvasWrapper.appendChild(tracingControls);
                    
                    tracingControls.style.width = finalW + 'px';
                    tracingControls.style.height = finalH + 'px';
                    tracingControls.style.left = finalLeft + 'px';
                    tracingControls.style.top = finalTop + 'px';

                    // Setup Resize Handlers
                    this.setupResizeHandlers(tracingControls, tracingImage, imgRatio);
                };
            }

            document.body.classList.add('tracing-mode');
            
            // Add Dummy Layer
            if (layersList) {
                const dummyLayer = document.createElement('div');
                dummyLayer.className = 'layer-item dummy';
                dummyLayer.id = 'dummy-model-layer';
                dummyLayer.style.flexDirection = 'column';
                dummyLayer.style.alignItems = 'stretch';
                dummyLayer.style.gap = '5px';
                dummyLayer.style.padding = '8px';
                
                dummyLayer.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                        <div class="layer-visibility visible"><i class="fas fa-image"></i></div>
                        <div class="layer-name-container">
                            <span class="layer-name-display">Modèle</span>
                        </div>
                        <button class="layer-btn delete" id="btn-detach-model" title="Détacher">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="padding-left: 24px; padding-right: 5px; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-adjust" style="font-size: 0.8rem; color: var(--text-dim);"></i>
                        <input type="range" class="layer-opacity-slider" id="model-opacity-slider" min="0" max="1" step="0.05" value="${browserOpacity ? browserOpacity.value : 0.5}" title="Opacité" style="flex: 1;">
                    </div>
                `;
                layersList.appendChild(dummyLayer);

                // Attach listeners to dummy layer controls
                const detachBtn = document.getElementById('btn-detach-model');
                if (detachBtn) {
                    detachBtn.addEventListener('click', () => this.togglePinMode(false));
                }

                const opacitySlider = document.getElementById('model-opacity-slider');
                if (opacitySlider) {
                    opacitySlider.addEventListener('input', (e) => {
                        const tracingImage = document.getElementById('tracing-image');
                        if (tracingImage) {
                            tracingImage.style.opacity = e.target.value;
                        }
                        if (browserOpacity) browserOpacity.value = e.target.value;
                    });
                }
            }

            // Add Tracing Cartridge to Toolbar
            let tracingCartridge = document.getElementById('tracing-actions-cartridge');
            if (!tracingCartridge && gameToolbar) {
                tracingCartridge = document.createElement('div');
                tracingCartridge.id = 'tracing-actions-cartridge';
                tracingCartridge.className = 'tracing-actions-cartridge';
                
                // Validate Button
                const validateBtn = document.createElement('button');
                validateBtn.className = 'tracing-btn-validate';
                validateBtn.innerHTML = '<i class="fas fa-check"></i> Valider';
                validateBtn.title = "Valider la pose";
                
                validateBtn.addEventListener('click', () => {
                    // Remove controls but keep image
                    const tracingControls = document.getElementById('tracing-controls');
                    if (tracingControls) {
                        if (tracingControls.cleanup) tracingControls.cleanup();
                        tracingControls.remove();
                    }
                    // Exit mode but keep image
                    document.body.classList.remove('tracing-mode');
                    tracingCartridge.remove();
                    
                    // Clip overflow
                    if (canvasWrapper) {
                        canvasWrapper.classList.add('clipped');
                        canvasWrapper.classList.add('has-model');
                    }
                    
                    showToast('Pose validée. Vous pouvez dessiner par dessus.', 'success');
                });

                // Cancel Button
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'tracing-btn-cancel';
                cancelBtn.innerHTML = '<i class="fas fa-times"></i> Annuler';
                cancelBtn.title = "Annuler";

                cancelBtn.addEventListener('click', () => {
                    this.togglePinMode(false); // Full cleanup
                });

                tracingCartridge.appendChild(validateBtn);
                tracingCartridge.appendChild(cancelBtn);
                gameToolbar.appendChild(tracingCartridge);
            }

            showToast('Mode Calque activé', 'info');
        } else {
            document.body.classList.remove('tracing-mode');
            
            // Remove Tracing Image
            const tracingImage = document.getElementById('tracing-image');
            if (tracingImage) tracingImage.remove();

            // Remove Controls
            const tracingControls = document.getElementById('tracing-controls');
            if (tracingControls) {
                if (tracingControls.cleanup) tracingControls.cleanup();
                tracingControls.remove();
            }

            // Remove Dummy Layer
            const dummyLayer = document.getElementById('dummy-model-layer');
            if (dummyLayer) dummyLayer.remove();

            // Remove Tracing Cartridge
            const tracingCartridge = document.getElementById('tracing-actions-cartridge');
            if (tracingCartridge) tracingCartridge.remove();
            
            // Reset clipping and remove model class
            if (canvasWrapper) {
                canvasWrapper.classList.remove('clipped');
                canvasWrapper.classList.remove('has-model');
            }
        }
    }

    setupResizeHandlers(controls, image, aspectRatio) {
        const handles = controls.querySelectorAll('.resize-handle');
        let isResizing = false;
        let isMoving = false;
        let startX, startY, startW, startH, startTop, startLeft;
        let currentHandle = null;

        // Resize Logic
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                isResizing = true;
                currentHandle = handle.dataset.dir;
                
                startX = e.clientX;
                startY = e.clientY;
                
                startW = controls.offsetWidth;
                startH = controls.offsetHeight;
                startTop = controls.offsetTop;
                startLeft = controls.offsetLeft;

                document.body.style.cursor = window.getComputedStyle(handle).cursor;
                document.body.style.userSelect = 'none'; // Prevent text selection
            });
        });

        // Move Logic - Click anywhere on controls (which covers image)
        controls.addEventListener('mousedown', (e) => {
            // Ignore if clicking a resize handle (though stopPropagation handles this usually)
            if (e.target.classList.contains('resize-handle')) return;

            isMoving = true;
            
            startX = e.clientX;
            startY = e.clientY;
            
            startTop = controls.offsetTop;
            startLeft = controls.offsetLeft;
            
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none'; // Prevent text selection
            e.preventDefault();
        });

        const onMouseMove = (e) => {
            if (!isResizing && !isMoving) return;

            // Get scale factor
            let scale = 1;
            if (canvasWrapper) {
                const transform = canvasWrapper.style.transform;
                const match = transform.match(/scale\(([\d.]+)\)/);
                if (match) scale = parseFloat(match[1]);
            }

            const dx = (e.clientX - startX) / scale;
            const dy = (e.clientY - startY) / scale;

            if (isMoving) {
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;
                
                controls.style.left = newLeft + 'px';
                controls.style.top = newTop + 'px';
                image.style.left = newLeft + 'px';
                image.style.top = newTop + 'px';
            } else if (isResizing) {
                let newW = startW;
                let newH = startH;
                let newTop = startTop;
                let newLeft = startLeft;

                if (currentHandle.includes('e')) {
                    newW = startW + dx;
                }
                if (currentHandle.includes('w')) {
                    newW = startW - dx;
                    newLeft = startLeft + dx;
                }
                if (currentHandle.includes('s')) {
                    newH = startH + dy;
                }
                if (currentHandle.includes('n')) {
                    newH = startH - dy;
                    newTop = startTop + dy;
                }

                // Aspect Ratio Lock
                if (aspectRatio) {
                    // Simple implementation: prioritize width change unless only height changed
                    if (currentHandle === 'n' || currentHandle === 's') {
                        newW = newH * aspectRatio;
                        if (currentHandle === 'n') {
                            // Adjust left to keep center? No, standard resize behavior
                            // Actually, if we change height, width changes. 
                            // If we pull North, Top changes, Height changes. Width must change.
                            // Center-based resize is complex. Corner-based:
                            // If NW: Top changes, Left changes.
                        }
                    } else {
                        newH = newW / aspectRatio;
                        if (currentHandle.includes('n')) {
                            newTop = startTop + (startH - newH);
                        }
                    }
                }

                // Min size
                if (newW < 50) newW = 50;
                if (newH < 50) newH = 50;

                controls.style.width = newW + 'px';
                controls.style.height = newH + 'px';
                controls.style.top = newTop + 'px';
                controls.style.left = newLeft + 'px';
                
                image.style.width = newW + 'px';
                image.style.height = newH + 'px';
                image.style.top = newTop + 'px';
                image.style.left = newLeft + 'px';
            }
        };

        const onMouseUp = () => {
            isResizing = false;
            isMoving = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Cleanup function to remove listeners when controls are removed
        controls.cleanup = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }
}
