import {
  Application, Asset, AssetListLoader, Entity, Vec3,
  FILLMODE_FILL_WINDOW, RESOLUTION_AUTO
} from 'playcanvas';

const CAMERA_CONTROLS_URL =
  'https://cdn.jsdelivr.net/npm/playcanvas@2.18.1/scripts/esm/camera-controls.mjs';
const ORBIT_SPEED = 8; // degrees per second

// Pose for the church demo splat — tuned in-browser in Task 4.
const DEMO_POSE = {
  level: { x: -19, y: 10, z: 180 },
  offset: { x: 2.4, y: 2.4, z: -1.2 },
  cameraPos: { x: 1.878, y: 1.115, z: -5.222 },
  cameraFocus: { x: 0.656, y: -0.107, z: 0.212 }
};
// Pose for user-supplied splats — z:180 is the common Brush/COLMAP flip;
// the user re-frames with orbit/pan/zoom.
const DEFAULT_POSE = {
  level: { x: 0, y: 0, z: 180 },
  offset: { x: 0, y: 0, z: 0 },
  cameraPos: { x: 0, y: 0, z: 4 },
  cameraFocus: { x: 0, y: 0, z: 0 }
};

export function createViewer(hostElement) {
  if (!document.createElement('canvas').getContext('webgl2')) {
    hostElement.innerHTML =
      '<img src="assets/og-image.jpg" alt="3D Gaussian Splat" ' +
      'style="width:100%;height:100%;object-fit:cover">' +
      '<p style="position:absolute;left:0;right:0;bottom:0;margin:0;' +
      'padding:0.8rem;text-align:center;background:rgba(14,15,19,0.85)">' +
      'Your browser does not support WebGL2 — showing a still image.</p>';
    return {
      loadSplat: () => {}, setAutoOrbit: () => {},
      isAutoOrbit: () => false, onLoad: () => {},
      enterWalking: async () => false, exitWalking: () => {},
      isWalking: () => false,
      onWalkingEnter: () => {}, onWalkingExit: () => {},
      unsupported: true
    };
  }

  const canvas = document.createElement('canvas');
  hostElement.appendChild(canvas);

  const app = new Application(canvas, {
    graphicsDeviceOptions: { antialias: false }
  });
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);
  app.start();
  window.addEventListener('resize', () => app.resizeCanvas());

  const camera = new Entity('camera');
  camera.addComponent('camera', { clearColor: [0.055, 0.059, 0.075, 1] });
  camera.setPosition(DEMO_POSE.cameraPos.x, DEMO_POSE.cameraPos.y, DEMO_POSE.cameraPos.z);
  app.root.addChild(camera);

  let cc = null;
  const cameraReady = (async () => {
    const ccAsset = new Asset('camera-controls', 'script', { url: CAMERA_CONTROLS_URL });
    await new Promise(res => new AssetListLoader([ccAsset], app.assets).load(res));
    camera.addComponent('script');
    cc = camera.script.create('cameraControls');
  })();

  // splatPivot rotates for the auto-orbit; splatEntity holds the static leveling
  let splatPivot = null;
  let splatEntity = null;
  let autoOrbit = true;
  const loadListeners = [];

  app.on('update', (dt) => {
    if (autoOrbit && splatPivot) splatPivot.rotate(0, ORBIT_SPEED * dt, 0);
  });

  for (const ev of ['pointerdown', 'wheel']) {
    canvas.addEventListener(ev, () => { autoOrbit = false; });
  }

  async function loadSplat(source, filename) {
    await cameraReady;
    const isFile = source instanceof File;
    const pose = isFile ? DEFAULT_POSE : DEMO_POSE;

    let url = source;
    let name = filename;
    let revoke = null;
    if (isFile) {
      url = URL.createObjectURL(source);
      name = source.name;
      revoke = url;
    }

    // loadFromUrlAndFilename: the filename drives format detection, so
    // blob: URLs (which carry no extension) load correctly.
    let asset;
    try {
      asset = await new Promise((resolve, reject) => {
        app.assets.loadFromUrlAndFilename(url, name, 'gsplat', (err, a) => {
          if (err) reject(err); else resolve(a);
        });
      });
    } catch {
      if (revoke) URL.revokeObjectURL(revoke);
      throw new Error('splat-load-failed');
    }
    if (revoke) URL.revokeObjectURL(revoke);

    if (splatPivot) splatPivot.destroy();
    splatPivot = new Entity('splat-pivot');
    splatEntity = new Entity('splat');
    splatEntity.addComponent('gsplat', { asset });
    splatEntity.setLocalEulerAngles(pose.level.x, pose.level.y, pose.level.z);
    splatEntity.setLocalPosition(pose.offset.x, pose.offset.y, pose.offset.z);
    splatPivot.addChild(splatEntity);
    app.root.addChild(splatPivot);

    if (cc) cc.reset(
      new Vec3(pose.cameraFocus.x, pose.cameraFocus.y, pose.cameraFocus.z),
      new Vec3(pose.cameraPos.x, pose.cameraPos.y, pose.cameraPos.z));

    autoOrbit = true; // a freshly loaded splat always starts orbiting

    for (const fn of loadListeners) {
      try { fn({ splatEntity, splatPivot }); } catch (e) { console.error(e); }
    }
  }

  // ---------- Walking-mode glue ----------

  let walkingMode = null;
  let pivotRotationOnEnter = null;
  let lockChangeHandler = null;
  const walkEnterListeners = [];
  const walkExitListeners = [];

  async function enterWalking(input) {
    if (walkingMode) return false;
    if (!splatEntity || !splatPivot) throw new Error('no-splat-loaded');
    autoOrbit = false;
    pivotRotationOnEnter = splatPivot.getRotation().clone();
    splatPivot.setEulerAngles(0, 0, 0);

    const { heightmapFromSplat, WalkingMode } = await import('./walking.js');
    const hm = heightmapFromSplat(splatEntity, splatPivot);
    if (!hm) {
      splatPivot.setRotation(pivotRotationOnEnter);
      pivotRotationOnEnter = null;
      throw new Error('heightmap-build-failed');
    }

    if (cc) cc.enabled = false;
    try { await canvas.requestPointerLock?.(); } catch { /* desktop without lock — fine */ }
    input.attach(window);

    lockChangeHandler = () => {
      if (document.pointerLockElement !== canvas && walkingMode) exitWalking(input);
    };
    document.addEventListener('pointerlockchange', lockChangeHandler);

    walkingMode = new WalkingMode({
      app, camera, splatBounds: hm.bounds, heightmap: hm.heightmap,
      input, onExit: () => exitWalking(input),
    });
    walkingMode.enter();
    for (const fn of walkEnterListeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
    return true;
  }

  function exitWalking(input) {
    if (!walkingMode) return;
    walkingMode.exit();
    walkingMode = null;
    if (lockChangeHandler) {
      document.removeEventListener('pointerlockchange', lockChangeHandler);
      lockChangeHandler = null;
    }
    if (document.exitPointerLock && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    input?.detach();
    if (cc) cc.enabled = true;
    if (pivotRotationOnEnter && splatPivot) {
      splatPivot.setRotation(pivotRotationOnEnter);
      pivotRotationOnEnter = null;
    }
    for (const fn of walkExitListeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  return {
    loadSplat,
    setAutoOrbit(on) { autoOrbit = on; },
    isAutoOrbit() { return autoOrbit; },
    onLoad(fn) { loadListeners.push(fn); },
    enterWalking,
    exitWalking,
    isWalking() { return walkingMode != null; },
    onWalkingEnter(fn) { walkEnterListeners.push(fn); },
    onWalkingExit(fn) { walkExitListeners.push(fn); },
    unsupported: false
  };
}
