export const socket = io();

// Screens
export const loginScreen = document.getElementById('login-screen');
export const gameScreen = document.getElementById('game-screen');

// Login / Lobby
export const usernameInput = document.getElementById('username');
export const roomCodeInput = document.getElementById('room-code-input');
export const joinBtn = document.getElementById('join-btn');
export const createBtn = document.getElementById('create-btn');
export const displayRoomCode = document.getElementById('display-room-code');
export const playersList = document.getElementById('players-list');
export const lobbyControls = document.getElementById('lobby-controls');
export const waitingMessage = document.getElementById('waiting-message');

// Canvas Area
export const canvas = document.getElementById('drawing-board');
export const ctx = canvas.getContext('2d', { willReadFrequently: true });
export const cursorsLayer = document.getElementById('cursors-layer');
export const canvasWrapper = document.querySelector('.canvas-wrapper');
export const zoomLevelDisplay = document.getElementById('zoom-overlay');
export const layersList = document.getElementById('layers-list');
export const addLayerBtn = document.getElementById('add-layer-btn');

// Toolbar
export const penColorInput = document.getElementById('pen-color');
export const colorTrigger = document.getElementById('color-trigger');
export const colorPopover = document.getElementById('color-popover');
export const colorGrid = document.getElementById('color-grid');
export const currentColorPreview = document.getElementById('current-color-preview');

export const penSizeInput = document.getElementById('pen-size');
export const penOpacityInput = document.getElementById('pen-opacity');

export const toolPenBtn = document.getElementById('tool-pen');
export const toolEraserBtn = document.getElementById('tool-eraser');
export const toolFillBtn = document.getElementById('tool-fill');
export const toolSmudgeBtn = document.getElementById('tool-smudge');
export const toolAirbrushBtn = document.getElementById('tool-airbrush');
export const toolRectBtn = document.getElementById('tool-rect');
export const toolCircleBtn = document.getElementById('tool-circle');
export const toolTriangleBtn = document.getElementById('tool-triangle');
export const toolLineBtn = document.getElementById('tool-line');
export const clearBtn = document.getElementById('clear-btn');
export const btnUndo = document.getElementById('btn-undo');

// Modals
export const confirmationModal = document.getElementById('confirmation-modal');
export const confirmOkBtn = document.getElementById('confirm-ok');
export const confirmCancelBtn = document.getElementById('confirm-cancel');

export const kickModal = document.getElementById('kick-confirmation-modal');
export const kickPlayerName = document.getElementById('kick-player-name');
export const btnKickCancel = document.getElementById('kick-cancel');
export const btnKickConfirm = document.getElementById('kick-confirm');

export const alertModal = document.getElementById('alert-modal');
export const alertTitle = document.getElementById('alert-title');
export const alertMessage = document.getElementById('alert-message');
export const alertOkBtn = document.getElementById('alert-ok');

export const wordChoiceModal = document.getElementById('word-choice-modal');
export const wordChoicesContainer = document.getElementById('word-choices-container');
export const wordChoiceTimerVal = document.getElementById('word-choice-timer-val');

export const roundResultOverlay = document.getElementById('round-result-overlay');
export const roundResultTitle = document.getElementById('round-result-title');
export const roundResultWord = document.getElementById('round-result-word');
export const roundResultScores = document.getElementById('round-result-scores');

export const gameEndModal = document.getElementById('game-end-modal');
export const gameEndScores = document.getElementById('game-end-scores');
export const btnReturnLobby = document.getElementById('btn-return-lobby');

export const readyCheckModal = document.getElementById('ready-check-modal');
export const btnIamReady = document.getElementById('btn-i-am-ready');
export const readyCountVal = document.getElementById('ready-count-val');
export const readyTotalVal = document.getElementById('ready-total-val');
export const readyTimerVal = document.getElementById('ready-timer-val');
export const readyPlayersList = document.getElementById('ready-players-list');

export const lobbySettingsModal = document.getElementById('lobby-settings-modal');
export const btnCloseSettings = document.getElementById('btn-close-settings');
export const btnStartGame = document.getElementById('btn-start-game');
export const btnOpenSettings = document.getElementById('btn-open-settings');

// Game Top Bar
export const gameTopBar = document.getElementById('game-top-bar');
export const timerValue = document.getElementById('timer-value');
export const wordDisplay = document.getElementById('word-display');
export const roundCurrent = document.getElementById('round-current');
export const roundTotal = document.getElementById('round-total');

// Room Code Toggle
export const toggleCodeBtn = document.getElementById('toggle-code-btn');
export const iconEye = document.getElementById('icon-eye');
export const iconEyeOff = document.getElementById('icon-eye-off');
export const copyCodeBtn = document.getElementById('copy-code-btn');

// Avatar
export const avatarColorTrigger = document.getElementById('avatar-color-trigger');
export const avatarColorPreview = document.getElementById('avatar-color-preview');

// Chat
export const chatMessages = document.getElementById('chat-messages');
export const chatForm = document.getElementById('chat-form');
export const chatInput = document.getElementById('chat-input');
