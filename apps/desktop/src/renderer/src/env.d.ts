/// <reference types="vite/client" />

import type { NyxApi } from "../../shared/types"

declare global {
  interface Window {
    nyx: NyxApi
  }
}

export {}
