# Client deliveries

Hosted client splats for the service. Drop a compressed `<name>.sog` here and
share a walkable link:

```
https://jkaindl.codeberg.page/autosplat-viewer/viewer.html?src=c/<name>.sog
```

The viewer loads the splat, **auto-frames** it (percentile bounds over the
splat centers, so floaters don't wreck the framing), and enables orbit + walk.

Notes:
- Keep filenames URL-safe (lowercase, hyphens).
- `.sog` files are large — prune deliveries that are no longer needed so the
  Pages repo doesn't bloat.
- Compress a Brush PLY with: `npx -y @playcanvas/splat-transform <in.ply> <name>.sog`.
