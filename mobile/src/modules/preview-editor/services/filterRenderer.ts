/**
 * Real-time colour grading on the GPU.
 *
 * This is a WebGL (expo-gl) fragment shader, not a CSS filter and not a
 * JS pixel loop: bundling a per-frame RN bridge call would drop the preview to a
 * slideshow on mid-range Android. The shader runs entirely in the GL context,
 * and `bake()` reads the framebuffer back into a JPEG via
 * `GLView.takeSnapshotAsync`.
 *
 * The renderer is deliberately framework-agnostic (no React import) so it can be
 * driven by <FilterPreviewCanvas /> or by an offscreen bake loop in a service.
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import type { ColorGrade } from '../types';

export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const FRAGMENT_SHADER = `
precision highp float;
varying vec2 uv;
uniform sampler2D uTexture;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uSepia;
uniform float uGrayscale;
uniform float uInvert;
uniform vec3  uTint;
uniform float uTintStrength;
uniform float uVignette;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
  vec4 texel = texture2D(uTexture, uv);
  vec3 color = texel.rgb;

  // brightness: additive lift in -1..1
  color += uBrightness;

  // contrast: pivot around mid grey
  color = (color - 0.5) * uContrast + 0.5;

  // saturation: mix(luma, color, s)
  float luma = dot(color, LUMA);
  color = mix(vec3(luma), color, uSaturation);

  // sepia
  vec3 sepiaColor = vec3(
    dot(color, vec3(0.393, 0.769, 0.189)),
    dot(color, vec3(0.349, 0.686, 0.168)),
    dot(color, vec3(0.272, 0.534, 0.131))
  );
  color = mix(color, sepiaColor, uSepia);

  // greyscale
  color = mix(color, vec3(luma), uGrayscale);

  // tint
  color = mix(color, color * uTint, uTintStrength);

  // vignette (smooth falloff from centre)
  vec2 centered = uv - 0.5;
  float radius = length(centered) * 1.4142;
  float falloff = smoothstep(1.0, 0.25, radius);
  color *= mix(1.0, falloff, uVignette);

  // invert
  color = mix(color, 1.0 - color, uInvert);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}
`;

function compile(gl: ExpoWebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Hindi ma-create ang shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log ?? 'unknown'}`);
  }
  return shader;
}

export type FilterRenderer = {
  /** Uploads (or re-uploads) the source image into the GL texture. */
  loadAsset: (uri: string) => Promise<void>;
  /** Pushes new uniform values and redraws one frame. */
  render: (grade: ColorGrade) => void;
  /** Reads the current framebuffer back as a JPEG file. */
  bake: (quality?: number) => Promise<{ uri: string; width: number; height: number }>;
  resize: (width: number, height: number) => void;
  dispose: () => void;
  readonly ready: boolean;
};

/**
 * Builds a renderer bound to one GL context. Call it from the GLView's
 * `onContextCreate` and keep the returned handle in a ref — a GL context is
 * single-use, so re-creating the view means re-creating the renderer.
 */
