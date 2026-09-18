/// <reference types="vite/client" />

import type { NyxApi } from "./types"

declare global {
  interface Window {
    nyx: NyxApi
  }
}

export {}
