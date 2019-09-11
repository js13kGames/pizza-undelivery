import Generator from "./generator.js";
import {iterateQGrid} from "./generator.js";
import Renderer from "./renderer.js";
import { keyIsDown } from "./keyHandler.js";
import Audio from "./audio.js";

const ACC = .25 / 30;
const STEER = 2 / 30;
const TRACT = 0.1;
const FRIC = 0.1;
const BACKFRIC = 0.3;

const DEBUG = true; // TODO flip

const MAP_SIZE = 32;

class Car {
    constructor(renderer, generator) {
        this.x = 0;
        this.y = 0;
        this.r = .03;
        this.hspd = 0;
        this.vspd = 0;
        this.angle = 0;

        this.renderer = renderer;
        this.generator = generator;
    }

    update() {
        let dx, dy, scl;
        const acceleration = (keyIsDown("up") - keyIsDown("down")) * ACC;
        let steering = (keyIsDown("right") - keyIsDown("left"));
        this.renderer.carFrame = -steering+1;
        steering *= STEER;
        
        dx = Math.cos(this.angle);
        dy = Math.sin(this.angle);
        scl = Math.max(Math.min((dx * this.hspd + dy * this.vspd) * 60, 1), -1);

        this.angle += steering * scl;
        this.hspd += Math.cos(this.angle) * acceleration;
        this.vspd += Math.sin(this.angle) * acceleration;
        this.x += this.hspd;
        this.y += this.vspd;

        // friction
        // sideways
        dx = -Math.sin(this.angle);
        dy = Math.cos(this.angle);
        scl = (dx * this.hspd + dy * this.vspd) * TRACT;
        this.hspd -= scl * dx;
        this.vspd -= scl * dy;

        // forw. backw.
        dx = Math.cos(this.angle);
        dy = Math.sin(this.angle);
        scl = (dx * this.hspd + dy * this.vspd);
        scl *= scl > 0? FRIC : BACKFRIC;
        this.hspd -= scl * dx;
        this.vspd -= scl * dy;

        //collision
        this.handleCircleCollision(this);

        // render
        this.renderer.x = this.x - dx * .25;
        this.renderer.y = this.y - dy * .25;
        this.renderer.z = 0.25 + this.generator.sampleGroundHeightmap(this.x, this.y);
        this.renderer.angle = this.angle;

        this.renderer.render();
    }

    handleCircleCollision(obj) {
        if(this.collisionAtPoint(obj.x, obj.y)) {
            obj.vspd *= -1;
            obj.hspd *= -1;
        }

        const x = Math.round(obj.x);
        const y = Math.round(obj.y);
        const rx = obj.x - x;
        const ry = obj.y - y;
        const posX = rx > 0? 1 : 0;
        const negX = 1 - posX;
        const posY = ry > 0? 1 : 0;
        const negY = 1 - posY;
        
        const l = Math.sqrt(rx*rx + ry*ry);

        const colX = Math.abs(rx) < obj.r && this.collisionAtPoint(x - posX, y - negY);
        const colY = Math.abs(ry) < obj.r && this.collisionAtPoint(x - negX, y - posY);
        const colXY = !colX && !colY && l < obj.r  && this.collisionAtPoint(x - posX, y - posY);
        
        document.querySelector("footer>p").innerHTML = `
            rx: ${String(rx).slice(0, 4)} <br>
            ry: ${String(ry).slice(0, 4)} <br>
            colX: ${colX} <br>
            colY: ${colY} <br>
            colXY: ${colXY} <br>
            x: ${String(this.x).slice(0, 4)} <br>
            y: ${String(this.y).slice(0, 4)}`;

        if(colXY && l > 0.01) {
            // corner collision
            obj.x = x + rx*obj.r/l;
            obj.y = y + ry*obj.r/l;
        } else {
            if(colX) {
                obj.x = x + Math.sign(rx) * obj.r;
                obj.hspd *= -1;
            }
            if(colY) {
                obj.y = y + Math.sign(ry) * obj.r;
                obj.vspd *= -1; 
            }
        }

    }

    collisionAtPoint(x, y) {
        return this.generator.sampleFloorMap(x, y) != 1;
    }
}

class GameManager {
    constructor(renderer, generator, car) {
        this.level = 2;
        this.pizzasCollected = 0;
        this.pizzasToCollect = 0;
        this.renderer = renderer;
        this.generator = generator;
        this.car = car;
        this.pizzas = [];
        this.startObj = null;
    }

    startLevel() {
        // start of level
        this.pizzasToCollect = this.level;
        this.pizzasCollected = 0;
        this.placeObjects();
        this.renderer.setText("Collect the pizzas!", "red");
    }

    placeObjects() {
        this.pizzas = [];
        let positions = [];
        for(let p of iterateQGrid(MAP_SIZE/4, MAP_SIZE/4)) { // TODO go back to normal size
            p.x += 0.5;
            p.y += 0.5;
            positions.push(p);
        }
        // only use streets
        positions = positions.filter(p => this.generator.sampleFloorMap(p.x, p.y) == 1);

        // select a few random positions for pizzas
        for(let i = 0; i < this.pizzasToCollect; i++) {
            let pizza = positions.splice(~~(Math.random() * positions.length), 1)[0];
            pizza.spriteIndex = 0;
            this.pizzas.push(pizza);
        }

        if(!this.startObj) {
            // select the start position
            this.startObj = positions.splice(~~(Math.random() * positions.length), 1)[0];
            this.startObj.spriteIndex = 1;
            this.car.x = this.startObj.x;
            this.car.y = this.startObj.y;
        }

        this.renderer.pizzaPositions = this.pizzas;
    }

    update() {
        if(this.pizzas.length > 0) {
            for(let pizza of this.pizzas) {
                if((pizza.x - this.car.x)**2 + (pizza.y - this.car.y)**2 < 0.25**2) {
                    pizza.collected = true;
                    this.pizzasCollected++;
                    this.renderer.setSuperText(`${this.pizzasCollected} / ${this.pizzasToCollect} pizzas\ncollected!!!`)
                }
            }
            this.pizzas = this.pizzas.filter(p => !p.collected);
            this.renderer.pizzaPositions = this.pizzas;
        } else {
            this.renderer.setText("Return to start!", "yellow")
            this.renderer.pizzaPositions = [this.startObj];
            if((this.startObj.x - this.car.x)**2 + (this.startObj.y - this.car.y)**2 < 0.4**2) {
                this.level++;
                this.startLevel();
            }
        }
    }
}

window.addEventListener("load", () => {
    startGame();
});

async function startGame() {
    let audio = new Audio();
    // TODO uncomment in final build
    if(DEBUG)
    {
        audio.start();
    } else {
        let body = document.querySelector("body");
        body.onkeydown = ev => {
            audio.start();
            body.onkeydown = null;
        };
    }
    let gen = new Generator(MAP_SIZE);
    let rend = new Renderer(gen, document.querySelector("canvas.game"));
    await rend.load();
    let car = new Car(rend, gen);
    let gm = new GameManager(rend, gen, car);
    gm.startLevel();

    window.setInterval(() => {
        gm.update();
        car.update();
        audio.update();
    }, 1000/30)
}