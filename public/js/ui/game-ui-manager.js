import {
    toolbarDragHandle, gameToolbar, sidebarCol2, sidebarGroup, chatSidebar, btnToggleSidebarPos, gameScreen,
    btnIamReady, btnRefuseGame, activeGamesCount, spectatorCheckbox
} from '../dom-elements.js';
import { socket } from '../dom-elements.js';
import { state } from '../state.js';
import { showToast } from '../utils.js';

export class GameUIManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.currentCounts = { playable: 0, observable: 0 };
        this.init();
    }

    init() {
        this.initLayout();
        this.initGameCount();

        // Ready Check
        btnIamReady.addEventListener('click', () => {
            socket.emit('playerReady', state.currentRoom);
            btnIamReady.classList.add('waiting');
            btnIamReady.textContent = 'EN ATTENTE...';
            btnIamReady.disabled = true;
        });

        if (btnRefuseGame) {
            btnRefuseGame.addEventListener('click', () => {
                socket.emit('playerRefused', state.currentRoom);
            });
        }
    }

    initLayout() {
        // Sidebar Swap Logic
        const savedSwapSidebars = localStorage.getItem('drawit_swap_sidebars');
        let isSwapped = false;
        if (savedSwapSidebars !== null) {
            isSwapped = savedSwapSidebars === 'true';
            this.toggleSidebarLayout(isSwapped);
        }

        if (btnToggleSidebarPos) {
            btnToggleSidebarPos.addEventListener('click', () => {
                isSwapped = !isSwapped;
                localStorage.setItem('drawit_swap_sidebars', isSwapped);
                this.toggleSidebarLayout(isSwapped);
            });
        }

        // Movable Toolbar Logic
        if (toolbarDragHandle && gameToolbar) {
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;

            toolbarDragHandle.addEventListener('mousedown', (e) => {
                isDragging = true;
                
                // Get current position relative to viewport BEFORE adding classes
                const rect = gameToolbar.getBoundingClientRect();
                
                gameToolbar.classList.add('dragging');
                gameToolbar.classList.add('custom-pos');
                
                // Get parent position to calculate relative coordinates
                const parentRect = gameToolbar.parentElement.getBoundingClientRect();
                
                gameToolbar.style.transformOrigin = 'top left';
                gameToolbar.style.transform = 'scale(var(--scale-factor))';
                
                // Calculate relative position
                const relativeLeft = rect.left - parentRect.left;
                const relativeTop = rect.top - parentRect.top;
                
                gameToolbar.style.left = relativeLeft + 'px';
                gameToolbar.style.top = relativeTop + 'px';
                gameToolbar.style.bottom = 'auto';

                startX = e.clientX;
                startY = e.clientY;
                initialLeft = relativeLeft;
                initialTop = relativeTop;

                e.preventDefault(); // Prevent text selection
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;

                // Clamp to viewport
                const rect = gameToolbar.getBoundingClientRect();
                const parentRect = gameToolbar.parentElement.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const minLeft = -parentRect.left;
                const maxLeft = viewportWidth - width - parentRect.left;
                
                const minTop = -parentRect.top;
                const maxTop = viewportHeight - height - parentRect.top;

                if (newLeft < minLeft) newLeft = minLeft;
                if (newLeft > maxLeft) newLeft = maxLeft;
                if (newTop < minTop) newTop = minTop;
                if (newTop > maxTop) newTop = maxTop;

                gameToolbar.style.left = newLeft + 'px';
                gameToolbar.style.top = newTop + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                gameToolbar.classList.remove('dragging');
            });

            // Handle Resize to keep toolbar in view
            window.addEventListener('resize', () => {
                if (gameToolbar.classList.contains('custom-pos')) {
                    const rect = gameToolbar.getBoundingClientRect();
                    const parentRect = gameToolbar.parentElement.getBoundingClientRect();
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    
                    let newLeft = parseFloat(gameToolbar.style.left);
                    let newTop = parseFloat(gameToolbar.style.top);
                    let changed = false;

                    const minLeft = -parentRect.left;
                    const maxLeft = viewportWidth - rect.width - parentRect.left;
                    const minTop = -parentRect.top;
                    const maxTop = viewportHeight - rect.height - parentRect.top;

                    if (newLeft < minLeft) { newLeft = minLeft; changed = true; }
                    if (newLeft > maxLeft) { newLeft = maxLeft; changed = true; }
                    if (newTop < minTop) { newTop = minTop; changed = true; }
                    if (newTop > maxTop) { newTop = maxTop; changed = true; }

                    if (changed) {
                        gameToolbar.style.left = newLeft + 'px';
                        gameToolbar.style.top = newTop + 'px';
                    }
                }
            });
        }
    }

    toggleSidebarLayout(isSwapped) {
        if (!sidebarCol2 || !sidebarGroup || !gameScreen || !chatSidebar) return;

        const icon = btnToggleSidebarPos ? btnToggleSidebarPos.querySelector('i') : null;

        if (isSwapped) {
            // Move Col2 to right (before chat sidebar)
            gameScreen.insertBefore(sidebarCol2, chatSidebar);
            sidebarCol2.classList.add('right-side');
            if (icon) {
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-left');
            }
        } else {
            // Move Col2 back to group
            sidebarGroup.appendChild(sidebarCol2);
            sidebarCol2.classList.remove('right-side');
            if (icon) {
                icon.classList.remove('fa-chevron-left');
                icon.classList.add('fa-chevron-right');
            }
        }
    }

    initGameCount() {
        socket.emit('getPublicGameCount');

        socket.on('updatePublicGameCount', (counts) => {
            if (typeof counts === 'number') {
                this.currentCounts = { playable: counts, observable: counts };
            } else {
                this.currentCounts = counts;
            }
            this.updateGameCountDisplay();
        });
    }

    updateGameCountDisplay() {
        if (!activeGamesCount) return;

        const isSpectator = spectatorCheckbox ? spectatorCheckbox.checked : false;
        let count = 0;

        if (isSpectator) {
            const filterSelect = document.getElementById('spectator-filter-select');
            const filter = filterSelect ? filterSelect.value : 'all';

            if (this.currentCounts.observable && typeof this.currentCounts.observable === 'object') {
                count = this.currentCounts.observable[filter] || 0;
            } else {
                count = typeof this.currentCounts.observable === 'number' ? this.currentCounts.observable : 0;
            }
        } else {
            count = this.currentCounts.playable || 0;
        }

        if (count === 0) {
            activeGamesCount.textContent = "Aucune";
        } else {
            activeGamesCount.textContent = count;
        }

        const suffix = count > 1 ? ' rooms disponibles' : ' room disponible';
        if (activeGamesCount.nextSibling) {
            activeGamesCount.nextSibling.textContent = ` ${suffix}`;
        }
    }
}
