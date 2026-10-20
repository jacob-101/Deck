import { AsciiRenderer } from "./renderer.js";
import { World } from "./world.js";
const STEP = 1 / 60;
const MAX_STEPS = 4;
export class OceanEngine {
    canvas;
    world;
    renderer;
    raf = 0;
    last = 0;
    acc = 0;
    visible = true;
    reducedMotion;
    resizeObserver;
    intersectionObserver;
    disposed = false;
    paused = false;
    speed = 1;
    sharkSpecs;
    constructor(canvas, sharks){
        this.canvas = canvas;
        this.sharkSpecs = sharks?.map((shark)=>({
                ...shark
            }));
        this.world = new World(this.sharkSpecs);
        this.renderer = new AsciiRenderer(canvas);
        this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
        this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        this.resizeObserver = new ResizeObserver(()=>this.resize());
        this.resizeObserver.observe(canvas);
        this.intersectionObserver = new IntersectionObserver(([entry])=>{
            this.visible = entry.isIntersecting;
            this.schedule();
        });
        this.intersectionObserver.observe(canvas);
        this.reducedMotion.addEventListener("change", this.onMotionPreference);
        window.addEventListener("pointermove", this.onPointerMove, {
            passive: true
        });
        window.addEventListener("pointerdown", this.onPointerDown, {
            passive: true
        });
        document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
        window.addEventListener("blur", this.onPointerLeave);
        this.resize();
        document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(()=>{
            if (!this.disposed && (this.reducedMotion.matches || this.paused)) this.drawStill();
        });
        this.schedule();
    }
    get stats() {
        return {
            sharkCount: this.world.sharks.length,
            fishCount: this.world.fish.reduce((count, fish)=>count + (fish.alive ? 1 : 0), 0)
        };
    }
    refresh() {
        if (!this.disposed) this.renderer.render(this.world, 0);
    }
    pause(paused) {
        this.paused = Boolean(paused);
        this.acc = 0;
        this.schedule();
        if (this.paused) this.renderer.render(this.world, 0);
    }
    setSpeed(value) {
        if (!Number.isFinite(value)) return;
        this.speed = Math.max(0.1, Math.min(3, value));
    }
    setSpecies(kind) {
        const kinds = [
            "classic",
            "hammerhead",
            "zebra",
            "tiger",
            "greathammer",
            "mako",
            "thresher",
            "nurse"
        ];
        if (!kinds.includes(kind)) return;
        this.sharkSpecs = this.world.sharks.map((shark)=>({
                kind,
                size: shark.depth
            }));
        for (const shark of this.world.sharks)shark.kind = kind;
        this.renderer.render(this.world, 0);
    }
    reset() {
        if (this.disposed) return;
        cancelAnimationFrame(this.raf);
        this.acc = 0;
        this.world = new World(this.sharkSpecs);
        this.resize();
        this.schedule();
    }
    splash(x, y) {
        if (this.disposed || this.paused || this.reducedMotion.matches) return;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.world.splash(x, y);
    }
    destroy() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.resizeObserver.disconnect();
        this.intersectionObserver.disconnect();
        this.reducedMotion.removeEventListener("change", this.onMotionPreference);
        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerdown", this.onPointerDown);
        document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
        window.removeEventListener("blur", this.onPointerLeave);
    }
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderer.resize(rect.width, rect.height, dpr);
        this.world.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
        if (this.reducedMotion.matches) this.drawStill();
        else this.renderer.render(this.world, 0);
    }
    schedule() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        if (this.disposed || this.paused || !this.visible || this.reducedMotion.matches) return;
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.frame);
    }
    frame = (now)=>{
        if (this.disposed || this.paused || !this.visible || this.reducedMotion.matches) return;
        const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed;
        this.last = now;
        this.acc += dt;
        let steps = 0;
        while(this.acc >= STEP && steps < MAX_STEPS){
            this.world.step(STEP);
            this.acc -= STEP;
            steps++;
        }
        if (steps === MAX_STEPS) this.acc = 0;
        this.renderer.render(this.world, dt);
        this.raf = requestAnimationFrame(this.frame);
    };
    drawStill() {
        if (!this.paused && this.world.time < 4) {
            for(let i = 0; i < 240; i++)this.world.step(STEP);
        }
        this.renderer.render(this.world, STEP);
    }
    onMotionPreference = ()=>{
        if (this.reducedMotion.matches) {
            cancelAnimationFrame(this.raf);
            this.drawStill();
        } else {
            this.schedule();
        }
    };
    toLocal(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
        return {
            x,
            y,
            inside
        };
    }
    onPointerMove = (e)=>{
        const { x, y, inside } = this.toLocal(e);
        const p = this.world.pointer;
        p.x = x;
        p.y = y;
        p.active = inside && e.pointerType !== "touch";
    };
    onPointerDown = (e)=>{
        if (e.target instanceof Element && e.target.closest("button, form, dialog, input, textarea, select, a, [role='button'], [role='dialog']")) return;
        const { x, y, inside } = this.toLocal(e);
        if (inside) this.splash(x, y);
    };
    onPointerLeave = ()=>{
        this.world.pointer.active = false;
    };
}
