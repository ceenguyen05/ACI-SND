import { DepthTexture, HalfFloatType, Matrix4, ShaderMaterial, UnsignedIntType, Vector2, WebGLRenderTarget,
  type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/** Depth-based contact shading, with no second geometry pass or temporal blur. */
export class SpatialPost {
  private target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 2,
    depthTexture: new DepthTexture(1, 1, UnsignedIntType) });
  private material = new ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      sceneColor: { value: this.target.texture }, sceneDepth: { value: this.target.depthTexture },
      inverseProjection: { value: new Matrix4() }, resolution: { value: new Vector2(1, 1) },
      projectionScale: { value: 1 },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D sceneColor, sceneDepth;
      uniform mat4 inverseProjection;
      uniform vec2 resolution;
      uniform float projectionScale;
      varying vec2 vUv;
      vec3 viewPosition(vec2 uv, float depth) {
        vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      void main() {
        vec3 color = texture2D(sceneColor, vUv).rgb;
        float depth = texture2D(sceneDepth, vUv).r;
        vec3 center = viewPosition(vUv, depth);
        vec3 normal = normalize(cross(dFdx(center), dFdy(center)));
        float occlusion = 0.0;
        if (depth < 0.99999) {
          float radius = 0.52;
          float pixels = clamp(radius * projectionScale / max(0.1, -center.z), 2.0, 84.0);
          // Eight deterministic samples keep the image stable during mouse movement.
          for (int i = 0; i < 8; i++) {
            float angle = float(i) * 2.3999632;
            float ring = sqrt((float(i) + 0.5) / 8.0);
            vec2 uv = vUv + vec2(cos(angle), sin(angle)) * pixels * ring / resolution;
            float sd = texture2D(sceneDepth, uv).r;
            vec3 delta = viewPosition(uv, sd) - center;
            float distanceToSample = length(delta);
            float withinFrame = step(0.001, uv.x) * step(uv.x, 0.999) * step(0.001, uv.y) * step(uv.y, 0.999);
            float hemisphere = max(0.0, dot(normal, delta / max(distanceToSample, 0.001)) - 0.08);
            float falloff = 1.0 - smoothstep(0.08, radius, distanceToSample);
            occlusion += hemisphere * falloff * withinFrame * step(sd, 0.99999);
          }
        }
        color *= clamp(1.0 - occlusion * 0.3, 0.42, 1.0);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private quad = new FullScreenQuad(this.material);

  resize(width: number, height: number) {
    this.target.setSize(width, height);
    this.material.uniforms.resolution.value.set(width, height);
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    this.material.uniforms.projectionScale.value = camera.projectionMatrix.elements[5] * this.target.height * 0.5;
    renderer.setRenderTarget(null);
    renderer.clear();
    this.quad.render(renderer);
  }

  dispose() { this.target.dispose(); this.material.dispose(); this.quad.dispose(); }
}
