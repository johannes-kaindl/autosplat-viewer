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
      onWalkingModeChange: () => {}, onWalkingEyeChange: () => {},
      enterCollisionEditor: async () => false,
      exitCollisionEditor: () => {},
      isCollisionEditor: () => false,
      getCollisionMode: () => null,
      onCollisionEnter: () => {},
      onCollisionExit: () => {},
      onCollisionMeshBuilt: () => {},
      setUseMeshCollider: () => {},
      isUsingMeshCollider: () => false,
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

  async function loadSplat(source, filename, opts = {}) {
    await cameraReady;
    const isFile = source instanceof File;
    // Delivery links (?src=) force the generic pose + auto-frame, so a
    // client's splat is not framed with the church-tuned demo camera.
    const pose = (opts.forceDefaultPose || isFile) ? DEFAULT_POSE : DEMO_POSE;

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

    if (opts.autoFrame) await autoFrameCamera();

    for (const fn of loadListeners) {
      try { fn({ splatEntity, splatPivot }); } catch (e) { console.error(e); }
    }
  }

  // Robust auto-frame for arbitrary (client-delivered) splats: frame the
  // camera from the splat CENTER positions (PC 2.x: gsplat._instance.resource
  // .centers) using per-axis percentiles, so floater outliers don't blow up
  // the framing. Falls back silently to the pose camera if positions are
  // unavailable.
  async function autoFrameCamera() {
    const getCenters = () => {
      const g = splatEntity && splatEntity.gsplat;
      return (g && ((g._instance && g._instance.resource && g._instance.resource.centers) ||
                    (g.instance && g.instance.resource && g.instance.resource.centers))) || null;
    };
    let centers = null;
    for (let i = 0; i < 60 && !centers; i++) {
      centers = getCenters();
      if (!centers) await new Promise(r => requestAnimationFrame(r));
    }
    if (!centers) return;

    const n = centers.length / 3;
    const stepN = Math.max(1, Math.floor(n / 60000));
    const xs = [], ys = [], zs = [];
    for (let i = 0; i < n; i += stepN) {
      xs.push(centers[i * 3]); ys.push(centers[i * 3 + 1]); zs.push(centers[i * 3 + 2]);
    }
    const pct = 0.025;
    const q = (arr, t) => {
      arr.sort((a, b) => a - b);
      return arr[Math.min(arr.length - 1, Math.max(0, Math.floor(t * (arr.length - 1))))];
    };
    const lo = new Vec3(q(xs, pct), q(ys, pct), q(zs, pct));
    const hi = new Vec3(q(xs, 1 - pct), q(ys, 1 - pct), q(zs, 1 - pct));

    let center = new Vec3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
    center = splatEntity.getWorldTransform().transformPoint(center.clone());
    const r = Math.max((hi.x - lo.x) / 2, (hi.y - lo.y) / 2, (hi.z - lo.z) / 2, 0.5);
    const dist = r * 2.4;
    const dir = new Vec3(0.8, 0.5, 0.8).normalize();
    const camPos = new Vec3(center.x + dir.x * dist, center.y + dir.y * dist, center.z + dir.z * dist);
    if (cc) {
      cc.reset(center, camPos);
    } else {
      camera.setPosition(camPos);
      camera.lookAt(center.x, center.y, center.z);
    }
  }

  // ---------- Walking-mode glue ----------

  let walkingMode = null;
  let pivotRotationOnEnter = null;
  let lockChangeHandler = null;
  let useMeshCollider = false;  // sticky preference, applied on every walking-enter
  const walkEnterListeners = [];
  const walkExitListeners = [];
  const walkModeListeners = [];
  const walkEyeListeners = [];

  async function enterWalking(input) {
    if (walkingMode) return false;
    if (!splatEntity || !splatPivot) throw new Error('no-splat-loaded');
    autoOrbit = false;
    pivotRotationOnEnter = splatPivot.getRotation().clone();
    splatPivot.setEulerAngles(0, 0, 0);

    const { heightmapFromSplat, WalkingMode } = await import('./walking.js');
    const hm = heightmapFromSplat(splatEntity, splatPivot);
    if (!hm) {
      // No usable bounds — abort cleanly and restore the orbit pose.
      splatPivot.setRotation(pivotRotationOnEnter);
      pivotRotationOnEnter = null;
      autoOrbit = true;
      throw new Error('heightmap-build-failed');
    }
    if (hm.source === 'aabb') {
      console.warn('[walking] splat positions unavailable — using flat-floor fallback');
    }

    if (cc) cc.enabled = false;
    try { await canvas.requestPointerLock?.(); } catch { /* desktop without lock — fine */ }
    // input device wiring is owned by the caller (app.js) — viewer just consumes.

    lockChangeHandler = () => {
      if (document.pointerLockElement !== canvas && walkingMode) {
        // Don't auto-exit walking if the collision editor deliberately
        // released the lock for brush work.
        if (collisionMode && collisionMode._lockReleasedForBrush) return;
        exitWalking(input);
      }
    };
    document.addEventListener('pointerlockchange', lockChangeHandler);

    walkingMode = new WalkingMode({
      app, camera, splatBounds: hm.bounds, heightmap: hm.heightmap,
      input, onExit: () => exitWalking(input),
      onModeChange: (m) => {
        for (const fn of walkModeListeners) {
          try { fn(m); } catch (e) { console.error(e); }
        }
      },
      onEyeChange: (v) => {
        for (const fn of walkEyeListeners) {
          try { fn(v); } catch (e) { console.error(e); }
        }
      },
    });
    walkingMode.enter();
    applyWalkingColliderPreference();
    for (const fn of walkEnterListeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
    return true;
  }

  function applyWalkingColliderPreference() {
    if (!walkingMode) return;
    if (useMeshCollider && collisionMode) {
      const strat = collisionMode.getCollider();
      if (strat) { walkingMode.setCollider(strat); return; }
    }
    walkingMode.setCollider(null); // back to heightmap default
  }

  function setUseMeshCollider(on) {
    useMeshCollider = !!on;
    applyWalkingColliderPreference();
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
    if (cc) cc.enabled = true;
    if (pivotRotationOnEnter && splatPivot) {
      splatPivot.setRotation(pivotRotationOnEnter);
      pivotRotationOnEnter = null;
    }
    for (const fn of walkExitListeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  // ---------- Collision-editor glue ----------

  let collisionMode = null;
  const collisionEnterListeners = [];
  const collisionExitListeners = [];
  const collisionBuiltListeners = [];

  async function enterCollisionEditor() {
    if (collisionMode) return false;
    if (!splatEntity) throw new Error('no-splat-loaded');
    const [{ CollisionMode }, { splatWorldGeometry }] = await Promise.all([
      import('./collision/collision-mode.js'),
      import('./walking.js'),
    ]);
    collisionMode = new CollisionMode({
      app, camera, splatEntity, splatPivot,
      getSplatPositions: () => splatWorldGeometry(splatEntity, splatPivot),
    });
    collisionMode.onBuilt((info) => {
      // If walking-mode is up and prefers mesh, the BVH just got rebuilt —
      // hand the fresh one over.
      applyWalkingColliderPreference();
      for (const fn of collisionBuiltListeners) {
        try { fn(info); } catch (e) { console.error(e); }
      }
    });
    for (const fn of collisionEnterListeners) {
      try { fn({ mode: collisionMode }); } catch (e) { console.error(e); }
    }
    return true;
  }

  function exitCollisionEditor() {
    if (!collisionMode) return;
    collisionMode.destroy();
    collisionMode = null;
    for (const fn of collisionExitListeners) {
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
    onWalkingModeChange(fn) { walkModeListeners.push(fn); },
    onWalkingEyeChange(fn) { walkEyeListeners.push(fn); },
    enterCollisionEditor,
    exitCollisionEditor,
    isCollisionEditor() { return collisionMode != null; },
    getCollisionMode() { return collisionMode; },
    onCollisionEnter(fn) { collisionEnterListeners.push(fn); },
    onCollisionExit(fn) { collisionExitListeners.push(fn); },
    onCollisionMeshBuilt(fn) { collisionBuiltListeners.push(fn); },
    setUseMeshCollider,
    isUsingMeshCollider() { return useMeshCollider; },
    unsupported: false
  };
}
