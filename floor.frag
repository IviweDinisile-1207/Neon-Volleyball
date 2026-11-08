#extension GL_OES_standard_derivatives : enable
precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;

uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uCameraPos;

uniform vec3 uColorP1;
uniform vec3 uColorP2;
uniform float uHalfW;
uniform float uHalfL;

float stripe(float v, float w) {
    float e = fwidth(v);
    return 1.0 - smoothstep(w - e, w + e, abs(v));
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(-uLightDir);
    float diff = max(dot(N, L), 0.0);

    vec2 uv = vWorldPos.xz;
    float edgeX = abs(uv.x) / uHalfW;
    float edgeZ = abs(uv.y) / uHalfL;
    float edge = max(edgeX, edgeZ);
    vec3 base = mix(vec3(0.06, 0.03, 0.14), vec3(0.02, 0.01, 0.05), smoothstep(0.5, 1.0, edge));

    vec2 g = abs(fract(uv / 2.0 - 0.5) - 0.5) * 2.0;
    float gridLine = min(g.x, g.y);
    float e = fwidth(gridLine);
    float grid = 1.0 - smoothstep(0.02, 0.02 + e * 2.0, gridLine);
    vec3 gridColor = mix(vec3(0.6, 0.1, 0.7), vec3(0.1, 0.6, 0.9), 0.5 + 0.5 * sin(uv.x * 0.1 + uv.y * 0.15));

    float center = stripe(uv.y, 0.08);
    float goalP1 = stripe(uv.y - uHalfL, 0.18);
    float goalP2 = stripe(uv.y + uHalfL, 0.18);

    vec3 albedo = base
                + gridColor * grid * 0.55
                + vec3(1.0) * center * 0.8
                + uColorP1 * goalP1 * 1.2
                + uColorP2 * goalP2 * 1.2;

    vec3 color = albedo * (uAmbient + diff * uLightColor);
    gl_FragColor = vec4(color, 1.0);
}
