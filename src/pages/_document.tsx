import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Instant-playback warmup: the universal embed tier (2Embed default,
            VidLink fallback) is where every title plays from. Their TLS
            handshake alone costs ~0.8–1.4s when it only starts as the iframe
            mounts, so preconnect on every page keeps the socket warm — the
            watch-page iframe then starts loading on frame one. */}
        <link rel="preconnect" href="https://www.2embed.cc" />
        <link rel="dns-prefetch" href="https://www.2embed.cc" />
        <link rel="preconnect" href="https://vidlink.pro" />
        <link rel="dns-prefetch" href="https://vidlink.pro" />
        {/* Installable shell: the offline service worker (next-pwa) is
            disabled for build stability, but the manifest + icons give mobile
            browsers the standalone home-screen install. */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0e1a" />
        <link rel="icon" href="/images/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
