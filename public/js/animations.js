
export class AnimationSystem {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '3000'; // Above modals
        this.canvas.style.background = 'transparent'; // Override global canvas white background
        this.particles = [];
        this.isRunning = false;
        
        this.resizeHandler = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', this.resizeHandler);
    }

    start() {
        if (this.isRunning) return;
        document.body.appendChild(this.canvas);
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.isRunning = true;
        this.animate();
    }

    stop() {
        this.isRunning = false;
        this.particles = [];
        if (this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    animate() {
        if (!this.isRunning) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            p.draw(this.ctx);
            
            if (p.isDead()) {
                this.particles.splice(i, 1);
            }
        }

        requestAnimationFrame(() => this.animate());
    }

    // --- Effects ---

    triggerConfetti(duration = 3000) {
        this.start();
        const colors = ['#f1c40f', '#e74c3c', '#3498db', '#9b59b6', '#2ecc71'];
        
        const interval = setInterval(() => {
            const x = Math.random() * this.canvas.width;
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.particles.push(new ConfettiParticle(x, -10, color));
        }, 20);

        setTimeout(() => {
            clearInterval(interval);
            // Stop system when all particles are gone
            const checkEnd = setInterval(() => {
                if (this.particles.length === 0) {
                    this.stop();
                    clearInterval(checkEnd);
                }
            }, 500);
        }, duration);
    }

    triggerRain(duration = 3000) {
        this.start();
        const interval = setInterval(() => {
            const x = Math.random() * this.canvas.width;
            this.particles.push(new RainParticle(x, -10));
        }, 10);

        setTimeout(() => {
            clearInterval(interval);
            const checkEnd = setInterval(() => {
                if (this.particles.length === 0) {
                    this.stop();
                    clearInterval(checkEnd);
                }
            }, 500);
        }, duration);
    }

    triggerFireworks(duration = 5000) {
        this.start();
        
        const launchFirework = () => {
            const x = Math.random() * this.canvas.width;
            // Target between 10% and 80% of screen height (0 is top)
            // This ensures fireworks appear all over the screen, not just at the bottom
            const targetY = this.canvas.height * (0.1 + Math.random() * 0.7);
            const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            this.particles.push(new FireworkRocket(x, this.canvas.height, targetY, color, (x, y, color) => {
                // Explosion callback
                for (let i = 0; i < 50; i++) {
                    this.particles.push(new FireworkSpark(x, y, color));
                }
            }));
        };

        // Launch 3x more fireworks (approx 250ms instead of 800ms)
        const interval = setInterval(launchFirework, 250); 
        launchFirework(); // Immediate start

        setTimeout(() => {
            clearInterval(interval);
            const checkEnd = setInterval(() => {
                if (this.particles.length === 0) {
                    this.stop();
                    clearInterval(checkEnd);
                }
            }, 1000);
        }, duration);
    }
}

class ConfettiParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 10 + 5;
        this.speedY = Math.random() * 3 + 2;
        this.speedX = Math.random() * 2 - 1;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 10 - 5;
        this.wobble = 0;
        this.wobbleSpeed = Math.random() * 0.1 + 0.05;
    }

    update() {
        this.y += this.speedY;
        this.x += Math.sin(this.wobble) * 2;
        this.wobble += this.wobbleSpeed;
        this.rotation += this.rotationSpeed;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }

    isDead() {
        return this.y > window.innerHeight + 50;
    }
}

class RainParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.length = Math.random() * 20 + 10;
        this.speedY = Math.random() * 10 + 10;
        this.color = 'rgba(174, 194, 224, 0.6)';
    }

    update() {
        this.y += this.speedY;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + this.length);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    isDead() {
        return this.y > window.innerHeight + 50;
    }
}

class FireworkRocket {
    constructor(x, y, targetY, color, onExplode) {
        this.x = x;
        this.y = y;
        this.targetY = targetY;
        this.color = color;
        this.onExplode = onExplode;
        
        // Calculate speed to reach targetY
        // v^2 = 2 * a * d
        // a = 0.15 (gravity)
        const gravity = 0.15;
        const distance = y - targetY;
        this.speedY = -Math.sqrt(2 * gravity * distance);
        
        this.exploded = false;
    }

    update() {
        this.y += this.speedY;
        this.speedY += 0.15; // Gravity

        if (this.speedY >= 0 || this.y <= this.targetY) {
            this.exploded = true;
            this.onExplode(this.x, this.y, this.color);
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }

    isDead() {
        return this.exploded;
    }
}

class FireworkSpark {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1; // Slower explosion speed (was 5+2)
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.alpha = 1;
        this.decay = Math.random() * 0.01 + 0.005; // Slower decay (was 0.02+0.01)
        this.gravity = 0.05; // Lower gravity (was 0.1)
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.alpha <= 0;
    }
}
