// Description: Neko 
// Author: Jeff Clement
// License: MIT

// Size of the neko, in pixels
const nekoSize = 32;

// Speed of running animation
const runSpeed = 0.2;

// The neko statemachine
const stateMachine = {
    sleep: {
        images: ['sleep1', 'sleep2'],
        imageInterval: 1,
        click: 'awake',
    },
    yawn: {
        images: ['yawn'],
        nextState: ['sleep'],
        nextStateDelay: 1,
    },
    awake: {
        images: ['alert'],
        nextState: ['normal'],
        nextStateDelay: 1,
    },
    itch: {
        images: ['itch1','itch2'],
        imageInterval: 0.5,
        nextState: ['normal'],
        nextStateDelay: 2,
        click: 'dying', // OMG.  Don't click an itchin' neko!
    },
    normal: {
        awake: true,
        images: ['still'],
        nextState: ['normal','normal','normal','itch', 'yawn'],
        nextStateDelay: 1,
    },

    nrun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['nrun1','nrun2'],
    },
    nerun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['nerun1','nerun2'],
    },
    erun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['erun1','erun2'],
    },
    serun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['serun1','serun2'],
    },
    srun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['srun1','srun2'],
    },
    swrun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['swrun1','swrun2'],
    },
    wrun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['wrun1','wrun2'],
    },
    nwrun: {
        awake: true,
        imageInterval: runSpeed,
        images: ['nwrun1','nwrun2'],
    },


    dying: {
        images: ['alert','dying1','dying2','dying3','dying4','dying5'],
        imageInterval: 0.5,
        nextState: ['dead'],
        nextStateDelay: 3,
    },
    dead: {
        images: ['dying6'],
        imageInterval: 0.5,
    },
}

// Preload all the images
var images={};
for(let state in stateMachine) {
    stateMachine[state].images.forEach(function(x) {
        let img = new Image(nekoSize, nekoSize);
        img.src = '/neko/'+x+'.gif';
        images[x] = img;
    });
}

class Neko {
    // Neko's current state
    state = null;

    // Neko's current animation frame and timer to flip to the next one
    animationInterval = null;
    animationIndex = 0;

    // Timer to switch to the next state
    nextStateDelay = null;

    // where is Neko heading (current mouse position, or last press)
    targetX = -1;
    targetY = -1;

    constructor(x = document.body.clientWidth - nekoSize,y = document.body.clientHeight - nekoSize) {
        this.x = x;
        this.y = y;

        // build up the placeholder for the neko in the DOM
        this.image = new Image(nekoSize, nekoSize);
        this.image.style.position = 'fixed';
        this.image.onclick = this.handleClick.bind(this);
        document.body.appendChild(this.image);

        // start the movement loop
        setInterval(this.update.bind(this), 100);

        // hook into event handlers
        window.addEventListener('resize', this.handleResize.bind(this));
        window.addEventListener('mousemove', this.handleMoveOrTouch.bind(this));
        window.addEventListener('touch', this.handleMoveOrTouch.bind(this));

        // start the neko in the sleep state
        this.setState('sleep');

        // force a resize
        this.handleResize();
    }

    setState(state) {
        clearInterval(this.animationInterval);
        clearTimeout(this.nextStateDelay);

        this.state = state;
        this.animationIndex = 0;

        if (stateMachine[state].images.length > 1) {
            this.animationInterval = setInterval(this.nextFrame.bind(this), (stateMachine[state].imageInterval || 1) * 1000);
        }

        if (stateMachine[state].nextState && stateMachine[state].nextState.length > 0) {
            this.nextStateDelay = setTimeout(() => {
                this.setState(stateMachine[state].nextState[Math.floor(Math.random() * stateMachine[state].nextState.length)]);
            }, (stateMachine[state].nextStateDelay || 1) * 1000);
        }
    }

    nextFrame() {
        this.animationIndex = (this.animationIndex + 1) % stateMachine[this.state].images.length;
    }

    handleMoveOrTouch(event) {
        this.targetX = event.clientX - nekoSize/2;
        this.targetY = event.clientY - nekoSize/2;
    }

    handleClick() {
        if (stateMachine[this.state].click) {
            this.setState(stateMachine[this.state].click);
        }
    }

    handleResize() {
        // adjust Neko's X and Y speed based on window size
        this.speedX = document.body.clientWidth / 100 * nekoSize/32.0;
        this.speedY = document.body.clientHeight / 100 * nekoSize/32.0;

        // keep Neko on the screen
        if (this.x > document.body.clientWidth - nekoSize) {
            this.x = document.body.clientWidth - nekoSize;
        }
        if (this.y > document.body.clientHeight - nekoSize) {
            this.y = document.body.clientHeight - nekoSize;
        }
    }
  
    update() {
        const state = stateMachine[this.state];
        if (state.awake) {
            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;

            // if we're close enough to the target, stop moving
            if (Math.abs(dx) < this.speedX) dx = 0;
            if (Math.abs(dy) < this.speedY) dy = 0;

            if (dx < 0) dx = -1;
            if (dx > 0) dx = 1;
            if (dy < 0) dy = -1;
            if (dy > 0) dy = 1;

            // determine our new state
            var newState = 'normal';
            if (dx == 1 && dy == 0) newState = 'erun';
            if (dx == 1 && dy == 1) newState = 'serun';
            if (dx == 0 && dy == 1) newState = 'srun';
            if (dx == -1 && dy == 1) newState = 'swrun';
            if (dx == -1 && dy == 0) newState = 'wrun';
            if (dx == -1 && dy == -1) newState = 'nwrun';
            if (dx == 0 && dy == -1) newState = 'nrun';
            if (dx == 1 && dy == -1) newState = 'nerun';
            if (newState != this.state) {
                this.setState(newState);
            }

            // move Neko, if required
            this.x += dx * this.speedX;
            this.y += dy * this.speedY;
        }

        // Draw the neko
        this.image.src = images[state.images[this.animationIndex]].src;
        this.image.style.top = this.y + 'px';
        this.image.style.left = this.x + 'px';
    }
  }

const neko = new Neko();
