// PWA support (next-pwa 5.6.0) is removed from the active config: its
// GenerateSW/webpack hooks destabilize the build in constrained environments
// (OOM-killed even with `disable: true`) and previously made `next dev`
// unresponsive. If you run in an environment where it works, re-enable with:
//
//   import withPWA from "next-pwa";
//   export default withPWA({
//     dest: "public",
//     register: true,
//     skipWaiting: true,
//   })({});
//
// Cap the static-generation worker pool: the default (one worker per CPU)
// OOM-killed the build in memory-constrained environments.
export default {
  experimental: {
    cpus: 2,
  },
};
