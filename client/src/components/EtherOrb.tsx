import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";

type OrbOpts = { hue: number; speed: number; glow: number; amp: number };
type OrbEntry = { el: HTMLElement; opts: OrbOpts; t: number };
type Renderer = {
  register: (el: HTMLElement, opts: OrbOpts) => OrbInternalHandle;
};
type OrbInternalHandle = {
  update: (opts: Partial<OrbOpts>) => void;
  destroy: () => void;
};

export type EtherOrbHandle = {
  update: (opts: Partial<OrbOpts>) => void;
};

const DEFAULTS: OrbOpts = { hue: 0.29, speed: 0.6, glow: 0.95, amp: 1 };

const VERT = `attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_hue;
uniform float u_amp;
uniform float u_glow;
uniform vec2 u_res;

float hash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float n = mix(
    mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
        mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
        mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
    f.z);
  return n;
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

vec3 bluePurpleRed(float t) {
  t = fract(t);
  vec3 blue   = vec3(0.10, 0.25, 1.00);
  vec3 purple = vec3(0.65, 0.15, 0.95);
  vec3 red    = vec3(1.00, 0.15, 0.25);
  if (t < 0.40) {
    return mix(blue, purple, smoothstep(0.0, 0.40, t));
  } else if (t < 0.80) {
    return mix(purple, red, smoothstep(0.40, 0.80, t));
  } else {
    return mix(red, blue, smoothstep(0.80, 1.00, t));
  }
}

float particles(vec2 uv, float t) {
  float acc = 0.0;
  for (int i = 0; i < 80; i++) {
    float fi = float(i);
    float sd = fract(sin(fi * 12.9898) * 43758.5453);
    float r  = 0.15 + sd * 0.8;
    float sp = 0.4 + fract(sin(fi * 7.13) * 71.7) * 1.2;
    float ph = fi * 2.3;
    vec2 c = vec2(cos(t * sp + ph), sin(t * sp * 0.9 + ph)) * r;
    float d = length(uv - c);
    acc += exp(-d * 140.0) * (0.7 + 0.3 * sin(t * 3.0 + fi));
  }
  return acc;
}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  float r = length(uv);
  float mask = smoothstep(1.0, 0.93, r);
  float t = u_time * (0.8 + u_amp * 0.4);
  float p = particles(uv, t);
  vec3 col = bluePurpleRed(p * 0.6 + r * 0.3 + t * 0.1 + u_hue) * p * 1.2;
  float dome = sqrt(max(0.0, 1.0 - r*r));
  col += bluePurpleRed(dome * 0.5 + u_time * 0.05 + u_hue) * dome * 0.15;
  float core = exp(-r*r*8.0);
  col += bluePurpleRed(u_time * 0.12 + u_hue) * core * 0.9;
  col *= mask;
  float halo = smoothstep(1.4, 0.6, r) * u_glow * (1.0 - mask);
  col += bluePurpleRed(u_time * 0.08 + u_hue) * halo * 0.4;
  float alpha = max(mask, halo * 0.55);
  col *= alpha;
  gl_FragColor = vec4(col, alpha);
}`;

// Module-scope singleton so every <EtherOrb> shares one WebGL context/canvas.
// -1 = we tried and failed (no WebGL).
let renderer: Renderer | null | -1 = null;

function createRenderer(): Renderer | null {
  if (typeof window === "undefined") return null;
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "50",
  });
  document.body.appendChild(canvas);
  const glRaw = canvas.getContext("webgl", {
    premultipliedAlpha: true,
    antialias: true,
    alpha: true,
  });
  if (!glRaw) {
    canvas.remove();
    return null;
  }
  const gl: WebGLRenderingContext = glRaw;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("EtherOrb shader compile failed:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    canvas.remove();
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    canvas.remove();
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.SCISSOR_TEST);

  const u = {
    time: gl.getUniformLocation(program, "u_time"),
    hue: gl.getUniformLocation(program, "u_hue"),
    amp: gl.getUniformLocation(program, "u_amp"),
    glow: gl.getUniformLocation(program, "u_glow"),
    res: gl.getUniformLocation(program, "u_res"),
  };
  const a_pos = gl.getAttribLocation(program, "a_pos");

  const orbs = new Set<OrbEntry>();
  let last = performance.now();

  function loop(now: number) {
    const dt = (now - last) * 0.001;
    last = now;
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

    for (const orb of Array.from(orbs)) {
      const r = orb.el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (
        r.right < -200 ||
        r.bottom < -200 ||
        r.left > window.innerWidth + 200 ||
        r.top > window.innerHeight + 200
      )
        continue;
      const x = Math.round(r.left * dpr);
      const y = Math.round((window.innerHeight - r.bottom) * dpr);
      const w = Math.round(r.width * dpr);
      const h = Math.round(r.height * dpr);
      gl.viewport(x, y, w, h);
      gl.scissor(x, y, w, h);
      orb.t += dt * orb.opts.speed;
      gl.uniform1f(u.time, orb.t);
      gl.uniform1f(u.hue, orb.opts.hue);
      gl.uniform1f(u.amp, orb.opts.amp);
      gl.uniform1f(u.glow, orb.opts.glow);
      gl.uniform2f(u.res, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    register(el, opts) {
      const orb: OrbEntry = { el, opts: { ...opts }, t: 0 };
      orbs.add(orb);
      return {
        update(next) {
          Object.assign(orb.opts, next);
        },
        destroy() {
          orbs.delete(orb);
        },
      };
    },
  };
}

function getRenderer(): Renderer | null {
  if (renderer === -1) return null;
  if (renderer) return renderer;
  const r = createRenderer();
  renderer = r ?? -1;
  return r;
}

export function isEtherOrbSupported(): boolean {
  return getRenderer() !== null;
}

type Props = {
  size?: number;
  hue?: number;
  speed?: number;
  glow?: number;
  amp?: number;
  className?: string;
  style?: CSSProperties;
};

export const EtherOrb = forwardRef<EtherOrbHandle, Props>(function EtherOrb(
  {
    size = 76,
    hue = DEFAULTS.hue,
    speed = DEFAULTS.speed,
    glow = DEFAULTS.glow,
    amp = DEFAULTS.amp,
    className,
    style,
  },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<OrbInternalHandle | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      update: (opts) => handleRef.current?.update(opts),
    }),
    [],
  );

  useEffect(() => {
    if (!divRef.current) return;
    const r = getRenderer();
    if (!r) return;
    handleRef.current = r.register(divRef.current, {
      hue,
      speed,
      glow,
      amp,
    });
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    handleRef.current?.update({ hue, speed, glow, amp });
  }, [hue, speed, glow, amp]);

  return (
    <div
      ref={divRef}
      className={className}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    />
  );
});
