/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HYPEBOND_ADDRESS?: string;
  readonly VITE_GENLAYER_NETWORK?: string;
  readonly VITE_PRIVY_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