export function createFilterRenderer(gl: ExpoWebGLRenderingContext): FilterRenderer {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

  const program = gl.createProgram();
  if (!program) throw new Error('Hindi ma-create ang GL program.');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
  }
  gl.useProgram(program);

  // Full-screen triangle strip.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // 1x1 placeholder so the first draw never samples an incomplete texture.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([24, 24, 46, 255])
  );
  gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0);

  const uniform = {
    brightness: gl.getUniformLocation(program, 'uBrightness'),
    contrast: gl.getUniformLocation(program, 'uContrast'),
    saturation: gl.getUniformLocation(program, 'uSaturation'),
    sepia: gl.getUniformLocation(program, 'uSepia'),
    grayscale: gl.getUniformLocation(program, 'uGrayscale'),
    invert: gl.getUniformLocation(program, 'uInvert'),
    tint: gl.getUniformLocation(program, 'uTint'),
    tintStrength: gl.getUniformLocation(program, 'uTintStrength'),
    vignette: gl.getUniformLocation(program, 'uVignette'),
  };

  let ready = false;
  let disposed = false;

  const draw = (grade: ColorGrade) => {
    if (disposed) return;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(uniform.brightness, grade.brightness);
    gl.uniform1f(uniform.contrast, grade.contrast);
    gl.uniform1f(uniform.saturation, grade.saturation);
    gl.uniform1f(uniform.sepia, grade.sepia);
    gl.uniform1f(uniform.grayscale, grade.grayscale);
    gl.uniform1f(uniform.invert, grade.invert);
    gl.uniform3f(uniform.tint, grade.tint[0], grade.tint[1], grade.tint[2]);
    gl.uniform1f(uniform.tintStrength, grade.tintStrength);
    gl.uniform1f(uniform.vignette, grade.vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.flush();
    gl.endFrameEXP();
  };

  return {
    get ready() {
      return ready;
    },

    async loadAsset(uri: string) {
      // expo-gl can decode a bundled/Asset source directly into a texture; a bare
      // cache:// path is not decodable, so hoist it through Asset.fromURI first.
      const localUri = uri.startsWith('http') ? await downloadTo(localUriPath(uri)) : uri;
      const asset = Asset.fromURI(uri.startsWith('http') ? localUri : uri);
      await asset.downloadAsync();
      await new Promise<void>((resolve) => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          asset as unknown as TexImageSource
        );
        ready = true;
        resolve();
      });
    },

    render(grade: ColorGrade) {
      draw(grade);
    },

    async bake(quality = 0.95) {
      // One extra frame so the readback cannot race the last uniform update.
      gl.flush();
      gl.endFrameEXP();
      const snapshot = await GLView.takeSnapshotAsync(gl, {
        format: 'jpeg' as never,
        compress: quality,
      });
      return {
        uri: snapshot.uri as string,
        width: snapshot.width,
        height: snapshot.height,
      };
    },

    resize(width: number, height: number) {
      if (disposed) return;
      gl.viewport(0, 0, width, height);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteTexture(texture);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}

function localUriPath(uri: string): string {
  return `${FileSystem.cacheDirectory}photobooth/gl-source.jpg`;
}

async function downloadTo(uri: string): Promise<string> {
  const res = await FileSystem.downloadAsync(uri, uri);
  return res.uri;
}

/**
 * Convenience wrapper for the common case: grade an image once, offscreen, and
 * return the baked file. Used when the user taps "Apply" without ever opening the
 * interactive canvas (e.g. batch-applying a filter to a 4-cut strip).
 */
export async function bakeGrade(
  uri: string,
  grade: ColorGrade,
  opts: { quality?: number; timeoutMs?: number } = {}
): Promise<{ uri: string; width: number; height: number }> {
  const timeoutMs = opts.timeoutMs ?? 15000;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Nag-timeout ang GPU render. Subukan ulit o gumamit ng ibang filter.'));
    }, timeoutMs);
    // The caller must mount <FilterPreviewCanvas onRenderer={...} /> for this
    // promise to settle; see FilterPreviewCanvas.tsx for the wiring.
    renderBridge.once(async (renderer) => {
      try {
        await renderer.loadAsset(uri);
        renderer.render(grade);
        const out = await renderer.bake(opts.quality);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(out);
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      }
    });
  });
}

/**
 * Tiny bridge so a service can borrow the live renderer owned by the mounted
 * canvas. One in-flight request at a time is enough for this app's flows.
 */
type RendererConsumer = (renderer: FilterRenderer) => void;

class RendererBridge {
  private consumer: RendererConsumer | null = null;
  private current: FilterRenderer | null = null;

  /** Called by the canvas once the GL context is live. */
  attach(renderer: FilterRenderer) {
    this.current = renderer;
    const pending = this.consumer;
    this.consumer = null;
    if (pending) pending(renderer);
  }

  detach() {
    this.current = null;
  }

  /** Called by bakeGrade — resolves immediately when a context is already live. */
  once(consumer: RendererConsumer) {
    if (this.current) {
      consumer(this.current);
      return;
    }
    this.consumer = consumer;
  }

  isAttached() {
    return this.current != null;
  }
}

export const renderBridge = new RendererBridge();