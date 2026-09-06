// Reproducible, isolated dependency acquisition; no theme build step required.
// npm install --prefix artifacts/try-on/runtime --no-audit --no-fund three@0.180.0 @mediapipe/tasks-vision@0.10.22-rc.20250304 liquidjs@10.21.1
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const modules = path.join(root, 'artifacts/try-on/runtime/node_modules');
const copies = {
  'vto-three.module.js': 'three/build/three.module.min.js',
  'vto-three.core.js': 'three/build/three.core.min.js',
  'vto-gltf-loader.js': 'three/examples/jsm/loaders/GLTFLoader.js',
  'vto-buffer-utils.js': 'three/examples/jsm/utils/BufferGeometryUtils.js',
  'vto-vision.js': '@mediapipe/tasks-vision/vision_bundle.mjs',
};
const hashes = {};
for (const [dest, src] of Object.entries(copies)) {
  const license = fs.readFileSync(path.join(root, 'docs/licenses', dest==='vto-vision.js'?'MediaPipe-LICENSE.txt':'Three-LICENSE.txt'), 'utf8');
  const text = '/*! Vendored '+src+'. Local imports/source-map references adapted for Shopify.\n'+license.replaceAll('*/','* /')+'\n*/\n'+fs.readFileSync(path.join(modules, src), 'utf8')
    .replaceAll('./three.core.min.js', '@incorrect/vto-three-core')
    .replaceAll("from 'three'", "from '@incorrect/vto-three'")
    .replaceAll('../utils/BufferGeometryUtils.js', '@incorrect/vto-buffer-utils')
    .replace(/\/\/# sourceMappingURL=.*$/gm, '');
  fs.writeFileSync(path.join(root, 'assets', dest), text);
  hashes[dest] = crypto.createHash('sha256').update(text).digest('hex');
}
fs.writeFileSync(path.join(root, 'artifacts/try-on/vendor-hashes.json'), JSON.stringify(hashes, null, 2));
console.log(hashes);
