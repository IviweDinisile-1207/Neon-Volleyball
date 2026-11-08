precision highp float;

varying vec3 vWorldPos;
varying vec3 vNormal;

uniform vec3 uBaseColor;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uCameraPos;
uniform float uShininess;
uniform float uEmissive;

void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(-uLightDir);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), uShininess) * step(0.0001, diff);

    vec3 color = uBaseColor * (uAmbient + diff * uLightColor)
               + uLightColor * spec * 0.6
               + uBaseColor * uEmissive;

    gl_FragColor = vec4(color, 1.0);
}
