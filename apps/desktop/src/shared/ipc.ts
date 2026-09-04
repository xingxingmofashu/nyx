/** IPC channel names shared between main, preload, and renderer. */
export const IPC = {
  tasks: {
    textGeneration: {
      send: "text-generation:send",
      abort: "text-generation:abort",
      /** main → renderer: streaming generation events. */
      event: "text-generation:event",
    },
    imageToImage: {
      run: "image-to-image:run",
    },
  },
  models: {
    list: "models:list",
    pull: "models:pull",
    /** main → renderer: download progress. */
    progress: "models:progress",
  },
  config: {
    getModelsDir: "config:getModelsDir",
  },
  window: {
    minimize: "window:minimize",
    toggleMaximize: "window:toggleMaximize",
    close: "window:close",
    /** main → renderer: the window's maximized state changed. */
    maximized: "window:maximized",
  },
} as const

export type IpcChannel =
  (typeof IPC)[keyof typeof IPC][keyof (typeof IPC)[keyof typeof IPC]]
